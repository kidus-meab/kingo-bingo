"use client";

import { useCallback, useEffect, useState } from "react";

import { BalanceSheet } from "@/components/balance-sheet";
import { apiFetch } from "@/lib/client-session";
import type { WalletState } from "@/lib/wallet-types";

export function WalletChip({
  balance: balanceOverride,
  reward: rewardOverride,
  className = "",
}: {
  balance?: number;
  reward?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<WalletState>("/api/wallet");
      setWallet(next);
    } catch {
      // Keep last known wallet if refresh fails.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const balance = balanceOverride ?? wallet?.balance ?? 0;
  const reward = rewardOverride ?? wallet?.rewardBalance ?? 0;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-theme tabular-nums"
      >
        {balance} Br
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className={`size-2.5 fill-current transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2.2 4.2a.75.75 0 0 1 1.06 0L6 6.94l2.74-2.74a.75.75 0 1 1 1.06 1.06L6.53 8.53a.75.75 0 0 1-1.06 0L2.2 5.26a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      <BalanceSheet
        open={open}
        balance={balance}
        reward={reward}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
