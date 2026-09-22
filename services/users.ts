import { DEFAULT_BALANCE_BIRR, FIRST_REWARD_BIRR } from "@/lib/config";
import { newId } from "@/lib/ids";
import { db } from "@/lib/prisma";
import type { TelegramUser } from "@/lib/telegram";
import { recordTransaction } from "@/services/transactions";

type UserRow = {
  id: string;
  telegramId: string;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
  balance?: number | null;
  rewardBalance?: number | null;
};

export async function getOrCreateUserFromTelegram(user: TelegramUser) {
  const telegramId = String(user.id);
  const firstName = user.first_name;
  const username = user.username ?? null;
  const photoUrl = user.photo_url ?? null;

  const existing = (await db.orm.User.where({ telegramId }).first()) as
    | UserRow
    | null;

  if (existing) {
    await db.orm.User.where({ id: existing.id }).update({
      firstName,
      username,
      photoUrl,
    } as {
      firstName: string;
      username: string | null;
      photoUrl: string | null;
    });
    return {
      ...existing,
      firstName,
      username,
      photoUrl,
    };
  }

  const id = newId();
  const rewardBalance = FIRST_REWARD_BIRR;
  const created = (await db.orm.User.create({
    id,
    telegramId,
    firstName,
    username,
    photoUrl,
    balance: DEFAULT_BALANCE_BIRR,
    rewardBalance,
  } as {
    id: string;
    telegramId: string;
    firstName: string;
    username: string | null;
    photoUrl: string | null;
    balance: number;
    rewardBalance: number;
  })) as UserRow;

  if (rewardBalance > 0) {
    await recordTransaction({
      userId: id,
      type: "reward",
      amount: rewardBalance,
      status: "completed",
      label: "Welcome reward",
      note: "First join",
      relatedId: `first-reward:${id}`,
    });
  }

  return created;
}

export async function getUserBalance(userId: string): Promise<number> {
  const row = (await db.orm.User.where({ id: userId }).first()) as {
    balance?: number | null;
  } | null;
  return Number(row?.balance ?? 0);
}

export async function getUserRewardBalance(userId: string): Promise<number> {
  const row = (await db.orm.User.where({ id: userId }).first()) as {
    rewardBalance?: number | null;
  } | null;
  return Number(row?.rewardBalance ?? 0);
}

export async function adjustBalance(userId: string, delta: number) {
  const current = await getUserBalance(userId);
  const next = current + delta;
  if (next < 0) {
    throw new Error("Insufficient balance");
  }
  await db.orm.User.where({ id: userId }).update({
    balance: next,
  } as { balance: number });
  return next;
}
