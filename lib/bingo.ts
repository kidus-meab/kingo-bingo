export const COLUMNS = ["B", "I", "N", "G", "O"] as const;
export type BingoColumn = (typeof COLUMNS)[number];

export const COLUMN_RANGES: Record<BingoColumn, readonly [number, number]> = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};

export const GRID_SIZE = 5;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
export const CENTER_INDEX = 12;
export const FREE_CELL = 0;
export const CARTELA_COUNT = 100;
export const CARTELA_SEED = 20260922;

export type RoomStatus = "waiting" | "playing" | "finished";
export type RoundStatus =
  | "pending"
  | "starting"
  | "drawing"
  | "finished";
export type WinPattern =
  "row" | "column" | "diagonal" | "corners" | "blackout" | "any_line";

export const WIN_PATTERNS = [
  "row",
  "column",
  "diagonal",
  "corners",
  "blackout",
] as const satisfies readonly WinPattern[];

export const ANY_LINE_PATTERNS = [
  "row",
  "column",
  "diagonal",
] as const satisfies readonly WinPattern[];

export const DEFAULT_ROUND_PATTERN: WinPattern = "any_line";
export const DEFAULT_ROOM_CODE = "KINGO";

export type BingoCells = number[];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function shuffle<T>(items: T[], rand: () => number) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function generateCartela(rand: () => number): BingoCells {
  const cells = Array<number>(CELL_COUNT).fill(FREE_CELL);

  COLUMNS.forEach((column, colIndex) => {
    const [from, to] = COLUMN_RANGES[column];
    const picks = shuffle(range(from, to), rand).slice(0, GRID_SIZE);
    for (let row = 0; row < GRID_SIZE; row += 1) {
      cells[row * GRID_SIZE + colIndex] = picks[row]!;
    }
  });

  cells[CENTER_INDEX] = FREE_CELL;
  return cells;
}

export function cartelaKey(cells: BingoCells) {
  return cells.join(",");
}

export function generateUniqueCartelas(
  count = CARTELA_COUNT,
  seed = CARTELA_SEED,
) {
  const rand = mulberry32(seed);
  const seen = new Set<string>();
  const cards: BingoCells[] = [];
  let attempts = 0;

  while (cards.length < count && attempts < count * 50) {
    attempts += 1;
    const cells = generateCartela(rand);
    const key = cartelaKey(cells);
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(cells);
  }

  if (cards.length !== count) {
    throw new Error(`Could not generate ${count} unique cartelas`);
  }

  return cards;
}

export function parseCartelaCells(raw: unknown): BingoCells {
  if (Array.isArray(raw)) {
    return raw.map((value) => Number(value));
  }

  if (typeof raw === "string") {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Cartela cells must be a JSON array");
    }
    return parsed.map((value) => Number(value));
  }

  throw new Error("Cartela cells must be a JSON array");
}

export function assertValidCartela(cells: BingoCells) {
  if (cells.length !== CELL_COUNT) {
    throw new Error(`Cartela must have ${CELL_COUNT} cells`);
  }

  if (cells[CENTER_INDEX] !== FREE_CELL) {
    throw new Error("Cartela center must be FREE (0)");
  }

  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (i === CENTER_INDEX) continue;
    const value = cells[i]!;
    const colIndex = i % GRID_SIZE;
    const column = COLUMNS[colIndex]!;
    const [from, to] = COLUMN_RANGES[column];
    if (value < from || value > to) {
      throw new Error(
        `Cell ${i} value ${value} is outside ${column} ${from}–${to}`,
      );
    }
  }
}

export function serializeCartelaCells(cells: BingoCells) {
  assertValidCartela(cells);
  return JSON.stringify(cells);
}

export const BALL_MIN = 1;
export const BALL_MAX = 75;
export const AUTO_DRAW_MS = 6000;
export const HOP_IN_MS = 30_000;
export const STARTING_MS = 5_000;
export const WINNER_MS = 5_000;
/** Default entry stake in Birr for a room. */
export const DEFAULT_STAKE_BIRR = 10;
/** Starting wallet for new players (dev / first join). */
export const DEFAULT_BALANCE_BIRR = 1000;
/** @deprecated Co-winner window removed; kept for any stray imports. */
export const CO_WIN_MS = 0;

export function columnForNumber(value: number): BingoColumn | null {
  for (const column of COLUMNS) {
    const [from, to] = COLUMN_RANGES[column];
    if (value >= from && value <= to) return column;
  }
  return null;
}

