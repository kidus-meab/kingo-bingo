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
    },
    update: {
      firstName,
      username,
      photoUrl,
    },
    conflictOn: { telegramId },
  });
}
