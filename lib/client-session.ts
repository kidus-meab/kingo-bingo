import { getDevUser } from "@/lib/dev-users";
import { getTelegramInitData, type TelegramUser } from "@/lib/telegram";

const DEV_USER_KEY = "kingo-dev-user";

export function getStoredDevUserId() {
  if (typeof window === "undefined") return "0";
  return window.sessionStorage.getItem(DEV_USER_KEY) ?? "0";
}

export function setStoredDevUserId(id: string) {
  window.sessionStorage.setItem(DEV_USER_KEY, id);
}

export function getSessionUser(fallback?: TelegramUser): TelegramUser {
  const initData = getTelegramInitData();
  if (initData) {
    return fallback ?? getDevUser(0);
  }
  return getDevUser(getStoredDevUserId());
}

export function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const initData = getTelegramInitData();
  if (initData) {
    headers.set("X-Telegram-Init-Data", initData);
  } else if (process.env.NODE_ENV !== "production") {
    headers.set("X-Dev-User", getStoredDevUserId());
  }

  return headers;
}

export async function apiFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: authHeaders(init?.headers),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}