export function formatBall(value: number) {
  const column = columnForNumber(value);
  return column ? `${column}${value}` : String(value);
}

export function marksForCells(cells: BingoCells, called: Iterable<number>) {
  const set = new Set(called);
  return cells.map((value, index) => {
    if (index === CENTER_INDEX || value === FREE_CELL) return true;
    return set.has(value);
  });
}

/**
 * Marks that count for bingo: player-daubed AND (FREE or actually called).
 * Premature taps stay on the card but do not satisfy a win.
 */
export function effectiveMarks(
  cells: BingoCells,
  marks: boolean[],
  called: Iterable<number>,
) {
  const set = new Set(called);
  return cells.map((value, index) => {
    if (index === CENTER_INDEX || value === FREE_CELL) return true;
    return Boolean(marks[index]) && set.has(value);
  });
}

/** Manual-mark board: only FREE is pre-marked. */
export function emptyMarks(): boolean[] {
  return Array.from({ length: CELL_COUNT }, (_, index) => index === CENTER_INDEX);
}

export function parseMarks(raw: string | null | undefined): boolean[] {
  const fallback = emptyMarks();
  if (!raw || raw === "[]") return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== CELL_COUNT) return fallback;
    return parsed.map((value, index) =>
      index === CENTER_INDEX ? true : Boolean(value),
    );
  } catch {
    return fallback;
  }
}

export function serializeMarks(marks: boolean[]): string {
  const next = marks.slice(0, CELL_COUNT);
  while (next.length < CELL_COUNT) next.push(false);
  next[CENTER_INDEX] = true;
  return JSON.stringify(next.map(Boolean));
}

function rowComplete(marks: boolean[], row: number) {
  const start = row * GRID_SIZE;
  return Array.from({ length: GRID_SIZE }, (_, col) => marks[start + col]).every(
    Boolean,
  );
}

function columnComplete(marks: boolean[], col: number) {
  return Array.from(
    { length: GRID_SIZE },
    (_, row) => marks[row * GRID_SIZE + col],
  ).every(Boolean);
}

export function hasRow(marks: boolean[]) {
  return Array.from({ length: GRID_SIZE }, (_, row) => rowComplete(marks, row)).some(
    Boolean,
  );
}

export function hasColumn(marks: boolean[]) {
  return Array.from({ length: GRID_SIZE }, (_, col) => columnComplete(marks, col)).some(
    Boolean,
  );
}

export function hasDiagonal(marks: boolean[]) {
  const main = Array.from(
    { length: GRID_SIZE },
    (_, i) => marks[i * GRID_SIZE + i],
  ).every(Boolean);
  const anti = Array.from(
    { length: GRID_SIZE },
    (_, i) => marks[i * GRID_SIZE + (GRID_SIZE - 1 - i)],
  ).every(Boolean);
  return main || anti;
}

export function hasCorners(marks: boolean[]) {
  const last = GRID_SIZE - 1;
  return Boolean(
    marks[0] &&
      marks[last] &&
      marks[last * GRID_SIZE] &&
      marks[last * GRID_SIZE + last],
  );
}

export function hasBlackout(marks: boolean[]) {
  return marks.length === CELL_COUNT && marks.every(Boolean);
}

export function findWinningPatterns(marks: boolean[]): WinPattern[] {
  const found: WinPattern[] = [];
  if (hasRow(marks)) found.push("row");
  if (hasColumn(marks)) found.push("column");
  if (hasDiagonal(marks)) found.push("diagonal");
  if (hasCorners(marks)) found.push("corners");
  if (hasBlackout(marks)) found.push("blackout");
  return found;
}

export function enabledPatterns(roundPattern: string): WinPattern[] {
  if (roundPattern === "any_line") return [...ANY_LINE_PATTERNS];
  if ((WIN_PATTERNS as readonly string[]).includes(roundPattern)) {
    return [roundPattern as WinPattern];
  }
  return [...ANY_LINE_PATTERNS];
}

export function matchedPatterns(marks: boolean[], roundPattern: string) {
  const enabled = new Set(enabledPatterns(roundPattern));
  return findWinningPatterns(marks).filter((pattern) => enabled.has(pattern));
}

export function patternLabel(pattern: string) {
  switch (pattern) {
    case "row":
      return "a row";
    case "column":
      return "a column";
    case "diagonal":
      return "a diagonal";
    case "corners":
      return "four corners";
    case "blackout":
      return "blackout";
    default:
      return pattern.replaceAll("_", " ");
  }
}
