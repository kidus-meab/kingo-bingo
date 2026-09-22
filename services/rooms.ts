import {
  DEFAULT_ROOM_CODE,
  DEFAULT_ROUND_PATTERN,
  DEFAULT_STAKE_BIRR,
  emptyMarks,
  HOP_IN_MS,
  parseMarks,
  serializeMarks,
  WINNER_MS,
  type WinPattern,
} from "@/lib/bingo";
import { getCartela, getCartelas } from "@/services/cartelas";
import type {
  LobbyState,
  MyCard,
  PlayerSummary,
  RoundCartela,
} from "@/types/game";
import { newId } from "@/lib/ids";
import { db } from "@/lib/prisma";
import type { AppUser } from "@/services/auth";
import { getUserBalance } from "@/services/users";

export type { LobbyState, MyCard, PlayerSummary, RoundCartela };

export class RoomError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RoomError";
    this.status = status;
  }
}

export type RoomRow = {
  id: string;
  code: string;
  status: string;
  stake?: number | null;
};

export type RoundRow = {
  id: string;
  roomId: string;
  status: string;
  pattern: string;
  hopInEndsAt?: Date | string | null;
  startingEndsAt?: Date | string | null;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
};

export type PlayerCardRow = {
  id: string;
  roundId: string;
  userId: string;
  cartelaId: string;
  marks?: string | null;
  disqualified?: number | null;
  stakePaid?: number | null;
};

export type CalledNumberRow = {
  id: string;
  roundId: string;
  value: number;
  order: number;
  calledAt: Date | string;
};

function asUser(row: unknown): AppUser | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Partial<AppUser> & { balance?: number | null };
  if (typeof value.id !== "string" || typeof value.firstName !== "string") {
    return null;
  }
  return {
    id: value.id,
    telegramId: String(value.telegramId ?? ""),
    firstName: value.firstName,
    username: value.username ?? null,
    photoUrl: value.photoUrl ?? null,
    balance: Number(value.balance ?? 0),
  };
}

function toPlayer(
  user: AppUser,
  cartelaId: string | null,
  cartelaIndex: number | null,
  disqualified = false,
): PlayerSummary {
  return {
    id: user.id,
    firstName: user.firstName,
    username: user.username,
    photoUrl: user.photoUrl,
    cartelaId,
    cartelaIndex,
    disqualified,
    balance: user.balance,
  };
}

export function roomStake(room: RoomRow) {
  const stake = Number(room.stake ?? DEFAULT_STAKE_BIRR);
  return Number.isFinite(stake) && stake > 0 ? stake : DEFAULT_STAKE_BIRR;
}

