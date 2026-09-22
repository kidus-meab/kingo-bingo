import { newId } from "@/lib/ids";
import { db } from "@/lib/prisma";
import type {
  TransactionType,
  WalletTransaction,
} from "@/types/wallet";

export type { TransactionType, WalletTransaction };
export {
  transactionTitle,
  transactionSignedAmount,
} from "@/types/wallet";

type TransactionRow = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  status: string;
  label?: string | null;
  note?: string | null;
  relatedId?: string | null;
  createdAt: Date | string;
};

type DepositRow = {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  smsText: string;
  status: string;
  createdAt: Date | string;
};

type TransferRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  createdAt: Date | string;
};

type UserRow = {
  id: string;
  firstName: string;
  username: string | null;
};

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

function asType(value: string): TransactionType {
  if (
    value === "deposit" ||
    value === "send" ||
    value === "receive" ||
    value === "withdraw" ||
    value === "reward"
  ) {
    return value;
  }
  return "deposit";
}

export async function recordTransaction(input: {
  userId: string;
  type: TransactionType;
  amount: number;
  status?: string;
  label?: string | null;
  note?: string | null;
  relatedId?: string | null;
  createdAt?: Date;
}) {
  const row = (await db.orm.Transaction.create({
    id: newId(),
    userId: input.userId,
    type: input.type,
    amount: Math.floor(input.amount),
    status: input.status ?? "completed",
    label: input.label ?? null,
    note: input.note ?? null,
    relatedId: input.relatedId ?? null,
    createdAt: input.createdAt ?? new Date(),
  } as {
    id: string;
    userId: string;
    type: string;
    amount: number;
    status: string;
    label: string | null;
    note: string | null;
    relatedId: string | null;
    createdAt: Date;
  })) as TransactionRow;

  return toPublic(row);
}

function toPublic(row: TransactionRow): WalletTransaction {
  return {
    id: row.id,
    type: asType(row.type),
    amount: row.amount,
    status: row.status,
    label: row.label ?? null,
    note: row.note ?? null,
    relatedId: row.relatedId ?? null,
    createdAt: toIso(row.createdAt),
  };
}

/** One-shot backfill from Deposit + Transfer rows into Transaction. */
export async function ensureTransactionsBackfilled(userId: string) {
  const existing = (await db.orm.Transaction.where({ userId }).all()) as TransactionRow[];
  const related = new Set(
    existing.map((row) => row.relatedId).filter(Boolean) as string[],
  );

  const [deposits, transfers, users, accounts] = await Promise.all([
    db.orm.Deposit.where({ userId }).all(),
    db.orm.Transfer.all(),
    db.orm.User.all(),
    db.orm.DepositAccount.all(),
  ]);
  const depositRows = deposits as DepositRow[];
  const transferRows = transfers as TransferRow[];
  const userRows = users as UserRow[];
  const accountRows = accounts as Array<{ id: string; label: string }>;
  const byId = new Map(userRows.map((user) => [user.id, user]));
  const accountLabel = new Map(accountRows.map((row) => [row.id, row.label]));

  for (const deposit of depositRows) {
    if (related.has(deposit.id)) continue;
    await recordTransaction({
      userId,
      type: "deposit",
      amount: deposit.amount,
      status: deposit.status,
      label: accountLabel.get(deposit.accountId) ?? "Deposit",
      note: deposit.smsText.slice(0, 80),
      relatedId: deposit.id,
      createdAt:
        deposit.createdAt instanceof Date
          ? deposit.createdAt
          : new Date(deposit.createdAt),
    });
    related.add(deposit.id);
  }

  for (const transfer of transferRows) {
    if (transfer.fromUserId === userId && !related.has(`out:${transfer.id}`)) {
      const peer = byId.get(transfer.toUserId);
      await recordTransaction({
        userId,
        type: "send",
        amount: transfer.amount,
        status: "completed",
        label: peer?.firstName ?? "Player",
        note: peer?.username ? `@${peer.username}` : null,
        relatedId: `out:${transfer.id}`,
        createdAt:
          transfer.createdAt instanceof Date
            ? transfer.createdAt
            : new Date(transfer.createdAt),
      });
      related.add(`out:${transfer.id}`);
    }
    if (transfer.toUserId === userId && !related.has(`in:${transfer.id}`)) {
      const peer = byId.get(transfer.fromUserId);
      await recordTransaction({
        userId,
        type: "receive",
        amount: transfer.amount,
        status: "completed",
        label: peer?.firstName ?? "Player",
        note: peer?.username ? `@${peer.username}` : null,
        relatedId: `in:${transfer.id}`,
        createdAt:
          transfer.createdAt instanceof Date
            ? transfer.createdAt
            : new Date(transfer.createdAt),
      });
      related.add(`in:${transfer.id}`);
    }
  }
}

export async function listTransactions(
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<{ transactions: WalletTransaction[]; total: number; hasMore: boolean }> {
  await ensureTransactionsBackfilled(userId);

  const all = (
    (await db.orm.Transaction.where({ userId }).all()) as TransactionRow[]
  )
    .map(toPublic)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, Math.min(100, options.limit ?? 12));
  const slice = all.slice(offset, offset + limit);

  return {
    transactions: slice,
    total: all.length,
    hasMore: offset + slice.length < all.length,
  };
}
