import {
  AUTO_DRAW_MS,
  BALL_MAX,
  BALL_MIN,
  CENTER_INDEX,
  CELL_COUNT,
  DEFAULT_ROUND_PATTERN,
  effectiveMarks,
  formatBall,
  HOP_IN_MS,
  matchedPatterns,
  parseMarks,
  serializeMarks,
  STARTING_MS,
  WINNER_MS,
  type WinPattern,
} from "@/lib/bingo";
import type { AppUser } from "@/lib/auth";
import type { CalledBall, MyCard, RoundState, RoundWin } from "@/lib/game-types";
import { newId } from "@/lib/ids";
import { db } from "@/lib/prisma";
import {
  findCurrentRound,
  findRoom,
  getLobbyState,
  getMyCard,
  loadCalledNumbers,
  loadPlayerCards,
  loadRound,
  loadUser,
  phaseEndsAtFor,
  RoomError,
  type CalledNumberRow,
  type PlayerCardRow,
  type RoundRow,
} from "@/lib/rooms";
import { getCartela } from "@/lib/cartelas";

function toBall(row: CalledNumberRow): CalledBall {
  return {
    value: row.value,
    order: row.order,
    label: formatBall(row.value),
    calledAt:
      row.calledAt instanceof Date
        ? row.calledAt.toISOString()
        : String(row.calledAt),
  };
}

function calledAtMs(value: Date | string) {
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function unusedBalls(called: CalledNumberRow[]) {
  const taken = new Set(called.map((row) => row.value));
  return Array.from(
    { length: BALL_MAX - BALL_MIN + 1 },
    (_, offset) => BALL_MIN + offset,
  ).filter((value) => !taken.has(value));
}

async function loadRoomById(id: string) {
  return db.orm.Room.where({ id }).first() as Promise<{
    id: string;
    code: string;
    status: string;
  } | null>;
}

type WinRow = {
  id: string;
  userId: string;
  playerCardId: string;
  pattern: string;
  claimedAt: Date | string;
};

function claimedAtIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

async function loadWins(roundId: string): Promise<RoundWin[]> {
  const rows = (await db.orm.Win.where({ roundId }).all()) as WinRow[];

  const wins: RoundWin[] = [];
  for (const row of rows) {
    const user = await loadUser(row.userId);
    const card = (await db.orm.PlayerCard.where({ id: row.playerCardId }).first()) as
      | PlayerCardRow
      | null;
    const cartela = card ? await getCartela(card.cartelaId) : null;
    wins.push({
      id: row.id,
      userId: row.userId,
      firstName: user?.firstName ?? "Player",
      photoUrl: user?.photoUrl ?? null,
      pattern: row.pattern,
      patterns: row.pattern.split(",").filter(Boolean) as WinPattern[],
      claimedAt: claimedAtIso(row.claimedAt),
      cartelaIndex: cartela?.index ?? null,
      cells: cartela?.cells ?? null,
    });
  }
  return wins.sort(
    (left, right) => Date.parse(left.claimedAt) - Date.parse(right.claimedAt),
  );
}

function isLocked(error: unknown) {
  return error instanceof Error && /locked|SQLITE_BUSY/i.test(error.message);
}

async function withLockRetry<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (!isLocked(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)));
    }
  }
  throw last;
}

async function setRoundStatus(
  roundId: string,
  data: Record<string, unknown>,
) {
  await withLockRetry(() => db.orm.Round.where({ id: roundId }).update(data));
}

async function createPendingRound(roomId: string) {
  const round = (await db.orm.Round.create({
    id: newId(),
    roomId,
    status: "pending",
    pattern: DEFAULT_ROUND_PATTERN,
  })) as RoundRow;

  await withLockRetry(() =>
    db.orm.Room.where({ id: roomId }).update({ status: "waiting" }),
  );

  return round;
}

/**
 * Drive hop-in → starting → drawing → auto next round from any client poll.
 */
