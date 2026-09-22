import { depositAccountSeeds, MIN_DEPOSIT_BIRR } from "@/lib/config";
import { newId } from "@/lib/ids";
import { db } from "@/lib/prisma";
import { RoomError } from "@/lib/rooms";
import { getUserBalance } from "@/lib/users";

export type DepositAccountPublic = {
  id: string;
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export type DepositTx = {
  id: string;
  amount: number;
  status: string;
  smsText: string;
  createdAt: string;
  accountLabel: string;
};

export type WalletState = {
  balance: number;
  rewardBalance: number;
  firstName: string;
  photoUrl: string | null;
  accounts: DepositAccountPublic[];
  transactions: DepositTx[];
};

type AccountRow = {
  id: string;
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  active?: number | null;
  sortOrder?: number | null;
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

const DEFAULT_ACCOUNTS = depositAccountSeeds();

async function ensureDepositAccounts() {
  const existing = (await db.orm.DepositAccount.all()) as AccountRow[];
  if (existing.length > 0) return existing;

  for (const account of DEFAULT_ACCOUNTS) {
    await db.orm.DepositAccount.create({
      id: newId(),
      ...account,
    } as AccountRow & { id: string });
  }

  return (await db.orm.DepositAccount.all()) as AccountRow[];
}

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

export async function getRewardBalance(userId: string) {
  const wins = (await db.orm.Win.where({ userId }).all()) as Array<{
    payout?: number | null;
  }>;
  return wins.reduce((sum, win) => sum + Number(win.payout ?? 0), 0);
}

export async function getWalletState(userId: string): Promise<WalletState> {
  const user = (await db.orm.User.where({ id: userId }).first()) as {
    firstName?: string;
    photoUrl?: string | null;
    balance?: number | null;
  } | null;

  const [balance, rewardBalance, accounts, deposits] = await Promise.all([
    Promise.resolve(Number(user?.balance ?? 0)),
    getRewardBalance(userId),
    ensureDepositAccounts(),
    db.orm.Deposit.where({ userId }).all() as Promise<DepositRow[]>,
  ]);

  const active = accounts
    .filter((account) => Number(account.active ?? 1) === 1)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));

  const byId = new Map(accounts.map((account) => [account.id, account]));

  const transactions = deposits
    .map((deposit) => ({
      id: deposit.id,
      amount: deposit.amount,
      status: deposit.status,
      smsText: deposit.smsText,
      createdAt: toIso(deposit.createdAt),
      accountLabel: byId.get(deposit.accountId)?.label ?? "Account",
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    balance,
    rewardBalance,
    firstName: user?.firstName ?? "Player",
    photoUrl: user?.photoUrl ?? null,
    accounts: active.map((account) => ({
      id: account.id,
      label: account.label,
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
    })),
    transactions,
  };
}

export async function createDeposit(
  userId: string,
  input: { amount: number; smsText: string; accountId: string },
) {
  const amount = Math.floor(Number(input.amount));
  const smsText = String(input.smsText ?? "").trim();
  const accountId = String(input.accountId ?? "").trim();

  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_BIRR) {
    throw new RoomError(`Minimum deposit is ${MIN_DEPOSIT_BIRR} Br`, 400);
  }
  if (!smsText || smsText.length < 4) {
    throw new RoomError("Paste the SMS confirmation text", 400);
  }
  if (!accountId) {
    throw new RoomError("Choose a deposit account", 400);
  }

  const accounts = await ensureDepositAccounts();
  const account = accounts.find(
    (row) => row.id === accountId && Number(row.active ?? 1) === 1,
  );
  if (!account) throw new RoomError("Deposit account not found", 404);

  const deposit = (await db.orm.Deposit.create({
    id: newId(),
    userId,
    accountId,
    amount,
    smsText,
    status: "pending",
    createdAt: new Date(),
  } as {
    id: string;
    userId: string;
    accountId: string;
    amount: number;
    smsText: string;
    status: string;
    createdAt: Date;
  })) as DepositRow;

  return {
    id: deposit.id,
    amount: deposit.amount,
    status: deposit.status,
    smsText: deposit.smsText,
    createdAt: toIso(deposit.createdAt ?? new Date()),
    accountLabel: account.label,
  } satisfies DepositTx;
}
