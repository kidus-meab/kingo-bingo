"use client";

import { useRouter } from "next/navigation";

export function BalanceSheet({
  balance,
  reward,
  open,
  onClose,
}: {
  balance: number;
  reward: number;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-background/80 px-5 pb-6 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative rounded-[1.75rem] bg-surface-strong p-5">
        <p className="text-center text-[11px] font-semibold tracking-[0.22em] text-theme uppercase">
          Wallet
        </p>
        <div className="mt-5 grid gap-3">
          <div className="flex items-center justify-between rounded-2xl bg-background px-4 py-3">
            <span className="text-sm text-muted">Balance</span>
            <span className="text-base font-extrabold text-foreground tabular-nums">
              {balance} Br
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-background px-4 py-3">
            <span className="text-sm text-muted">Reward</span>
            <span className="text-base font-extrabold text-theme tabular-nums">
              {reward} Br
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/deposit")}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-theme font-bold text-on-theme"
        >
          Deposit
        </button>
      </div>
    </div>
  );
}