export async function advanceRound(roundId: string): Promise<RoundRow | null> {
  const round = await loadRound(roundId);
  if (!round) return null;

  const now = Date.now();

  if (round.status === "pending") {
    const hopEnd = round.hopInEndsAt ? calledAtMs(round.hopInEndsAt) : 0;
    if (!hopEnd || now < hopEnd) return round;

    const cards = await loadPlayerCards(roundId);
    if (cards.length === 0) {
      // Reset hop-in so the next claim starts a fresh window.
      await setRoundStatus(roundId, { hopInEndsAt: null });
      return { ...round, hopInEndsAt: null };
    }

    const startingEndsAt = new Date(now + STARTING_MS);
    await setRoundStatus(roundId, {
      status: "starting",
      startingEndsAt,
    });
    return { ...round, status: "starting", startingEndsAt };
  }

  if (round.status === "starting") {
    const startEnd = round.startingEndsAt ? calledAtMs(round.startingEndsAt) : 0;
    if (!startEnd || now < startEnd) return round;

    await setRoundStatus(roundId, {
      status: "drawing",
      startedAt: new Date(),
    });
    await withLockRetry(() =>
      db.orm.Room.where({ id: round.roomId }).update({ status: "playing" }),
    );

    try {
      await drawNextNumber(roundId, { force: true });
    } catch {
      // First ball optional on race.
    }

    return { ...round, status: "drawing", startedAt: new Date() };
  }

  if (round.status === "drawing") {
    try {
      await drawNextNumber(roundId, { force: false });
    } catch (error) {
      if (
        error instanceof RoomError &&
        /every number has already been called/i.test(error.message)
      ) {
        await setRoundStatus(roundId, {
          status: "finished",
          endedAt: new Date(),
        });
        await withLockRetry(() =>
          db.orm.Room.where({ id: round.roomId }).update({ status: "finished" }),
        );
        return { ...round, status: "finished", endedAt: new Date() };
      }
      // No ball due yet — ignore.
    }
    return loadRound(roundId);
  }

  if (round.status === "finished") {
    const ended = round.endedAt ? calledAtMs(round.endedAt) : 0;
    if (!ended || now - ended < WINNER_MS) return round;

    // Auto-start the next pending round for this room.
    const current = await findCurrentRound(round.roomId);
    if (current && current.id !== round.id && current.status !== "finished") {
      return current;
    }

    await createPendingRound(round.roomId);
    return loadRound(roundId);
  }

  return round;
}

export async function getRoundState(
  roundId: string,
  me: AppUser,
  options: { settle?: boolean } = {},
): Promise<RoundState> {
  if (options.settle !== false) {
    await advanceRound(roundId);
  }

  // After auto next-round, the requested id may be finished; prefer live round.
  let round = await loadRound(roundId);
  if (!round) throw new RoomError("Round not found", 404);

  if (round.status === "finished") {
    const live = await findCurrentRound(round.roomId);
    if (live && live.id !== round.id) {
      round = live;
    }
  }

  // Advance again in case we switched to a new pending round mid-call.
  if (options.settle !== false && round.id !== roundId) {
    await advanceRound(round.id);
    round = (await loadRound(round.id)) ?? round;
  }

  const room = await loadRoomById(round.roomId);
  if (!room) throw new RoomError("Room not found", 404);

  const [cards, called, myCard, wins] = await Promise.all([
    loadPlayerCards(round.id),
    loadCalledNumbers(round.id),
    getMyCard(round.id, me.id),
    loadWins(round.id),
  ]);

  const players = [];
  for (const card of cards) {
    const user = await loadUser(card.userId);
    if (!user) continue;
    const cartela = await getCartela(card.cartelaId);
    players.push({
      id: user.id,
      firstName: user.firstName,
      username: user.username,
      photoUrl: user.photoUrl,
      cartelaId: card.cartelaId,
      cartelaIndex: cartela?.index ?? null,
      disqualified: Boolean(card.disqualified),
    });
  }

  const mePlayer = {
    id: me.id,
    firstName: me.firstName,
    username: me.username,
    photoUrl: me.photoUrl,
    cartelaId: myCard?.cartelaId ?? null,
    cartelaIndex: myCard?.index ?? null,
    disqualified: myCard?.disqualified ?? false,
  };

  if (!players.some((player) => player.id === me.id)) {
    players.unshift(mePlayer);
  }

  const balls = called.map(toBall);
  const checkingUntil =
    round.status === "finished" && round.endedAt
      ? new Date(calledAtMs(round.endedAt) + WINNER_MS).toISOString()
      : null;

  return {
    room: { id: room.id, code: room.code, status: room.status },
    round: {
      id: round.id,
      status: round.status,
      pattern: round.pattern as WinPattern,
      phaseEndsAt: phaseEndsAtFor(round),
    },
    calledNumbers: balls,
    lastCalled: balls.at(-1) ?? null,
    players,
    me: players.find((player) => player.id === me.id) ?? mePlayer,
    myCard,
    wins: round.status === "finished" || wins.length > 0 ? wins : [],
    checkingUntil,
  };
}

