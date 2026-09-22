"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { UserChip } from "@/components/user-chip";
import { WalletChip } from "@/components/wallet-chip";
import { MIN_TRANSFER_BIRR } from "@/lib/config";
import { apiFetch } from "@/lib/client-session";
import type { TransferPeer, TransferTx } from "@/lib/transfers";
import { setTelegramBackButton } from "@/lib/telegram";

type SendPageState = {
  balance: number;
  firstName: string;
  photoUrl: string | null;
  peers: TransferPeer[];
  transfers: TransferTx[];
};

function formatDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SendScreen() {
  const router = useRouter();
  const [state, setState] = useState<SendPageState | null>(null);
  const [toUserId, setToUserId] = useState("");
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await apiFetch<SendPageState>("/api/send");
    setState(next);
    setToUserId((current) => current || next.peers[0]?.id || "");
  }, []);

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load send page");
    });
  }, [load]);

  useEffect(() => {
    setTelegramBackButton(() => router.back());
    return () => setTelegramBackButton(null);
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{
        sent: { amount: number; to: TransferPeer };
        page: SendPageState;
      }>("/api/send", {
        method: "POST",
        body: JSON.stringify({
          toUserId: username.trim() ? undefined : toUserId || undefined,
          username: username.trim() || undefined,
          amount: Number(amount),
        }),
      });
      setState(result.page);
      setAmount("");
      setUsername("");
      setNotice(
        `Sent ${result.sent.amount} Br to ${result.sent.to.firstName}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4 pb-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs font-semibold tracking-[0.18em] text-theme uppercase"
        >
          Back
        </button>
        <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">
          Send
        </p>
        <div className="flex items-center gap-2">
          <WalletChip balance={state?.balance} />
          <UserChip
            user={{
              first_name: state?.firstName ?? "Player",
              photo_url: state?.photoUrl ?? null,
            }}
            compact
          />
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <div className="rounded-2xl bg-surface px-4 py-4">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-theme uppercase">
            Your balance
          </p>
          <p className="mt-2 text-3xl font-extrabold text-foreground tabular-nums">
            {state ? `${state.balance} Br` : "…"}
          </p>
          <p className="mt-2 text-sm text-muted">
            Send Birr from your wallet to another Kingo player.
          </p>
        </div>

        <form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-3">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Recipient
          </p>

          {(state?.peers.length ?? 0) > 0 ? (
            <div className="grid gap-2">
              {state!.peers.map((peer) => {
                const selected = !username.trim() && toUserId === peer.id;
                return (
                  <button
                    key={peer.id}
                    type="button"
                    onClick={() => {
                      setToUserId(peer.id);
                      setUsername("");
                    }}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left ${
                      selected
                        ? "bg-theme/20 ring-1 ring-theme"
                        : "bg-surface"
                    }`}
                  >
                    <span className="text-sm font-bold text-foreground">
                      {peer.firstName}
                    </span>
                    <span className="text-xs text-muted">
                      {peer.username ? `@${peer.username}` : "player"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No other players yet — use a username below.
            </p>
          )}

          <label className="grid gap-1.5">
            <span className="text-xs text-muted">Or username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="@local2"
              className="h-12 rounded-2xl bg-surface px-4 text-sm text-foreground outline-none ring-theme focus:ring-1"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs text-muted">Amount (Br)</span>
            <input
              type="number"
              min={MIN_TRANSFER_BIRR}
              step={1}
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={String(Math.max(MIN_TRANSFER_BIRR, 50))}
              className="h-12 rounded-2xl bg-surface px-4 text-sm text-foreground outline-none ring-theme focus:ring-1"
            />
          </label>

          {error ? <p className="text-xs text-theme">{error}</p> : null}
          {notice ? <p className="text-xs text-theme">{notice}</p> : null}

          <button
            type="submit"
            disabled={busy || !state}
            className="h-12 rounded-2xl bg-theme font-bold text-on-theme disabled:opacity-45"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </form>

        <div className="mt-8">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Transfers
          </p>
          <div className="mt-2 overflow-hidden rounded-2xl bg-surface">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-background px-3 py-2 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
              <span>Player</span>
              <span>Amount</span>
              <span>Date</span>
            </div>
            {(state?.transfers.length ?? 0) === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">No transfers yet.</p>
            ) : (
              state!.transfers.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-background px-3 py-3 last:border-b-0"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {tx.peerName}
                    </p>
                    <p className="text-[11px] text-muted">
                      {tx.direction === "out" ? "Sent" : "Received"}
                      {tx.peerUsername ? ` · @${tx.peerUsername}` : ""}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-extrabold tabular-nums ${
                      tx.direction === "out" ? "text-muted" : "text-theme"
                    }`}
                  >
                    {tx.direction === "out" ? "-" : "+"}
                    {tx.amount} Br
                  </span>
                  <span className="text-[11px] text-muted tabular-nums">
                    {formatDate(tx.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
