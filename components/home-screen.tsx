"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { UserChip } from "@/components/user-chip";
import { WalletChip } from "@/components/wallet-chip";
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
    <main className="relative flex h-dvh flex-col overflow-hidden bg-background px-5 py-6">
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

      <section className="relative z-10 mt-8 shrink-0 text-center">
        <h1 className="text-[2.35rem] leading-none font-extrabold tracking-tight text-foreground">
          Kingo Bingo
        </h1>
        <p className="mt-3 text-sm text-muted">
          Pick a room, claim a cartela, play for the pot.
        </p>
        {auth.status === "loading" ? (
          <p className="mt-4 text-sm text-muted">Connecting…</p>
        ) : null}
        {auth.status === "error" ? (
          <p className="mt-4 text-sm text-muted">{auth.message}</p>
        ) : null}
      </section>

      <section className="relative z-10 mt-8 min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Rooms
          </p>
          <p className="text-[11px] text-muted">{rooms.length} open</p>
        </div>

        {roomsError ? (
          <p className="mb-3 text-xs text-theme">{roomsError}</p>
        ) : null}

        {auth.status === "ready" && rooms.length === 0 && !roomsError ? (
          <p className="text-sm text-muted">Loading rooms…</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          {rooms.map((room) => {
            const busy = joining === room.code;
            return (
              <button
                key={room.id}
                type="button"
                disabled={auth.status !== "ready" || Boolean(joining)}
                onClick={() => void joinRoom(room.code)}
                className="flex flex-col rounded-[1.35rem] bg-surface px-3.5 py-4 text-left transition-opacity disabled:opacity-45"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-extrabold tracking-wide text-foreground">
                    {room.code}
                  </p>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-theme uppercase">
                    {roundLabel(room.roundStatus)}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-extrabold text-theme tabular-nums">
                  {room.stake}
                  <span className="ml-1 text-xs font-semibold text-muted">
                    Br
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {room.players} playing · pot {room.pot} Br
                </p>
                <span className="mt-4 flex h-10 items-center justify-center rounded-xl bg-theme text-sm font-bold text-on-theme">
                  {busy ? "Joining…" : "Join"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
