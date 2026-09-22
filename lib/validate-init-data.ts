import { createHmac, timingSafeEqual } from "node:crypto";

import type { TelegramUser } from "@/lib/telegram";

const MAX_AGE_SECONDS = 60 * 60 * 24;

function hmacSha256(key: string | Buffer, data: string) {
  return createHmac("sha256", key).update(data).digest();
}

export class InitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitDataError";
  }
}

export function validateTelegramInitData(initData: string): TelegramUser {
  const botToken = process.env.BOT_ACCESS_TOKEN;
  if (!botToken) {
    throw new InitDataError("BOT_ACCESS_TOKEN is not configured");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new InitDataError("Missing hash");
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = hmacSha256("WebAppData", botToken);
  const calculatedHash = hmacSha256(secretKey, dataCheckString);
  const providedHash = Buffer.from(hash, "hex");

  if (
    providedHash.length !== calculatedHash.length ||
    !timingSafeEqual(providedHash, calculatedHash)
  ) {
    throw new InitDataError("Invalid hash");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new InitDataError("Missing auth_date");
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > MAX_AGE_SECONDS) {
    throw new InitDataError("initData expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new InitDataError("Missing user");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    throw new InitDataError("Invalid user");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { id?: unknown }).id !== "number" ||
    typeof (parsed as { first_name?: unknown }).first_name !== "string"
  ) {
    throw new InitDataError("Invalid user");
  }

  const user = parsed as {
    id: number;
    first_name: string;
    username?: string;
    photo_url?: string;
  };

  return {
    id: user.id,
    first_name: user.first_name,
    username: user.username ?? null,
    photo_url: user.photo_url ?? null,
  };
}
