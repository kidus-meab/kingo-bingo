"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { UserChip } from "@/components/ui/user-chip";
import { WalletChip } from "@/components/ui/wallet-chip";
import { apiFetch } from "@/lib/client-session";
import { getTelegramInitData, type TelegramUser } from "@/lib/telegram";

type RoomListItem = {
  id: string;
  code: string;
  status: string;
  stake: number;
  players: number;
  pot: number;
  roundStatus: string | null;
};

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

function roundLabel(status: string | null) {
  if (!status || status === "pending") return "Open";
  if (status === "starting") return "Starting";
  if (status === "drawing") return "Live";
  if (status === "finished") return "Finished";
  return status;
}

export function HomeScreen() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

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
            message:
              "Telegram session is invalid or expired. Reopen the Mini App.",
          });
        }
      }
    }

    void authenticate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (auth.status !== "ready") return;
    let cancelled = false;

    async function loadRooms() {
      try {
        const payload = await apiFetch<{ rooms: RoomListItem[] }>("/api/rooms");
        if (!cancelled) {
          setRooms(payload.rooms);
          setRoomsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setRoomsError(
            err instanceof Error ? err.message : "Could not load rooms",
          );
        }
      }
    }

    void loadRooms();
    const timer = window.setInterval(() => {
      void loadRooms().catch(() => undefined);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth.status]);

  async function joinRoom(code: string) {
    setJoining(code);
    setRoomsError(null);
    try {
      await apiFetch("/api/rooms/join", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      router.push(`/play?code=${encodeURIComponent(code)}`);
    } catch (err) {
      setRoomsError(err instanceof Error ? err.message : "Could not join room");
      setJoining(null);
    }
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-background px-4 py-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-theme/20 blur-3xl"
      />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-theme uppercase">
          Kingo
        </p>
        <div className="flex items-center gap-2">
          {auth.status === "ready" ? <WalletChip /> : null}
          {auth.status === "ready" ? <UserChip user={auth.user} /> : <span />}
        </div>
      </header>

      <section className="relative z-10 mt-5 shrink-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          Kingo Bingo
        </h1>
        <p className="mt-1 text-xs text-muted">Pick a room and join.</p>
        {auth.status === "loading" ? (
          <p className="mt-2 text-xs text-muted">Connecting…</p>
        ) : null}
        {auth.status === "error" ? (
          <p className="mt-2 text-xs text-muted">{auth.message}</p>
        ) : null}
      </section>

      <section className="relative z-10 mt-5 min-h-0 flex-1 overflow-y-auto pb-3">
        {roomsError ? (
          <p className="mb-2 text-xs text-theme">{roomsError}</p>
        ) : null}

        {auth.status === "ready" && rooms.length === 0 && !roomsError ? (
          <p className="text-sm text-muted">Loading rooms…</p>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          {rooms.map((room) => {
            const busy = joining === room.code;
            return (
              <button
                key={room.id}
                type="button"
                disabled={auth.status !== "ready" || Boolean(joining)}
                onClick={() => void joinRoom(room.code)}
                className="flex flex-col rounded-2xl bg-surface px-3 py-3 text-left transition-opacity disabled:opacity-45"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-foreground">
                    {room.code}
                  </p>
                  <span className="text-[10px] font-semibold text-theme">
                    {roundLabel(room.roundStatus)}
                  </span>
                </div>
                <p className="mt-2 text-xl font-extrabold text-theme tabular-nums">
                  {room.stake}
                  <span className="ml-1 text-[11px] font-semibold text-muted">
                    Br
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {room.players} in · pot {room.pot}
                </p>
                <span className="mt-2.5 flex h-8 items-center justify-center rounded-lg bg-theme text-xs font-bold text-on-theme">
                  {busy ? "…" : "Join"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
