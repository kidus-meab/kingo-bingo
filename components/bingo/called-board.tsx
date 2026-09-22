import { COLUMN_RANGES, COLUMNS, formatBall } from "@/lib/bingo";
import type { CalledBall } from "@/lib/game-types";

export function CalledBoard({ balls }: { balls: CalledBall[] }) {
  const called = new Set(balls.map((ball) => ball.value));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-surface p-2">
      <p className="mb-1.5 shrink-0 text-center text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
        Called
      </p>
      <div className="grid min-h-0 flex-1 grid-cols-5 gap-1 overflow-y-auto">
        {COLUMNS.map((column) => {
          const [lo, hi] = COLUMN_RANGES[column];
          const numbers = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
          return (
            <div key={column} className="flex flex-col gap-0.5">
              <span className="text-center text-[10px] font-extrabold text-theme">
                {column}
              </span>
              {numbers.map((value) => {
                const isCalled = called.has(value);
                return (
                  <span
                    key={value}
                    title={formatBall(value)}
                    className={`grid aspect-square place-items-center rounded text-[9px] font-bold sm:text-[10px] ${
                      isCalled
                        ? "bg-theme text-on-theme"
                        : "bg-background/70 text-muted"
                    }`}
                  >
                    {value}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
