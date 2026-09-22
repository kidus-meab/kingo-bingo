import type { CalledBall } from "@/lib/game-types";

export function LastCalled({ ball }: { ball: CalledBall | null }) {
  if (!ball) {
    return (
      <div className="grid size-24 place-items-center rounded-full bg-surface text-sm text-muted">
        —
      </div>
    );
  }

  return (
    <div className="grid size-24 place-items-center rounded-full bg-theme text-on-theme shadow-[0_0_32px_color-mix(in_srgb,var(--theme)_40%,transparent)]">
      <div className="text-center leading-none">
        <p className="text-[11px] font-bold tracking-[0.2em]">{ball.label[0]}</p>
        <p className="text-3xl font-extrabold">{ball.value}</p>
      </div>
    </div>
  );
}

export function RecentCalls({ balls }: { balls: CalledBall[] }) {
  const recent = balls.slice(-5).reverse();
  if (recent.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {recent.map((ball) => (
        <span
          key={`${ball.order}-${ball.value}`}
          className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-foreground"
        >
          {ball.label}
        </span>
      ))}
    </div>
  );
}
