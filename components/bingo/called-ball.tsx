import type { CalledBall } from "@/types/game";

export function LastCalled({ ball }: { ball: CalledBall | null }) {
  if (!ball) {
    return (
      <div className="grid size-24 place-items-center rounded-full bg-surface text-sm text-muted">
        —
      </div>
    );
  }

  return (
    <div
      key={`${ball.order}-${ball.value}`}
      className="ball-draw-pop grid size-24 place-items-center rounded-full bg-theme text-on-theme"
    >
      <p className="text-[1.65rem] font-extrabold tracking-tight leading-none">
        {ball.label}
      </p>
    </div>
  );
}

export function RecentCalls({ balls }: { balls: CalledBall[] }) {
  const recent = balls.slice(-5).reverse();
  if (recent.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {recent.map((ball, index) => (
        <span
          key={`${ball.order}-${ball.value}`}
          className={`rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-foreground ${
            index === 0 ? "ball-draw-pop bg-theme/20 text-theme" : ""
          }`}
        >
          {ball.label}
        </span>
      ))}
    </div>
  );
}
