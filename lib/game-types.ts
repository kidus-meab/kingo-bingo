import type { BingoCells, WinPattern } from "@/lib/bingo";

export type PlayerSummary = {
  id: string;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
  cartelaId: string | null;
  cartelaIndex: number | null;
  disqualified?: boolean;
};

export type LobbyState = {
  room: { id: string; code: string; status: string };
  round: {
    id: string;
    status: string;
    pattern: WinPattern;
    phaseEndsAt: string | null;
  };
  players: PlayerSummary[];
  me: PlayerSummary;
};

export type RoundCartela = {
  id: string;
  index: number;
  cells: BingoCells;
  takenBy: PlayerSummary | null;
};

export type MyCard = {
  id: string;
  roundId: string;
  cartelaId: string;
  index: number;
  cells: BingoCells;
  marked: boolean[];
  disqualified: boolean;
};

export type CalledBall = {
  value: number;
  order: number;
  label: string;
  calledAt: string;
};

export type RoundWin = {
  id: string;
  userId: string;
  firstName: string;
  photoUrl: string | null;
  pattern: string;
  patterns: WinPattern[];
  claimedAt: string;
  cartelaIndex?: number | null;
  cells?: BingoCells | null;
};

export type RoundState = {
  room: { id: string; code: string; status: string };
  round: {
    id: string;
    status: string;
    pattern: WinPattern;
    phaseEndsAt: string | null;
  };
  calledNumbers: CalledBall[];
  lastCalled: CalledBall | null;
  players: PlayerSummary[];
  me: PlayerSummary;
  myCard: MyCard | null;
  wins: RoundWin[];
  checkingUntil: string | null;
};