export async function startRound(roundId: string, me: AppUser) {
  // Compatibility: advancing handles auto start; ensure hop-in exists if claimed.
  const round = await loadRound(roundId);
  if (!round) throw new RoomError("Round not found", 404);

  if (round.status === "pending" && !round.hopInEndsAt) {
    const cards = await loadPlayerCards(roundId);
    if (cards.length === 0) {
      throw new RoomError("At least one cartela must be claimed first", 400);
    }
    await setRoundStatus(roundId, {
      hopInEndsAt: new Date(Date.now() + HOP_IN_MS),
    });
  }

  await advanceRound(roundId);
  return getRoundState(roundId, me);
}

export async function drawNextNumber(
  roundId: string,
  options: { force?: boolean } = {},
) {
  const drawn = await withLockRetry<CalledNumberRow | null>(() =>
    db.transaction(async (tx) => {
      const round = (await tx.orm.Round.where({ id: roundId }).first()) as
        | RoundRow
        | null;
      if (!round) throw new RoomError("Round not found", 404);
      if (round.status !== "drawing") {
        throw new RoomError("Numbers are only drawn while the round is live", 409);
      }

      // Take a write lock on the round row so concurrent polls cannot race draws.
      await tx.orm.Round.where({ id: roundId }).update({
        status: "drawing",
      });

      const called = (
        (await tx.orm.CalledNumber.where({ roundId }).all()) as CalledNumberRow[]
      ).sort((left, right) => left.order - right.order);

      const last = called.at(-1);
      if (
        !options.force &&
        last &&
        Date.now() - calledAtMs(last.calledAt) < AUTO_DRAW_MS
      ) {
        return null;
      }

      const pool = unusedBalls(called);
      if (pool.length === 0) {
        throw new RoomError("Every number has already been called", 409);
      }

      const value = pool[Math.floor(Math.random() * pool.length)]!;
      const row = (await tx.orm.CalledNumber.create({
        id: newId(),
        roundId,
        value,
        order: called.length + 1,
        calledAt: new Date(),
      })) as CalledNumberRow;
      return row;
    }),
  );

  return drawn ? toBall(drawn) : null;
}

export async function drawRound(roundId: string, me: AppUser, force = false) {
  await advanceRound(roundId);
  const drawn = force
    ? await drawNextNumber(roundId, { force: true })
    : await drawNextNumber(roundId, { force: false });
  const state = await getRoundState(roundId, me, { settle: false });
  return { drawn, ...state };
}

