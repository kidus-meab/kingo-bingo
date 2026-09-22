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
export type RoundStatus = "pending" | "drawing" | "checking" | "finished";
export type WinPattern =
  | "row"
  | "column"
  | "diagonal"
  | "corners"
  | "blackout"
  | "any_line";

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
      throw new Error(`Cell ${i} value ${value} is outside ${column} ${from}–${to}`);
    }
  }
}

export function serializeCartelaCells(cells: BingoCells) {
  assertValidCartela(cells);
  return JSON.stringify(cells);
}
