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
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close wallet"
        className="absolute inset-0 bg-background/40"
        onClick={onClose}
      />
      <div className="absolute top-[3.5rem] right-4 w-[min(calc(100%-2rem),16.5rem)] rounded-2xl bg-surface-strong p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <div className="absolute -top-1.5 right-8 size-3 rotate-45 bg-surface-strong" />
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2">
            <span className="text-xs text-muted">Balance</span>
            <span className="text-sm font-extrabold text-foreground tabular-nums">
              {balance} Br
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2">
            <span className="text-xs text-muted">Reward</span>
            <span className="text-sm font-extrabold text-theme tabular-nums">
              {reward} Br
            </span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/deposit");
            }}
            className="flex h-10 items-center justify-center rounded-xl bg-theme text-sm font-bold text-on-theme"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/send");
            }}
            className="flex h-10 items-center justify-center rounded-xl bg-surface text-sm font-bold text-foreground"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