export function potFromCards(cards: PlayerCardRow[]) {
  return cards.reduce((sum, card) => sum + Number(card.stakePaid ?? 0), 0);
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

export function phaseEndsAtFor(round: RoundRow): string | null {
  if (round.status === "pending") return toIso(round.hopInEndsAt);
  if (round.status === "starting") return toIso(round.startingEndsAt);
  if (round.status === "finished") {
    const ended = toIso(round.endedAt);
    if (!ended) return null;
    return new Date(Date.parse(ended) + WINNER_MS).toISOString();
  }
  return null;
}

export async function findRoom(idOrCode: string) {
  const value = idOrCode.trim();
  const byId = (await db.orm.Room.where({ id: value }).first()) as RoomRow | null;
  if (byId) return byId;

  return (await db.orm.Room.where({
    code: value.toUpperCase(),
  }).first()) as RoomRow | null;
}

export async function findCurrentRound(roomId: string) {
  const rounds = (await db.orm.Round.where({ roomId }).all()) as RoundRow[];
  return (
    rounds.find((round) => round.status !== "finished") ??
    rounds.at(-1) ??
    null
  );
}

export async function ensureCurrentRound(roomId: string) {
  const existing = await findCurrentRound(roomId);
  if (existing) return existing;

  return (await db.orm.Round.create({
    id: newId(),
    roomId,
    status: "pending",
    pattern: DEFAULT_ROUND_PATTERN,
  })) as RoundRow;
}

export async function loadPlayerCards(roundId: string) {
  return (await db.orm.PlayerCard.where({ roundId }).all()) as PlayerCardRow[];
}

export async function loadCalledNumbers(roundId: string) {
  const rows = (await db.orm.CalledNumber.where({ roundId }).all()) as CalledNumberRow[];
  return rows.sort((left, right) => left.order - right.order);
}

export async function loadUser(id: string) {
  return asUser(await db.orm.User.where({ id }).first());
}

export async function loadRound(id: string) {
  return (await db.orm.Round.where({ id }).first()) as RoundRow | null;
}

export type RoomListItem = {
  id: string;
  code: string;
  status: string;
  stake: number;
  players: number;
  pot: number;
  roundStatus: string | null;
};

const ROOM_CATALOG: Array<{ code: string; stake: number }> = [
  { code: DEFAULT_ROOM_CODE, stake: DEFAULT_STAKE_BIRR },
  { code: "QUICK", stake: 5 },
  { code: "GOLD", stake: 20 },
  { code: "VIP", stake: 50 },
];

async function ensureCatalogRooms() {
  for (const entry of ROOM_CATALOG) {
    const code = entry.code.trim().toUpperCase();
    const existing = (await db.orm.Room.where({ code }).first()) as RoomRow | null;
    if (!existing) {
      await db.orm.Room.create({
        id: newId(),
        code,
        status: "waiting",
        stake: entry.stake,
      } as Parameters<typeof db.orm.Room.create>[0]);
    }
    const room = (await db.orm.Room.where({ code }).first()) as RoomRow;
    await ensureCurrentRound(room.id);
  }
}

export async function listRooms(): Promise<RoomListItem[]> {
  await ensureCatalogRooms();

  const rooms = (await db.orm.Room.all()) as RoomRow[];
  const items: RoomListItem[] = [];

  for (const room of rooms) {
    const round = await findCurrentRound(room.id);
    const cards = round ? await loadPlayerCards(round.id) : [];
    items.push({
      id: room.id,
      code: room.code,
      status: room.status,
      stake: roomStake(room),
      players: cards.length,
      pot: potFromCards(cards),
      roundStatus: round?.status ?? null,
    });
  }

  return items.sort((a, b) => a.stake - b.stake || a.code.localeCompare(b.code));
}

export async function getLobbyState(
  room: RoomRow,
  round: RoundRow,
  me: AppUser,
): Promise<LobbyState> {
  const cards = await loadPlayerCards(round.id);
  const players: PlayerSummary[] = [];
  const stake = roomStake(room);
  const balance = await getUserBalance(me.id);

  for (const card of cards) {
    const user = await loadUser(card.userId);
    if (!user) continue;
    const cartela = await getCartela(card.cartelaId);
    players.push(
      toPlayer(
        user,
        card.cartelaId,
        cartela?.index ?? null,
        Boolean(card.disqualified),
      ),
    );
  }

  const meBase = { ...me, balance };
  const mine = players.find((player) => player.id === me.id);
  if (!mine) {
    players.unshift(toPlayer(meBase, null, null));
  }

  const meSummary = {
    ...(mine ?? toPlayer(meBase, null, null)),
    balance,
  };

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      stake,
    },
    round: {
      id: round.id,
      status: round.status,
      pattern: round.pattern as WinPattern,
      phaseEndsAt: phaseEndsAtFor(round),
      pot: potFromCards(cards),
    },
    players,
    me: meSummary,
  };
}

export async function joinRoom(code: string, me: AppUser) {
  const normalized = (code || DEFAULT_ROOM_CODE).trim().toUpperCase();
  const room = (await db.orm.Room.where({ code: normalized }).first()) as
    | RoomRow
    | null;
  if (!room) {
    throw new RoomError(`Room ${normalized} was not found`, 404);
  }

  const round = await ensureCurrentRound(room.id);
  return getLobbyState(room, round, me);
}

export async function getRoundCartelas(roundId: string) {
  const round = (await db.orm.Round.where({ id: roundId }).first()) as
    | RoundRow
    | null;
  if (!round) throw new RoomError("Round not found", 404);

  const [cartelas, cards] = await Promise.all([
    getCartelas(),
    loadPlayerCards(roundId),
  ]);
  const taken = new Map<string, PlayerSummary>();

  for (const card of cards) {
    const user = await loadUser(card.userId);
    if (!user) continue;
    const cartela = cartelas.find((item) => item.id === card.cartelaId);
    taken.set(
      card.cartelaId,
      toPlayer(
        user,
        card.cartelaId,
        cartela?.index ?? null,
        Boolean(card.disqualified),
      ),
    );
  }

  return cartelas.map<RoundCartela>((cartela) => ({
    ...cartela,
    takenBy: taken.get(cartela.id) ?? null,
  }));
}

