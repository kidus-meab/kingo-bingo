import { UserChip } from "@/components/user-chip";
import { patternLabel } from "@/lib/bingo";
import type { CalledBall, RoundWin } from "@/lib/game-types";

export function WinnerOverlay({
  wins,
  lastCalled,
  checking,
  onNextRound,
  busy,
}: {
  wins: RoundWin[];
  lastCalled: CalledBall | null;
  checking: boolean;
  onNextRound: () => void;
  busy: boolean;
}) {
  if (wins.length === 0) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-background/80 px-5 pb-6 backdrop-blur-sm">
      <div className="rounded-[1.75rem] bg-surface-strong p-5">
        <p className="text-center text-[11px] font-semibold tracking-[0.22em] text-theme uppercase">
          {checking ? "Checking co-winners" : wins.length > 1 ? "Co-winners" : "Winner"}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {wins.map((win) => (
            <UserChip
              key={win.id}
              user={{
                first_name: win.firstName,
                photo_url: win.photoUrl,
              }}
            />
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-foreground">
          {wins
            .map((win) => win.patterns.map(patternLabel).join(" + ") || patternLabel(win.pattern))
            .filter((value, index, list) => list.indexOf(value) === index)
            .join(" · ")}
          {lastCalled ? ` · last call ${lastCalled.label}` : ""}
        </p>
        {checking ? (
          <p className="mt-3 text-center text-xs text-muted">
            Same-number claims stay open for a few seconds.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onNextRound}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-theme font-bold text-on-theme disabled:opacity-45"
          >
            {busy ? "Starting…" : "Next round"}
          </button>
        )}
      </div>
    </div>
  );
}
