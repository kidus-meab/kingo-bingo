"use client";

import { useEffect, useState } from "react";

import { getTelegramInitData, type TelegramUser } from "@/lib/telegram";

const DEV_FALLBACK_USER: TelegramUser = {
  id: 0,
  first_name: "Dev Player",
  username: "local",
  photo_url: null,
};

type AuthState =
  | { status: "loading" }
  | { status: "ready"; user: TelegramUser; devFallback: boolean }
  | { status: "error"; message: string };

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "K";
}

export function HomeScreen() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const initData = getTelegramInitData();

    if (!initData) {
      if (process.env.NODE_ENV === "development") {
        setAuth({
          status: "ready",
          user: DEV_FALLBACK_USER,
          devFallback: true,
        });
        return;
      }

      setAuth({
        status: "error",
        message: "Open Kingo Bingo from Telegram to play.",
      });
      return;
    }

    let cancelled = false;

    async function authenticate() {
      try {
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const payload = (await response.json()) as {
          user?: TelegramUser;
          error?: string;
        };

        if (!response.ok || !payload.user) {
          throw new Error(payload.error ?? "Could not verify Telegram user");
        }

        if (!cancelled) {
          setAuth({
            status: "ready",
            user: payload.user,
            devFallback: false,
          });
        }
      } catch {
        if (!cancelled) {
          setAuth({
            status: "error",
            message: "Telegram session is invalid or expired. Reopen the Mini App.",
          });
        }
      }
    }

    void authenticate();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background px-5 py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-theme/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:radial-gradient(circle_at_center,var(--theme)_1px,transparent_1.5px)] [background-size:18px_18px]"
      />

      <header className="relative z-10 flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-theme uppercase">
          Mini App
        </p>
        {auth.status === "ready" ? <UserChip user={auth.user} /> : <span />}
      </header>

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 grid size-20 place-items-center rounded-3xl bg-theme text-3xl font-extrabold text-on-theme shadow-[0_0_40px_color-mix(in_srgb,var(--theme)_45%,transparent)]">
          K
        </div>
        <h1 className="text-[2.35rem] leading-none font-extrabold tracking-tight text-foreground">
          Kingo Bingo
        </h1>
        <p className="mt-3 max-w-[16rem] text-sm text-muted">
          Call the numbers. Mark your card. Shout bingo in Telegram.
        </p>

        {auth.status === "loading" ? (
          <p className="mt-8 text-sm text-muted">Connecting to Telegram…</p>
        ) : null}

        {auth.status === "error" ? (
          <p className="mt-8 max-w-[18rem] text-sm text-muted">{auth.message}</p>
        ) : null}

        {auth.status === "ready" && auth.devFallback ? (
          <p className="mt-8 rounded-full border border-theme/30 bg-surface px-3 py-1 text-[11px] font-medium text-theme">
            Dev fallback — not in Telegram
          </p>
        ) : null}

        {auth.status === "ready" && !auth.devFallback ? (
          <p className="mt-8 text-sm text-muted">
            Welcome back, {auth.user.first_name}.
          </p>
        ) : null}
      </section>

      <footer className="relative z-10 space-y-3">
        <button
          type="button"
          disabled
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-theme text-base font-bold text-on-theme opacity-45"
        >
          Play / Join room
        </button>
        <p className="text-center text-[11px] leading-relaxed text-muted">
          Gameplay comes in a later step. Rooms, cartelas, and number calls are
          not live yet.
        </p>
      </footer>
    </main>
  );
}

function UserChip({ user }: { user: TelegramUser }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1">
      {user.photo_url ? (
        // Telegram CDN avatars; next/image is not configured for that host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photo_url}
          alt=""
          width={28}
          height={28}
          className="size-7 rounded-full object-cover"
        />
      ) : (
        <span className="grid size-7 place-items-center rounded-full bg-theme text-xs font-bold text-on-theme">
          {initials(user.first_name)}
        </span>
      )}
      <span className="max-w-28 truncate text-sm font-medium text-foreground">
        {user.first_name}
      </span>
    </div>
  );
}
