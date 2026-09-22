"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { UserChip } from "@/components/user-chip";
import { WalletChip } from "@/components/wallet-chip";
import { MIN_DEPOSIT_BIRR } from "@/lib/config";
import { apiFetch } from "@/lib/client-session";
import type {
  DepositTx,
  WalletState,
} from "@/lib/wallet";
import { setTelegramBackButton } from "@/lib/telegram";

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

function statusLabel(status: string) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status;
}

export function DepositScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [smsText, setSmsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await apiFetch<WalletState>("/api/wallet");
    setWallet(next);
    setAccountId((current) => current || next.accounts[0]?.id || "");
  }, []);

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load wallet");
    });
  }, [load]);

  useEffect(() => {
    setTelegramBackButton(() => router.back());
    return () => setTelegramBackButton(null);
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!accountId) {
      setError("Choose an account");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ deposit: DepositTx; wallet: WalletState }>(
        "/api/deposits",
        {
          method: "POST",
          body: JSON.stringify({
            accountId,
            amount: Number(amount),
            smsText,
          }),
        },
      );
      setWallet(result.wallet);
      setAmount("");
      setSmsText("");
      setNotice("Deposit submitted — status Pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit deposit");
    } finally {
      setBusy(false);
    }
  }

  const accounts = wallet?.accounts ?? [];
  const transactions = wallet?.transactions ?? [];

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
          Deposit
        </p>
        <div className="flex items-center gap-2">
          <WalletChip
            balance={wallet?.balance}
            reward={wallet?.rewardBalance}
          />
          <UserChip
            user={{
              first_name: wallet?.firstName ?? "Player",
              photo_url: wallet?.photoUrl ?? null,
            }}
            compact
          />
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-surface px-3 py-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">
              Balance
            </p>
            <p className="mt-1 text-xl font-extrabold text-foreground tabular-nums">
              {wallet ? `${wallet.balance} Br` : "…"}
            </p>
          </div>
          <div className="rounded-2xl bg-surface px-3 py-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">
              Reward Balance
            </p>
            <p className="mt-1 text-xl font-extrabold text-theme tabular-nums">
              {wallet ? `${wallet.rewardBalance} Br` : "…"}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-surface px-4 py-4">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-theme uppercase">
            How to deposit
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-sm text-foreground">
            <li>Send the amount to one of the accounts below.</li>
            <li>Copy the SMS you receive after payment.</li>
            <li>Enter the amount and paste the SMS, then submit.</li>
            <li>Your deposit stays Pending until it is approved.</li>
          </ol>
        </div>

        <div className="mt-5">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Send amount into
          </p>
          <div className="mt-2 grid gap-2">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted">Loading accounts…</p>
            ) : (
              accounts.map((account) => {
                const selected = accountId === account.id;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => setAccountId(account.id)}
                    className={`rounded-2xl px-4 py-3 text-left transition-colors ${
                      selected
                        ? "bg-theme/20 ring-1 ring-theme"
                        : "bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-foreground">
                        {account.label}
                      </p>
                      <p className="text-[11px] text-muted">{account.bankName}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted">{account.accountName}</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-theme tabular-nums">
                      {account.accountNumber}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-3">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Confirm payment
          </p>
          <label className="grid gap-1.5">
            <span className="text-xs text-muted">Amount (Br)</span>
            <input
              type="number"
              min={MIN_DEPOSIT_BIRR}
              step={1}
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={String(MIN_DEPOSIT_BIRR)}
              className="h-12 rounded-2xl bg-surface px-4 text-sm text-foreground outline-none ring-theme focus:ring-1"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs text-muted">SMS text</span>
            <textarea
              required
              rows={3}
              value={smsText}
              onChange={(event) => setSmsText(event.target.value)}
              placeholder="Paste the bank / Telebirr SMS here"
              className="resize-none rounded-2xl bg-surface px-4 py-3 text-sm text-foreground outline-none ring-theme focus:ring-1"
            />
          </label>
          {error ? <p className="text-xs text-theme">{error}</p> : null}
          {notice ? <p className="text-xs text-theme">{notice}</p> : null}
          <button
            type="submit"
            disabled={busy || !wallet}
            className="h-12 rounded-2xl bg-theme font-bold text-on-theme disabled:opacity-45"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </form>

        <div className="mt-8">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Transactions
          </p>
          <div className="mt-2 overflow-hidden rounded-2xl bg-surface">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-background px-3 py-2 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
              <span>Amount</span>
              <span>Status</span>
              <span>Date</span>
            </div>
            {transactions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">No deposits yet.</p>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-background px-3 py-3 last:border-b-0"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground tabular-nums">
                      {tx.amount} Br
                    </p>
                    <p className="text-[11px] text-muted">{tx.accountLabel}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      tx.status === "pending"
                        ? "bg-theme/20 text-theme"
                        : tx.status === "approved"
                          ? "bg-background text-foreground"
                          : "bg-background text-muted"
                    }`}
                  >
                    {statusLabel(tx.status)}
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
