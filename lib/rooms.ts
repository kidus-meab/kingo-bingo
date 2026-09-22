import {
  DEFAULT_ROOM_CODE,
  DEFAULT_ROUND_PATTERN,
  marksForCells,
  type WinPattern,
} from "@/lib/bingo";
import { getCartela, getCartelas } from "@/lib/cartelas";
import type {
  LobbyState,
  MyCard,
  PlayerSummary,
  RoundCartela,
} from "@/lib/game-types";
import { newId } from "@/lib/ids";
import { db } from "@/lib/prisma";
import type { AppUser } from "@/lib/auth";

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
};

export type RoundRow = {
  id: string;
  roomId: string;
  status: string;
  pattern: string;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
};

export type PlayerCardRow = {
  id: string;
  roundId: string;
  userId: string;
  cartelaId: string;
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
  const value = row as Partial<AppUser>;
  if (typeof value.id !== "string" || typeof value.firstName !== "string") {
    return null;
  }
  return {
    id: value.id,
    telegramId: String(value.telegramId ?? ""),
    firstName: value.firstName,
    username: value.username ?? null,
    photoUrl: value.photoUrl ?? null,
  };
}

function toPlayer(user: AppUser, cartelaId: string | null, cartelaIndex: number | null) {
  return {
    id: user.id,
    firstName: user.firstName,
    username: user.username,
    photoUrl: user.photoUrl,
    cartelaId,
    cartelaIndex,
  };
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

export async function getLobbyState(
  room: RoomRow,
  round: RoundRow,
  me: AppUser,
): Promise<LobbyState> {
  const cards = await loadPlayerCards(round.id);
  const players: PlayerSummary[] = [];

  for (const card of cards) {
    const user = await loadUser(card.userId);
    if (!user) continue;
    const cartela = await getCartela(card.cartelaId);
    players.push(toPlayer(user, card.cartelaId, cartela?.index ?? null));
  }

  const mine = players.find((player) => player.id === me.id);
  if (!mine) {
    players.unshift(toPlayer(me, null, null));
  }

  return {
    room: { id: room.id, code: room.code, status: room.status },
    round: {
      id: round.id,
      status: round.status,
      pattern: round.pattern as WinPattern,
    },
    players,
    me: mine ?? toPlayer(me, null, null),
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
    taken.set(card.cartelaId, toPlayer(user, card.cartelaId, cartela?.index ?? null));
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

  const called = await loadCalledNumbers(roundId);

  return {
    id: card.id,
    roundId: card.roundId,
    cartelaId: card.cartelaId,
    index: cartela.index,
    cells: cartela.cells,
    marked: marksForCells(
      cartela.cells,
      called.map((row) => row.value),
    ),
  };
}

export async function claimCartela(
  roundId: string,
  cartelaId: string,
  me: AppUser,
) {
  const round = (await db.orm.Round.where({ id: roundId }).first()) as
    | RoundRow
    | null;
  if (!round) throw new RoomError("Round not found", 404);
  if (round.status !== "pending") {
    throw new RoomError("Cartelas can only be changed before the round starts", 409);
  }

  const cartela = await getCartela(cartelaId);
  if (!cartela) throw new RoomError("Cartela not found", 404);

  const cards = await loadPlayerCards(roundId);
  const mine = cards.find((card) => card.userId === me.id);
  const taken = cards.find((card) => card.cartelaId === cartelaId);

  if (taken && taken.userId !== me.id) {
    throw new RoomError("That cartela is already taken", 409);
  }

  if (mine && mine.cartelaId === cartelaId) {
    return getMyCard(roundId, me.id);
  }

  try {
    await db.transaction(async (tx: typeof db) => {
      if (mine) {
        await tx.orm.PlayerCard.where({ id: mine.id }).delete();
      }

      await tx.orm.PlayerCard.create({
        id: newId(),
        roundId,
        userId: me.id,
        cartelaId,
      });
    });
  } catch {
    throw new RoomError("That cartela is already taken", 409);
  }

  const claimed = await getMyCard(roundId, me.id);
  if (!claimed) throw new RoomError("Could not claim cartela", 500);
  return claimed;
}