export async function getMyCard(roundId: string, userId: string): Promise<MyCard | null> {
  const card = (await db.orm.PlayerCard.where({ roundId, userId }).first()) as
    | PlayerCardRow
    | null;
  if (!card) return null;

  const cartela = await getCartela(card.cartelaId);
  if (!cartela) return null;

  return {
    id: card.id,
    roundId: card.roundId,
    cartelaId: card.cartelaId,
    index: cartela.index,
    cells: cartela.cells,
    marked: parseMarks(card.marks),
    disqualified: Boolean(card.disqualified),
  };
}

export async function claimCartela(
  roundId: string,
  cartelaId: string,
  me: AppUser,
): Promise<MyCard | null> {
  const round = (await db.orm.Round.where({ id: roundId }).first()) as
    | RoundRow
    | null;
  if (!round) throw new RoomError("Round not found", 404);
  if (round.status !== "pending") {
    throw new RoomError("Cartelas can only be changed before the round starts", 409);
  }

  const room = (await db.orm.Room.where({ id: round.roomId }).first()) as
    | RoomRow
    | null;
  if (!room) throw new RoomError("Room not found", 404);
  const stake = roomStake(room);

  const cartela = await getCartela(cartelaId);
  if (!cartela) throw new RoomError("Cartela not found", 404);

  const cards = await loadPlayerCards(roundId);
  const mine = cards.find((card) => card.userId === me.id);
  const taken = cards.find((card) => card.cartelaId === cartelaId);

  if (taken && taken.userId !== me.id) {
    throw new RoomError("That cartela is already taken", 409);
  }

  if (mine && mine.cartelaId === cartelaId) {
    const refund = Number(mine.stakePaid ?? stake);
    await db.transaction(async (tx) => {
      await tx.orm.PlayerCard.where({ id: mine.id }).delete();
      if (refund > 0) {
        const user = (await tx.orm.User.where({ id: me.id }).first()) as {
          balance?: number | null;
        } | null;
        const balance = Number(user?.balance ?? 0) + refund;
        await tx.orm.User.where({ id: me.id }).update({
          balance,
        } as { balance: number });
      }
    });
    const remaining = await loadPlayerCards(roundId);
    if (remaining.length === 0 && round.hopInEndsAt) {
      await db.orm.Round.where({ id: roundId }).update({
        hopInEndsAt: null,
      } as { hopInEndsAt: null });
    }
    return null;
  }

  const marks = serializeMarks(emptyMarks());
  const switching = Boolean(mine);
  const carriedStake = switching ? Number(mine!.stakePaid ?? stake) : stake;

  if (!switching) {
    const balance = await getUserBalance(me.id);
    if (balance < stake) {
      throw new RoomError(
        `Need ${stake} Br to join (balance ${balance} Br)`,
        400,
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (mine) {
        await tx.orm.PlayerCard.where({ id: mine.id }).delete();
      } else {
        const user = (await tx.orm.User.where({ id: me.id }).first()) as {
          balance?: number | null;
        } | null;
        const balance = Number(user?.balance ?? 0);
        if (balance < stake) {
          throw new RoomError(
            `Need ${stake} Br to join (balance ${balance} Br)`,
            400,
          );
        }
        await tx.orm.User.where({ id: me.id }).update({
          balance: balance - stake,
        } as { balance: number });
      }

      await tx.orm.PlayerCard.create({
        id: newId(),
        roundId,
        userId: me.id,
        cartelaId,
        marks,
        disqualified: 0,
        stakePaid: carriedStake,
      } as {
        id: string;
        roundId: string;
        userId: string;
        cartelaId: string;
        marks: string;
        disqualified: number;
        stakePaid: number;
      });

      if (!round.hopInEndsAt) {
        await tx.orm.Round.where({ id: roundId }).update({
          hopInEndsAt: new Date(Date.now() + HOP_IN_MS),
        } as { hopInEndsAt: Date });
      }
    });
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError("That cartela is already taken", 409);
  }

  const claimed = await getMyCard(roundId, me.id);
  if (!claimed) throw new RoomError("Could not claim cartela", 500);
  return claimed;
}
