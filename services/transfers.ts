import { MIN_TRANSFER_BIRR } from "@/lib/config";
import { newId } from "@/lib/ids";
import { db } from "@/lib/prisma";
import { RoomError } from "@/lib/rooms";
import { recordTransaction } from "@/lib/transactions";

export type TransferPeer = {
  id: string;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
};

export type TransferTx = {
  id: string;
  amount: number;
  direction: "in" | "out";
  peerName: string;
  peerUsername: string | null;
  createdAt: string;
};

type UserRow = {
  id: string;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
  balance?: number | null;
  telegramId?: string;
};

type TransferRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  createdAt: Date | string;
};

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

export async function listTransferPeers(meId: string): Promise<TransferPeer[]> {
  const transfers = (await db.orm.Transfer.all()) as TransferRow[];
  const sentToIds = [
    ...new Set(
      transfers
        .filter((row) => row.fromUserId === meId)
        .map((row) => row.toUserId),
    ),
  ];
  if (sentToIds.length === 0) return [];

  const users = (await db.orm.User.all()) as UserRow[];
  const byId = new Map(users.map((user) => [user.id, user]));

  return sentToIds
    .map((id) => byId.get(id))
    .filter((user): user is UserRow => Boolean(user) && user!.id !== meId)
    .map((user) => ({
      id: user.id,
      firstName: user.firstName,
      username: user.username,
      photoUrl: user.photoUrl,
    }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName));
}

export async function findUserByUsername(username: string) {
  const normalized = username.replace(/^@/, "").trim().toLowerCase();
  if (!normalized) return null;
  const users = (await db.orm.User.all()) as UserRow[];
  return (
    users.find(
      (user) => (user.username ?? "").toLowerCase() === normalized,
    ) ?? null
  );
}

export async function listTransfers(userId: string): Promise<TransferTx[]> {
  const all = (await db.orm.Transfer.all()) as TransferRow[];
  const mine = all.filter(
    (row) => row.fromUserId === userId || row.toUserId === userId,
  );
  const users = (await db.orm.User.all()) as UserRow[];
  const byId = new Map(users.map((user) => [user.id, user]));

  return mine
    .map((row) => {
      const outgoing = row.fromUserId === userId;
      const peer = byId.get(outgoing ? row.toUserId : row.fromUserId);
      return {
        id: row.id,
        amount: row.amount,
        direction: outgoing ? ("out" as const) : ("in" as const),
        peerName: peer?.firstName ?? "Player",
        peerUsername: peer?.username ?? null,
        createdAt: toIso(row.createdAt),
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function sendTransfer(
  fromUserId: string,
  input: { toUserId?: string; username?: string; amount: number },
) {
  const amount = Math.floor(Number(input.amount));
  if (!Number.isFinite(amount) || amount < MIN_TRANSFER_BIRR) {
    throw new RoomError(`Enter at least ${MIN_TRANSFER_BIRR} Br`, 400);
  }

  let toUser: UserRow | null = null;
  if (input.toUserId) {
    toUser = (await db.orm.User.where({ id: input.toUserId }).first()) as
      | UserRow
      | null;
  } else if (input.username) {
    toUser = await findUserByUsername(input.username);
  }

  if (!toUser) throw new RoomError("Recipient not found", 404);
  if (toUser.id === fromUserId) {
    throw new RoomError("You cannot send money to yourself", 400);
  }

  let transferId = "";

  await db.transaction(async (tx) => {
    const from = (await tx.orm.User.where({ id: fromUserId }).first()) as
      | UserRow
      | null;
    const to = (await tx.orm.User.where({ id: toUser!.id }).first()) as
      | UserRow
      | null;
    if (!from || !to) throw new RoomError("User not found", 404);

    const fromBalance = Number(from.balance ?? 0);
    if (fromBalance < amount) {
      throw new RoomError(
        `Insufficient balance (${fromBalance} Br)`,
        400,
      );
    }

    transferId = newId();
    await tx.orm.User.where({ id: fromUserId }).update({
      balance: fromBalance - amount,
    } as { balance: number });
    await tx.orm.User.where({ id: to.id }).update({
      balance: Number(to.balance ?? 0) + amount,
    } as { balance: number });
    await tx.orm.Transfer.create({
      id: transferId,
      fromUserId,
      toUserId: to.id,
      amount,
      createdAt: new Date(),
    } as {
      id: string;
      fromUserId: string;
      toUserId: string;
      amount: number;
      createdAt: Date;
    });
  });

  const fromUser = (await db.orm.User.where({ id: fromUserId }).first()) as
    | UserRow
    | null;

  await recordTransaction({
    userId: fromUserId,
    type: "send",
    amount,
    status: "completed",
    label: toUser.firstName,
    note: toUser.username ? `@${toUser.username}` : null,
    relatedId: `out:${transferId}`,
  });
  await recordTransaction({
    userId: toUser.id,
    type: "receive",
    amount,
    status: "completed",
    label: fromUser?.firstName ?? "Player",
    note: fromUser?.username ? `@${fromUser.username}` : null,
    relatedId: `in:${transferId}`,
  });

  return {
    amount,
    to: {
      id: toUser.id,
      firstName: toUser.firstName,
      username: toUser.username,
      photoUrl: toUser.photoUrl,
    },
  };
}
