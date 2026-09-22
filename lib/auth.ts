import { getDevUser } from "@/lib/dev-users";
import type { TelegramUser } from "@/lib/telegram";
import { getOrCreateUserFromTelegram } from "@/lib/users";
import {
  InitDataError,
  validateTelegramInitData,
} from "@/lib/validate-init-data";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export type AppUser = {
  id: string;
  telegramId: string;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
};

function readInitData(request: Request, body?: { initData?: string }) {
  return (
    request.headers.get("x-telegram-init-data") ||
    body?.initData ||
    ""
  ).trim();
}

export async function requireUser(
  request: Request,
  body?: { initData?: string },
): Promise<AppUser> {
  const initData = readInitData(request, body);

  if (initData) {
    try {
      const telegramUser = validateTelegramInitData(initData);
      return (await getOrCreateUserFromTelegram(telegramUser)) as AppUser;
    } catch (error) {
      if (error instanceof InitDataError) {
        throw new AuthError("Invalid or expired initData", 401);
      }
      throw error;
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new AuthError("Open Kingo Bingo from Telegram to play.");
  }

  const devId = request.headers.get("x-dev-user") ?? "0";
  return (await getOrCreateUserFromTelegram(getDevUser(devId))) as AppUser;
}

export function telegramFromAppUser(user: AppUser): TelegramUser {
  return {
    id: Number(user.telegramId) || 0,
    first_name: user.firstName,
    username: user.username,
    photo_url: user.photoUrl,
  };
}
