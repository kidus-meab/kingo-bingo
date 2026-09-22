import { DEFAULT_BALANCE_BIRR } from "@/lib/bingo";
import { newId } from "@/lib/ids";
import { db } from "@/lib/prisma";
import type { TelegramUser } from "@/lib/telegram";

export async function getOrCreateUserFromTelegram(user: TelegramUser) {
  const telegramId = String(user.id);
  const firstName = user.first_name;
  const username = user.username ?? null;
  const photoUrl = user.photo_url ?? null;

  return db.orm.User.upsert({
    create: {
      id: newId(),
      telegramId,
      firstName,
      username,
      photoUrl,
      balance: DEFAULT_BALANCE_BIRR,
    },
    update: {
      firstName,
      username,
      photoUrl,
    },
    conflictOn: { telegramId },
  });
}

export async function getUserBalance(userId: string): Promise<number> {
  const row = (await db.orm.User.where({ id: userId }).first()) as {
    balance?: number | null;
  } | null;
  return Number(row?.balance ?? 0);
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