export async function markCell(
  roundId: string,
  me: AppUser,
  cellIndex: number,
): Promise<MyCard> {
  await advanceRound(roundId);

  if (
    !Number.isInteger(cellIndex) ||
    cellIndex < 0 ||
    cellIndex >= CELL_COUNT
  ) {
    throw new RoomError("Invalid cell", 400);
  }

  const round = await loadRound(roundId);
  if (!round) throw new RoomError("Round not found", 404);
  if (round.status !== "drawing") {
    throw new RoomError("You can only mark during the draw", 409);
  }

  const card = (await db.orm.PlayerCard.where({
    roundId,
    userId: me.id,
  }).first()) as PlayerCardRow | null;
  if (!card) throw new RoomError("Claim a cartela first", 400);
  if (card.disqualified) {
    throw new RoomError("INVALID Bingo", 403);
  }

  const cartela = await getCartela(card.cartelaId);
  if (!cartela) throw new RoomError("Cartela not found", 404);

  const marks = parseMarks(card.marks);
  if (cellIndex === CENTER_INDEX) {
    const next = await getMyCard(roundId, me.id);
    if (!next) throw new RoomError("Could not load card", 500);
    return next;
  }

  marks[cellIndex] = !marks[cellIndex];
  marks[CENTER_INDEX] = true;

  await withLockRetry(() =>
    db.orm.PlayerCard.where({ id: card.id }).update({
      marks: serializeMarks(marks),
    } as { marks: string }),
  );

  const next = await getMyCard(roundId, me.id);
  if (!next) throw new RoomError("Could not load card", 500);
  return next;
}

export async function claimBingo(roundId: string, me: AppUser) {
  await advanceRound(roundId);

  const round = await loadRound(roundId);
  if (!round) throw new RoomError("Round not found", 404);
  if (round.status !== "drawing") {
    throw new RoomError("Bingo can only be claimed while drawing", 409);
  }

  const card = await getMyCard(roundId, me.id);
  if (!card) throw new RoomError("Claim a cartela before shouting bingo", 400);
  if (card.disqualified) {
    throw new RoomError("INVALID Bingo", 403);
  }

  const called = await loadCalledNumbers(roundId);
  const counted = effectiveMarks(
    card.cells,
    card.marked,
    called.map((row) => row.value),
  );
  const matched = matchedPatterns(counted, round.pattern);
  if (matched.length === 0) {
    await withLockRetry(() =>
      db.orm.PlayerCard.where({ id: card.id }).update({ disqualified: 1 } as {
        disqualified: number;
      }),
    );
    throw new RoomError("INVALID Bingo", 400);
  }

  try {
    await withLockRetry(() =>
      db.transaction(async (tx) => {
        const live = (await tx.orm.Round.where({ id: roundId }).first()) as
          | RoundRow
          | null;
        if (!live) throw new RoomError("Round not found", 404);
        if (live.status !== "drawing") {
          throw new RoomError("Round already finished", 409);
        }

        const existing = (await tx.orm.Win.where({ roundId }).all()) as WinRow[];
        if (existing.some((win) => win.userId === me.id)) return;

        await tx.orm.Win.create({
          id: newId(),
          roundId,
          userId: me.id,
          playerCardId: card.id,
          pattern: matched.join(","),
        });
        await tx.orm.Round.where({ id: roundId }).update({
          status: "finished",
          endedAt: new Date(),
        });
        await tx.orm.Room.where({ id: live.roomId }).update({
          status: "finished",
        });
      }),
    );
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError("Could not record bingo", 409);
  }

  return getRoundState(roundId, me, { settle: false });
}

export async function startNewRound(idOrCode: string, me: AppUser) {
  const room = await findRoom(idOrCode);
  if (!room) throw new RoomError("Room not found", 404);

  const current = await findCurrentRound(room.id);
  if (current?.status === "drawing" || current?.status === "starting") {
    throw new RoomError("Finish the current round first", 409);
  }
  if (current?.status === "pending") {
    await advanceRound(current.id);
    const refreshed = (await loadRound(current.id)) ?? current;
    return getLobbyState(room, refreshed, me);
  }

  if (current?.status === "finished") {
    const ended = current.endedAt ? calledAtMs(current.endedAt) : 0;
    // Allow manual skip of winner display.
    if (ended && Date.now() - ended < WINNER_MS) {
      // Force next round early.
    }
  }

  const round = await createPendingRound(room.id);
  return getLobbyState({ ...room, status: "waiting" }, round, me);
}

export { HOP_IN_MS, STARTING_MS, WINNER_MS };
