"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { UserChip } from "@/components/ui/user-chip";
import { WalletChip } from "@/components/ui/wallet-chip";
import { apiFetch } from "@/lib/client-session";
import { setTelegramBackButton } from "@/lib/telegram";
import {
  transactionTitle,
  type WalletTransaction,
} from "@/types/wallet";
import type { WalletState } from "@/types/wallet";

const PAGE_SIZE = 12;

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

function typeLabel(type: WalletTransaction["type"]) {
  if (type === "deposit") return "Deposit";
  if (type === "withdraw") return "Withdraw";
  if (type === "send") return "Send";
  if (type === "receive") return "Receive";
  if (type === "reward") return "Reward";
  return type;
}

function amountClass(tx: WalletTransaction) {
  if (tx.type === "send" || tx.type === "withdraw") return "text-muted";
  if (tx.type === "deposit" && tx.status === "pending") return "text-muted";
  return "text-theme";
}

function formatAmount(tx: WalletTransaction) {
  const out = tx.type === "send" || tx.type === "withdraw";
  return `${out ? "-" : "+"}${tx.amount} Br`;
}

function statusKind(status: string): "pending" | "accepted" | "rejected" {
  const value = status.toLowerCase();
  if (value === "pending" || value === "processing") return "pending";
  if (
    value === "rejected" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "canceled"
  ) {
    return "rejected";
  }
  return "accepted";
}

function StatusIcon({ status }: { status: string }) {
  const kind = statusKind(status);
  const label =
    kind === "pending"
      ? "Pending"
      : kind === "rejected"
        ? "Rejected"
        : "Accepted";

  if (kind === "pending") {
    return (
      <span
        title={label}
        aria-label={label}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-theme/15 text-theme"
      >
        <svg viewBox="0 0 16 16" className="size-3.5 fill-none stroke-current" aria-hidden>
          <circle cx="8" cy="8" r="5.5" strokeWidth="1.5" />
          <path d="M8 5v3.2L10 10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (kind === "rejected") {
    return (
      <span
        title={label}
        aria-label={label}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-500"
      >
        <svg viewBox="0 0 16 16" className="size-3.5 fill-none stroke-current" aria-hidden>
          <path d="M5 5l6 6M11 5l-6 6" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"
    >
      <svg viewBox="0 0 16 16" className="size-3.5 fill-none stroke-current" aria-hidden>
        <path
          d="M3.5 8.2l3 3.1 6-6.4"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function WalletScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await apiFetch<WalletState>(
      `/api/wallet?limit=${PAGE_SIZE}&offset=0`,
    );
    setWallet(next);
    setTransactions(next.transactions);
    setHasMore(next.hasMoreTransactions);
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

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const next = await apiFetch<WalletState>(
        `/api/wallet?limit=${PAGE_SIZE}&offset=${transactions.length}`,
      );
      setTransactions((current) => [...current, ...next.transactions]);
      setHasMore(next.hasMoreTransactions);
      setWallet((current) =>
        current
          ? {
              ...current,
              balance: next.balance,
              rewardBalance: next.rewardBalance,
              transactionsTotal: next.transactionsTotal,
            }
          : next,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setLoadingMore(false);
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
          Wallet
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
        <div className="rounded-2xl bg-surface px-4 py-4">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-theme uppercase">
            Balance
          </p>
          <p className="mt-2 text-3xl font-extrabold text-foreground tabular-nums">
            {wallet ? `${wallet.balance} Br` : "…"}
          </p>
          <p className="mt-1 text-xs text-muted">
            Reward {wallet ? `${wallet.rewardBalance} Br` : "…"}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => router.push("/deposit")}
            className="flex h-11 items-center justify-center rounded-xl bg-theme text-sm font-bold text-on-theme"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => router.push("/send")}
            className="flex h-11 items-center justify-center rounded-xl bg-surface text-sm font-bold text-foreground"
          >
            Send
          </button>
        </div>

        {error ? <p className="mt-3 text-xs text-theme">{error}</p> : null}

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
              Transactions
            </p>
            <p className="text-[11px] text-muted">
              {wallet?.transactionsTotal ?? 0} total
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl bg-surface">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 border-b border-background px-3 py-2 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
              <span className="w-6" aria-hidden />
              <span>Details</span>
              <span>Type</span>
              <span>Amount</span>
            </div>

            {transactions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">No transactions yet.</p>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border-b border-background px-3 py-3 last:border-b-0"
                >
                  <StatusIcon status={tx.status} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {transactionTitle(tx)}
                    </p>
                    <p className="text-[11px] text-muted">
                      {formatDate(tx.createdAt)}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-muted">
                    {typeLabel(tx.type)}
                  </span>
                  <span
                    className={`text-sm font-extrabold tabular-nums ${amountClass(tx)}`}
                  >
                    {formatAmount(tx)}
                  </span>
                </div>
              ))
            )}
          </div>

          {hasMore ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-surface text-sm font-bold text-foreground disabled:opacity-45"
            >
              {loadingMore ? "Loading…" : "More"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
