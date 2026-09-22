import {
  AUTO_DRAW_MS,
  BALL_MAX,
  BALL_MIN,
  CO_WIN_MS,
  DEFAULT_ROUND_PATTERN,
  formatBall,
  matchedPatterns,
  type WinPattern,
} from "@/lib/bingo";
import type { AppUser } from "@/lib/auth";
import type { CalledBall, RoundState, RoundWin } from "@/lib/game-types";
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
  RoomError,
  type CalledNumberRow,
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
    wins.push({
      id: row.id,
      userId: row.userId,
      firstName: user?.firstName ?? "Player",
      photoUrl: user?.photoUrl ?? null,
      pattern: row.pattern,
      patterns: row.pattern.split(",").filter(Boolean) as WinPattern[],
      claimedAt: claimedAtIso(row.claimedAt),
    });
  }
  return wins.sort(
    (left, right) => Date.parse(left.claimedAt) - Date.parse(right.claimedAt),
  );
}

function firstWinMs(wins: RoundWin[]) {
  return wins[0] ? Date.parse(wins[0].claimedAt) : 0;
}

export async function settleRoundIfDue(roundId: string) {
  const round = await loadRound(roundId);
  if (!round || round.status !== "checking") return round;

  const wins = await loadWins(roundId);
  const started = firstWinMs(wins);
  if (started && Date.now() - started >= CO_WIN_MS) {
    await setRoundStatus(roundId, {
      status: "finished",
      endedAt: new Date(),
    });
    return { ...round, status: "finished" };
  }

  return round;
}

export async function getRoundState(
  roundId: string,
  me: AppUser,
  options: { settle?: boolean } = {},
): Promise<RoundState> {
  const settled =
    options.settle === false ? await loadRound(roundId) : await settleRoundIfDue(roundId);
  const round = settled ?? (await loadRound(roundId));
  if (!round) throw new RoomError("Round not found", 404);
  const room = await loadRoomById(round.roomId);
  if (!room) throw new RoomError("Room not found", 404);

  const [cards, called, myCard, wins] = await Promise.all([
    loadPlayerCards(roundId),
    loadCalledNumbers(roundId),
    getMyCard(roundId, me.id),
    loadWins(roundId),
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
    });
  }

  const mePlayer = {
    id: me.id,
    firstName: me.firstName,
    username: me.username,
    photoUrl: me.photoUrl,
    cartelaId: myCard?.cartelaId ?? null,
    cartelaIndex: myCard?.index ?? null,
  };

  if (!players.some((player) => player.id === me.id)) {
    players.unshift(mePlayer);
  }

  const balls = called.map(toBall);
  const checkingUntil =
    round.status === "checking" && wins[0]
      ? new Date(Date.parse(wins[0].claimedAt) + CO_WIN_MS).toISOString()
      : null;

  return {
    room: { id: room.id, code: room.code, status: room.status },
    round: {
      id: round.id,
      status: round.status,
      pattern: round.pattern as WinPattern,
    },
    calledNumbers: balls,
    lastCalled: balls.at(-1) ?? null,
    players,
    me: players.find((player) => player.id === me.id) ?? mePlayer,
    myCard,
    wins,
    checkingUntil,
  };
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

export async function startRound(roundId: string, me: AppUser) {
  const round = await loadRound(roundId);
  if (!round) throw new RoomError("Round not found", 404);

  if (round.status === "checking") {
    throw new RoomError("This round is checking winners", 409);
  }
  if (round.status === "drawing") {
    return getRoundState(roundId, me);
  }
  if (round.status === "finished") {
    throw new RoomError("This round has already finished", 409);
  }
  if (round.status !== "pending") {
    throw new RoomError("Round cannot be started", 409);
  }

  const cards = await loadPlayerCards(roundId);
  if (cards.length === 0) {
    throw new RoomError("At least one cartela must be claimed first", 400);
  }

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
    // First ball is optional if the draw races; state still returns drawing.
  }

  return getRoundState(roundId, me);
}

export async function drawNextNumber(
  roundId: string,
  options: { force?: boolean } = {},
) {
  const drawn = await withLockRetry<CalledNumberRow | null>(() =>
    db.transaction(async (tx: typeof db) => {
    const round = (await tx.orm.Round.where({ id: roundId }).first()) as
      | RoundRow
      | null;
    if (!round) throw new RoomError("Round not found", 404);
    if (round.status === "checking") {
      throw new RoomError("Waiting for co-winners", 409);
    }
    if (round.status !== "drawing") {
      throw new RoomError("Numbers are only drawn while the round is live", 409);
    }

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
    })) as CalledNumberRow;
    return row;
    }),
  );

  return drawn ? toBall(drawn) : null;
}

export async function drawRound(roundId: string, me: AppUser, force = false) {
  const drawn = await drawNextNumber(roundId, { force });
  const state = await getRoundState(roundId, me);
  return { drawn, ...state };
}

// First valid bingo sets status to "checking" and stops draws. Any other
// valid bingo for the same called set within CO_WIN_MS is stored as a
// co-winner. State fetches finish the round after that window.
export async function claimBingo(roundId: string, me: AppUser) {
  await settleRoundIfDue(roundId);

  const round = await loadRound(roundId);
  if (!round) throw new RoomError("Round not found", 404);

  const card = await getMyCard(roundId, me.id);
  if (!card) throw new RoomError("Claim a cartela before shouting bingo", 400);

  const matched = matchedPatterns(card.marked, round.pattern);
  if (matched.length === 0) {
    throw new RoomError("Not a valid bingo yet", 400);
  }

  try {
    await withLockRetry(() =>
      db.transaction(async (tx: typeof db) => {
        const live = (await tx.orm.Round.where({ id: roundId }).first()) as
          | RoundRow
          | null;
        if (!live) throw new RoomError("Round not found", 404);

        const existing = (
          (await tx.orm.Win.where({ roundId }).all()) as WinRow[]
        ).sort(
          (left, right) =>
            calledAtMs(left.claimedAt) - calledAtMs(right.claimedAt),
        );
        if (existing.some((win) => win.userId === me.id)) return;

        if (live.status === "drawing") {
          await tx.orm.Win.create({
            id: newId(),
            roundId,
            userId: me.id,
            playerCardId: card.id,
            pattern: matched.join(","),
          });
          await tx.orm.Round.where({ id: roundId }).update({
            status: "checking",
          });
          return;
        }

        const first = existing[0];
        const stillOpen =
          Boolean(first) && Date.now() - calledAtMs(first.claimedAt) < CO_WIN_MS;

        if (live.status === "checking" || (live.status === "finished" && stillOpen)) {
          await tx.orm.Win.create({
            id: newId(),
            roundId,
            userId: me.id,
            playerCardId: card.id,
            pattern: matched.join(","),
          });
          return;
        }

        throw new RoomError("Round already finished", 409);
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
  if (current?.status === "checking") {
    const settled = await settleRoundIfDue(current.id);
    if (settled?.status === "checking") {
      throw new RoomError("Wait for co-winners to finish", 409);
    }
  } else if (current?.status === "drawing") {
    throw new RoomError("Finish the current round first", 409);
  } else if (current?.status === "pending") {
    return getLobbyState(room, current, me);
  }

  const round = (await db.orm.Round.create({
    id: newId(),
    roomId: room.id,
    status: "pending",
    pattern: DEFAULT_ROUND_PATTERN,
  })) as RoundRow;

  await withLockRetry(() =>
    db.orm.Room.where({ id: room.id }).update({ status: "waiting" }),
  );

  return getLobbyState({ ...room, status: "waiting" }, round, me);
}
