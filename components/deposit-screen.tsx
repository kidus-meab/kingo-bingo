"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { UserChip } from "@/components/user-chip";
import { apiFetch, getStoredDevUserId } from "@/lib/client-session";
import type { LobbyState } from "@/lib/game-types";
import { setTelegramBackButton } from "@/lib/telegram";

export function DepositScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [name, setName] = useState("Player");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const lobby = await apiFetch<LobbyState>("/api/rooms/join", {
          method: "POST",
          body: JSON.stringify({}),
        });
        setBalance(lobby.me.balance);
        setName(lobby.me.firstName);
        setPhoto(lobby.me.photoUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load wallet");
        setBalance(0);
      }
    })();
  }, []);

  useEffect(() => {
    setTelegramBackButton(() => router.back());
    return () => setTelegramBackButton(null);
  }, [router]);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-background px-5">
      <header className="flex items-center justify-between gap-3 pt-4 pb-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs font-semibold tracking-[0.18em] text-theme uppercase"
        >
          Back
        </button>
        <UserChip
          user={{
            first_name: name,
            photo_url: photo,
          }}
        />
      </header>

      <section className="flex min-h-0 flex-1 flex-col justify-center pb-10">
        <p className="text-center text-[11px] font-semibold tracking-[0.22em] text-muted uppercase">
          Deposit
        </p>
        <p className="mt-3 text-center text-4xl font-extrabold text-theme tabular-nums">
          {balance == null ? "…" : `${balance} Br`}
        </p>
        <p className="mt-3 text-center text-sm text-muted">
          Add Birr to your Kingo wallet to join stake rooms.
        </p>
        {error ? (
          <p className="mt-3 text-center text-xs text-theme">{error}</p>
        ) : null}

        <div className="mt-8 grid gap-2">
          {[50, 100, 200, 500].map((amount) => (
            <button
              key={amount}
              type="button"
              disabled
              className="flex h-12 items-center justify-between rounded-2xl bg-surface px-4 text-sm font-semibold text-foreground opacity-55"
            >
              <span>+{amount} Br</span>
              <span className="text-xs text-muted">Soon</span>
            </button>
          ))}
        </div>

        {process.env.NODE_ENV !== "production" ? (
          <p className="mt-6 text-center text-[11px] text-muted">
            Dev user {getStoredDevUserId()} · payments not wired yet
          </p>
        ) : null}
      </section>
    </main>
  );
}
