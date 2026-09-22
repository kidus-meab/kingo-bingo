import { BingoCard } from "@/components/bingo-card";
import { UserChip } from "@/components/user-chip";
import { patternLabel } from "@/lib/bingo";
import type { CalledBall, RoundWin } from "@/lib/game-types";

export function WinnerOverlay({
  wins,
  lastCalled,
  nextInSec,
  onSkip,
  busy,
}: {
  wins: RoundWin[];
  lastCalled: CalledBall | null;
  nextInSec: number | null;
  onSkip?: () => void;
  busy: boolean;
}) {
  if (wins.length === 0) return null;
  const winner = wins[0]!;

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-background/80 px-5 pb-6 backdrop-blur-sm">
      <div className="rounded-[1.75rem] bg-surface-strong p-5">
        <p className="text-center text-[11px] font-semibold tracking-[0.22em] text-theme uppercase">
          Winner
        </p>
        <div className="mt-4 flex justify-center">
          <UserChip
            user={{
              first_name: winner.firstName,
              photo_url: winner.photoUrl,
            }}
          />
        </div>
        <p className="mt-3 text-center text-sm text-foreground">
          {winner.patterns.map(patternLabel).join(" + ") ||
            patternLabel(winner.pattern)}
          {winner.cartelaIndex != null ? ` · Cartela #${winner.cartelaIndex}` : ""}
          {lastCalled ? ` · last ${lastCalled.label}` : ""}
        </p>
        {winner.cells ? (
          <div className="mx-auto mt-4 max-w-[14rem]">
            <BingoCard cells={winner.cells} compact />
          </div>
        ) : null}
        <p className="mt-4 text-center text-xs text-muted">
          {nextInSec != null && nextInSec > 0
            ? `Next game in ${nextInSec}s`
            : "Starting next game…"}
        </p>
        {onSkip ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-surface text-sm font-semibold text-foreground disabled:opacity-45"
          >
            {busy ? "Starting…" : "Skip to next"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
