/**
 * Categorized Kingo runtime config.
 * Prefer `KINGO_*` on the server; use `NEXT_PUBLIC_KINGO_*` for client-safe values
 * (or set both to the same number). Lookup order: NEXT_PUBLIC_ first, then plain.
 */

function rawEnv(name: string): string | undefined {
  const publicName = name.startsWith("NEXT_PUBLIC_")
    ? name
    : `NEXT_PUBLIC_${name}`;
  const value = process.env[publicName] ?? process.env[name];
  if (value == null || value.trim() === "") return undefined;
  return value.trim();
}

function intEnv(name: string, fallback: number): number {
  const raw = rawEnv(name);
  if (raw == null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function strEnv(name: string, fallback: string): string {
  return rawEnv(name) ?? fallback;
}

// --- Game timing (ms) ---
export const AUTO_DRAW_MS = intEnv("KINGO_AUTO_DRAW_MS", 6_000);
export const HOP_IN_MS = intEnv("KINGO_HOP_IN_MS", 30_000);
export const STARTING_MS = intEnv("KINGO_STARTING_MS", 5_000);
export const WINNER_MS = intEnv("KINGO_WINNER_MS", 5_000);
/** @deprecated Co-winner window removed. */
export const CO_WIN_MS = intEnv("KINGO_CO_WIN_MS", 0);

// --- Client polling (ms) ---
export const LOBBY_POLL_MS = intEnv("KINGO_LOBBY_POLL_MS", 2_000);
export const LIVE_POLL_MS = intEnv("KINGO_LIVE_POLL_MS", 1_000);

// --- Bingo board / cartelas ---
export const BALL_MIN = intEnv("KINGO_BALL_MIN", 1);
export const BALL_MAX = intEnv("KINGO_BALL_MAX", 75);
export const CARTELA_COUNT = intEnv("KINGO_CARTELA_COUNT", 100);
export const CARTELA_SEED = intEnv("KINGO_CARTELA_SEED", 20_260_922);

// --- Room defaults ---
export const DEFAULT_ROOM_CODE = strEnv("KINGO_ROOM_CODE", "KINGO");
export const DEFAULT_ROUND_PATTERN = strEnv("KINGO_ROUND_PATTERN", "any_line");

// --- Economy (Birr) ---
export const DEFAULT_STAKE_BIRR = intEnv("KINGO_STAKE_BIRR", 10);
export const DEFAULT_BALANCE_BIRR = intEnv("KINGO_BALANCE_BIRR", 1_000);
export const MIN_DEPOSIT_BIRR = intEnv("KINGO_MIN_DEPOSIT_BIRR", 10);
export const MIN_TRANSFER_BIRR = intEnv("KINGO_MIN_TRANSFER_BIRR", 1);

/** First-join reward credited to rewardBalance. Prefers FIRST_REWARD, then KINGO_FIRST_REWARD. */
export const FIRST_REWARD_BIRR = (() => {
  const raw = rawEnv("FIRST_REWARD") ?? rawEnv("KINGO_FIRST_REWARD");
  if (raw == null) return 100;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 100;
})();

export type DepositAccountSeed = {
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  active?: number;
  sortOrder?: number;
};

const FALLBACK_DEPOSIT_ACCOUNTS: DepositAccountSeed[] = [
  {
    label: "CBE",
    bankName: "Commercial Bank of Ethiopia",
    accountName: "Kidus Abrham",
    accountNumber: "1000463043535",
    active: 1,
    sortOrder: 1,
  },
  {
    label: "Telebirr",
    bankName: "Telebirr",
    accountName: "Kidus Abrham",
    accountNumber: "0942811432",
    active: 1,
    sortOrder: 2,
  },
];

/** JSON array of deposit accounts, or built-in CBE / Telebirr defaults. */
export function depositAccountSeeds(): DepositAccountSeed[] {
  const raw = rawEnv("KINGO_DEPOSIT_ACCOUNTS");
  if (!raw) return FALLBACK_DEPOSIT_ACCOUNTS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return FALLBACK_DEPOSIT_ACCOUNTS;
    }
    return parsed.map((item, index) => {
      const row = item as Partial<DepositAccountSeed>;
      return {
        label: String(row.label ?? `Account ${index + 1}`),
        bankName: String(row.bankName ?? ""),
        accountName: String(row.accountName ?? ""),
        accountNumber: String(row.accountNumber ?? ""),
        active: Number(row.active ?? 1),
        sortOrder: Number(row.sortOrder ?? index + 1),
      };
    });
  } catch {
    return FALLBACK_DEPOSIT_ACCOUNTS;
  }
}
