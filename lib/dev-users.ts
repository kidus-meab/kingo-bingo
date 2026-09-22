import type { TelegramUser } from "@/lib/telegram";

export const DEV_USERS: Record<string, TelegramUser> = {
  "0": {
    id: 0,
    first_name: "Dev Player",
    username: "local",
    photo_url: null,
  },
  "2": {
    id: 2,
    first_name: "Dev Two",
    username: "local2",
    photo_url: null,
  },
};

export function getDevUser(id: string | number = 0): TelegramUser {
  const key = String(id);
  return (
    DEV_USERS[key] ?? {
      id: Number(key) || 0,
      first_name: `Dev ${key}`,
      username: `local${key}`,
      photo_url: null,
    }
  );
}
