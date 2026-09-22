import { CENTER_INDEX, COLUMNS, FREE_CELL, GRID_SIZE } from "@/lib/bingo";

type BingoCardProps = {
  cells: number[];
  marked?: boolean[];
  compact?: boolean;
};

export function BingoCard({
  cells,
  marked = [],
  compact = false,
}: BingoCardProps) {
  return (
    <div
      className={`w-full shrink-0 overflow-hidden rounded-[1.25rem] bg-surface-strong ${compact ? "p-1.5" : "p-3"}`}
    >
      <div
        className={`mb-1 grid grid-cols-5 text-center font-extrabold tracking-wide text-theme ${compact ? "text-[8px]" : "text-sm"}`}
      >
        {COLUMNS.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
          const value = cells[index] ?? FREE_CELL;
          const isFree = index === CENTER_INDEX || value === FREE_CELL;
          const isMarked = Boolean(marked[index]);

          return (
            <div
              key={index}
              className={`grid aspect-square place-items-center rounded-lg font-bold ${
                compact ? "text-[8px]" : "text-base"
              } ${
                isMarked
                  ? "bg-theme text-on-theme"
                  : "bg-background text-foreground"
              }`}
            >
              {isFree ? "FREE" : value}
            </div>
          );
        })}
      </div>
    </div>
  );
}
