"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BingoCard } from "@/components/bingo-card";
import { CalledBoard } from "@/components/called-board";
import { LastCalled, RecentCalls } from "@/components/called-ball";
import { UserChip } from "@/components/user-chip";
import { WalletChip } from "@/components/wallet-chip";
import { WinnerOverlay } from "@/components/winner-overlay";
import { DEFAULT_ROOM_CODE } from "@/lib/bingo";
import { LIVE_POLL_MS, LOBBY_POLL_MS } from "@/lib/config";
import {
  apiFetch,
  getStoredDevUserId,
  setStoredDevUserId,
} from "@/lib/client-session";
import { DEV_USERS } from "@/lib/dev-users";
import type { LobbyState, MyCard, RoundCartela, RoundState } from "@/lib/game-types";
import {
  hapticImpact,
  hapticNotify,
  setTelegramBackButton,
} from "@/lib/telegram";

type View = "picker" | "card";

function asLobby(state: RoundState): LobbyState {
  return {
    room: state.room,
    round: state.round,
    players: state.players,
    me: state.me,
  };
}

function useCountdown(endsAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return;
    }

    const tick = () => {
      const ms = Date.parse(endsAt) - Date.now();
      setRemaining(Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : null);
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  return remaining;
}

export function PlayScreen({ code = DEFAULT_ROOM_CODE }: { code?: string }) {
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [cartelas, setCartelas] = useState<RoundCartela[]>([]);
  const [card, setCard] = useState<MyCard | null>(null);
  const [live, setLive] = useState<RoundState | null>(null);
  const [view, setView] = useState<View>("picker");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [devUserId, setDevUserId] = useState("0");
  const [changing, setChanging] = useState(false);
  const [bingoBusy, setBingoBusy] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const lastBallRef = useRef<string | null>(null);
  const lastRoundIdRef = useRef<string | null>(null);

  const applyLive = useCallback((next: RoundState) => {
    if (
      lastRoundIdRef.current &&
      lastRoundIdRef.current !== next.round.id &&
      next.round.status === "pending"
    ) {
      lastBallRef.current = null;
      setCartelas([]);
      setChanging(false);
      setView("picker");
      setCard(next.myCard);
      setLive(null);
      setLobby(asLobby(next));
      lastRoundIdRef.current = next.round.id;
      return;
    }

    lastRoundIdRef.current = next.round.id;
    setLive(next);
    setLobby(asLobby(next));
    setCard(next.myCard);
    const label = next.lastCalled?.label ?? null;
    if (label && label !== lastBallRef.current) {
      lastBallRef.current = label;
      hapticImpact("medium");
    }
  }, []);

  const refresh = useCallback(async () => {
    const knownRoundId = live?.round.id ?? lobby?.round.id;
    const knownStatus = live?.round.status ?? lobby?.round.status;

    if (
      knownRoundId &&
      knownStatus &&
      knownStatus !== "pending"
    ) {
      const nextLive = await apiFetch<RoundState>(
        `/api/rounds/${knownRoundId}/state`,
      );
      applyLive(nextLive);
      return { lobby: asLobby(nextLive), card: nextLive.myCard };
    }

    const nextLobby = await apiFetch<LobbyState>("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    });

    if (nextLobby.round.status !== "pending") {
      const nextLive = await apiFetch<RoundState>(
        `/api/rounds/${nextLobby.round.id}/state`,
      );
      applyLive(nextLive);
      return { lobby: asLobby(nextLive), card: nextLive.myCard };
    }

    const cardPayload = await apiFetch<{ card: MyCard | null }>(
      `/api/me/card?roundId=${nextLobby.round.id}`,
    );

    lastRoundIdRef.current = nextLobby.round.id;
    setLobby(nextLobby);
    setCard(cardPayload.card);
    setLive(null);

    const cartelaPayload = await apiFetch<{ cartelas: RoundCartela[] }>(
      `/api/rounds/${nextLobby.round.id}/cartelas`,
    );
    setCartelas(cartelaPayload.cartelas);
    setPreviewId((current) => {
      if (current) return current;
      const preferred =
        cartelaPayload.cartelas.find(
          (cartela) => cartela.takenBy?.id === nextLobby.me.id,
        ) ??
        (cardPayload.card
          ? cartelaPayload.cartelas.find(
              (cartela) => cartela.id === cardPayload.card?.cartelaId,
            )
          : null) ??
        cartelaPayload.cartelas.find((cartela) => !cartela.takenBy);
      return preferred?.id ?? null;
    });

    return { lobby: nextLobby, card: cardPayload.card };
  }, [applyLive, code, live?.round.id, live?.round.status, lobby?.round.id, lobby?.round.status]);

  useEffect(() => {
    setDevUserId(getStoredDevUserId());
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const statusRef = useRef(live?.round.status ?? lobby?.round.status);
  statusRef.current = live?.round.status ?? lobby?.round.status;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        await refreshRef.current();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not join room");
        }
      }
    }

    void boot();
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void refreshRef
          .current()
          .catch(() => undefined)
          .finally(() => {
            if (!cancelled) schedule();
          });
      },
        statusRef.current === "drawing" ||
          statusRef.current === "starting" ||
          statusRef.current === "finished"
          ? LIVE_POLL_MS
          : LOBBY_POLL_MS,
      );
    };
    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const status = live?.round.status ?? lobby?.round.status;
    if (changing) return;
    if (
      card ||
      status === "drawing" ||
      status === "starting" ||
      status === "finished"
    ) {
      setView("card");
    }
  }, [card, changing, live?.round.status, lobby?.round.status]);

  useEffect(() => {
    if (!lobby) {
      setTelegramBackButton(null);
      return;
    }

    if (view === "card") {
      setTelegramBackButton(() => {
        if ((live?.round.status ?? lobby.round.status) === "pending") {
          setChanging(true);
          setView("picker");
          return;
        }
        router.push("/");
      });
    } else {
      setTelegramBackButton(() => router.push("/"));
    }

    return () => setTelegramBackButton(null);
  }, [live?.round.status, lobby, router, view]);

  async function claim(cartelaId: string) {
    if (!lobby) return;
    setBusyId(cartelaId);
    setError(null);
    try {
      const payload = await apiFetch<{ card: MyCard | null }>(
        `/api/rounds/${lobby.round.id}/cartelas/${cartelaId}/claim`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const nextCard = payload.card;
      setCard(nextCard);
      setPreviewId(cartelaId);
      if (nextCard) {
        setChanging(false);
        setView("card");
      } else {
        setChanging(true);
        setView("picker");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim cartela");
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function markCell(index: number) {
    if (!lobby || markBusy) return;
    setMarkBusy(true);
    setError(null);
    try {
      const nextCard = await apiFetch<MyCard>(
        `/api/rounds/${lobby.round.id}/mark`,
        {
          method: "POST",
          body: JSON.stringify({ cellIndex: index }),
        },
      );
      setCard(nextCard);
      if (live) {
        setLive({ ...live, myCard: nextCard });
      }
      hapticImpact("light");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark cell");
    } finally {
      setMarkBusy(false);
    }
  }

  async function shoutBingo() {
    if (!lobby) return;
    setBingoBusy(true);
    setError(null);
    try {
      applyLive(
        await apiFetch<RoundState>(`/api/rounds/${lobby.round.id}/bingo`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      hapticNotify("success");
    } catch (err) {
      hapticNotify("error");
      setError(err instanceof Error ? err.message : "INVALID Bingo");
      await refresh().catch(() => undefined);
    } finally {
      setBingoBusy(false);
    }
  }

  async function nextRound() {
    if (!lobby) return;
    setNextBusy(true);
    setError(null);
    try {
      const nextLobby = await apiFetch<LobbyState>(
        `/api/rooms/${lobby.room.id}/rounds`,
        { method: "POST", body: JSON.stringify({}) },
      );
      lastBallRef.current = null;
      lastRoundIdRef.current = nextLobby.round.id;
      setLive(null);
      setCard(null);
      setCartelas([]);
      setChanging(false);
      setView("picker");
      setLobby(nextLobby);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a new round");
    } finally {
      setNextBusy(false);
    }
  }

  function switchDevUser(id: string) {
    setStoredDevUserId(id);
    setDevUserId(id);
    setLobby(null);
    setCard(null);
    setLive(null);
    setView("picker");
    window.location.reload();
  }

  const phaseEndsAt =
    live?.round.phaseEndsAt ?? lobby?.round.phaseEndsAt ?? null;
  const countdown = useCountdown(phaseEndsAt);

  if (!lobby) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-5">
        <p className="text-sm text-muted">
          {error ?? "Joining the KINGO room…"}
        </p>
      </main>
    );
  }

  const mine = lobby.me;
  const status = live?.round.status ?? lobby.round.status;
  const waiting = status === "pending";
  const starting = status === "starting";
  const drawing = status === "drawing";
  const finished = status === "finished";
  const shownCard = live?.myCard ?? card;
  const disqualified =
    shownCard?.disqualified || mine.disqualified || live?.me.disqualified;
  const showWinners = finished && (live?.wins.length ?? 0) > 0;
  const livePlay = drawing || starting || finished;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-xs font-semibold tracking-[0.18em] text-theme uppercase"
        >
          Kingo
        </button>
        <div className="flex items-center gap-2">
          <WalletChip balance={(live?.me.balance ?? mine.balance) ?? 0} />
          <UserChip
            user={{
              first_name: mine.firstName,
              photo_url: mine.photoUrl,
            }}
          />
        </div>
      </header>

      {view === "picker" ? (
        <section className="px-4 pb-2">
          <div className="rounded-2xl bg-surface px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-extrabold tracking-tight text-foreground">
                {lobby.room.code}
              </h2>
              <p className="text-xs font-semibold text-theme">
                {waiting
                  ? countdown != null
                    ? `${countdown}s`
                    : "Waiting"
                  : status}
              </p>
            </div>

            {waiting && countdown != null ? (
              <p className="mt-1.5 text-center text-2xl font-extrabold text-theme tabular-nums">
                {countdown}
              </p>
            ) : null}

            <p className="mt-2 text-xs text-muted">
              <span className="font-semibold text-foreground">
                {lobby.room.stake} Br
              </span>{" "}
              stake
              <span className="mx-1.5 text-foreground/30">·</span>
              <span className="font-semibold text-theme">
                {lobby.round.pot} Br
              </span>{" "}
              pot
              <span className="mx-1.5 text-foreground/30">·</span>
              <span className="font-semibold text-foreground">
                {lobby.players.filter((player) => player.cartelaIndex).length}/
                {lobby.players.length}
              </span>{" "}
              cards
            </p>

            {lobby.players.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lobby.players.map((player) => (
                  <span
                    key={player.id}
                    className="rounded-lg bg-background px-2 py-1 text-xs text-foreground"
                  >
                    <span className="font-semibold">{player.firstName}</span>
                    <span className="text-muted">
                      {player.cartelaIndex
                        ? ` #${player.cartelaIndex}`
                        : " …"}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-xs text-theme">{error}</p> : null}
        </section>
      ) : (
        <p className="px-4 pb-2 text-center text-xs text-muted">
          Room {lobby.room.code}
          {` · ${lobby.room.stake} Br`}
          {` · Pot ${(live?.round.pot ?? lobby.round.pot) || 0} Br`}
          {shownCard ? ` · Cartela #${shownCard.index}` : ""}
          {waiting && countdown != null
            ? ` · ${countdown}s`
            : starting && countdown != null
              ? ` · Start in ${countdown}s`
              : ` · ${status}`}
        </p>
      )}

      {view === "card" && livePlay ? (
        <section className="flex min-h-0 flex-1 flex-col px-3 pb-4">
          {starting ? (
            <div className="mb-3 flex flex-col items-center justify-center rounded-2xl bg-surface px-4 py-8">
              <p className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
                Get ready
              </p>
              <p className="mt-2 text-6xl font-extrabold text-theme tabular-nums">
                {countdown ?? "…"}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mb-2 text-center text-xs text-theme">{error}</p>
          ) : null}

          {disqualified && drawing ? (
            <p className="mb-2 text-center text-xs font-semibold text-theme">
              INVALID Bingo
            </p>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-2">
            <CalledBoard balls={live?.calledNumbers ?? []} />

            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              <div className="flex flex-col items-center gap-2">
                <LastCalled ball={live?.lastCalled ?? null} />
                <RecentCalls balls={live?.calledNumbers ?? []} />
              </div>

              {shownCard ? (
                <div
                  className={
                    disqualified ? "pointer-events-none opacity-40" : undefined
                  }
                >
                  <BingoCard
                    cells={shownCard.cells}
                    marked={shownCard.marked}
                    interactive={drawing && !disqualified}
                    disabled={!drawing || Boolean(disqualified) || markBusy}
                    onCellClick={(index) => void markCell(index)}
                  />
                </div>
              ) : (
                <p className="text-center text-sm text-muted">
                  You did not pick a cartela this round.
                </p>
              )}

              {drawing ? (
                <button
                  type="button"
                  disabled={
                    bingoBusy || !shownCard || Boolean(disqualified)
                  }
                  onClick={() => void shoutBingo()}
                  className="h-14 shrink-0 rounded-2xl bg-theme text-lg font-extrabold tracking-[0.18em] text-on-theme disabled:opacity-45"
                >
                  {bingoBusy
                    ? "Checking…"
                    : disqualified
                      ? "INVALID Bingo"
                      : "BINGO"}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : view === "card" ? (
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-5">
          {waiting && countdown != null ? (
            <div className="mb-4 flex flex-col items-center rounded-2xl bg-surface px-4 py-6">
              <p className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
                Hop-in closes
              </p>
              <p className="mt-2 text-5xl font-extrabold text-theme tabular-nums">
                {countdown}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mb-2 text-center text-xs text-theme">{error}</p>
          ) : null}

          {shownCard ? (
            <div className="mx-auto w-full max-w-[20rem]">
              <BingoCard cells={shownCard.cells} marked={shownCard.marked} />
            </div>
          ) : (
            <p className="text-center text-sm text-muted">
              You have not picked a cartela this round.
            </p>
          )}

          {waiting ? (
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setChanging(true);
                  setView("picker");
                  if (card) setPreviewId(card.cartelaId);
                  void refresh();
                }}
                className="h-12 rounded-2xl bg-surface font-semibold text-foreground"
              >
                Change cartela
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col px-4 pb-5">
          <p className="mb-3 shrink-0 text-sm text-muted">
            Tap a number, preview the card, then claim it.
          </p>
          {cartelas.length === 0 ? (
            <p className="text-sm text-muted">Loading cartelas…</p>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3">
              <div className="min-h-0 overflow-y-auto rounded-2xl bg-surface p-2">
                <div className="grid grid-cols-5 gap-1.5">
                  {cartelas.map((cartela) => {
                    const takenByOther =
                      Boolean(cartela.takenBy) &&
                      cartela.takenBy?.id !== mine.id;
                    const isMine = cartela.takenBy?.id === mine.id;
                    const isPreview = previewId === cartela.id;

                    return (
                      <button
                        key={cartela.id}
                        type="button"
                        disabled={!waiting && !isMine}
                        onClick={() => {
                          setPreviewId(cartela.id);
                          if (isMine && waiting) {
                            void claim(cartela.id);
                          }
                        }}
                        className={`aspect-square rounded-lg text-xs font-bold transition-colors ${
                          isPreview
                            ? "bg-theme text-on-theme"
                            : isMine
                              ? "bg-theme/25 text-theme ring-1 ring-theme"
                              : takenByOther
                                ? "bg-background/40 text-muted line-through opacity-50"
                                : "bg-background text-foreground"
                        }`}
                        title={
                          isMine
                            ? "Yours"
                            : takenByOther
                              ? `Taken · ${cartela.takenBy?.firstName}`
                              : `Cartela #${cartela.index}`
                        }
                      >
                        {cartela.index}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex min-h-0 flex-col overflow-y-auto">
                {(() => {
                  const preview =
                    cartelas.find((cartela) => cartela.id === previewId) ??
                    cartelas[0] ??
                    null;
                  if (!preview) {
                    return (
                      <p className="text-sm text-muted">Select a cartela.</p>
                    );
                  }

                  const takenByOther =
                    Boolean(preview.takenBy) && preview.takenBy?.id !== mine.id;
                  const isMine = preview.takenBy?.id === mine.id;

                  return (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-foreground">
                          Cartela #{preview.index}
                        </p>
                        <p className="text-[11px] text-muted">
                          {isMine
                            ? "Yours"
                            : takenByOther
                              ? `Taken · ${preview.takenBy?.firstName}`
                              : "Free"}
                        </p>
                      </div>
                      <BingoCard cells={preview.cells} />
                      {waiting ? (
                        <button
                          type="button"
                          disabled={takenByOther || busyId === preview.id}
                          onClick={() => void claim(preview.id)}
                          className="mt-3 h-12 shrink-0 rounded-2xl bg-theme font-bold text-on-theme disabled:opacity-45"
                        >
                          {busyId === preview.id
                            ? isMine
                              ? "Releasing…"
                              : "Claiming…"
                            : isMine
                              ? `Release #${preview.index}`
                              : takenByOther
                                ? "Already taken"
                                : `Claim #${preview.index} · ${lobby.room.stake} Br`}
                        </button>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </section>
      )}

      {showWinners ? (
        <WinnerOverlay
          wins={live?.wins ?? []}
          lastCalled={live?.lastCalled ?? null}
          nextInSec={countdown}
          busy={nextBusy}
          onSkip={() => void nextRound()}
        />
      ) : null}

      {process.env.NODE_ENV !== "production" && view === "picker" ? (
        <div className="flex gap-2 px-4 pb-4">
          {Object.keys(DEV_USERS).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => switchDevUser(id)}
              className={`rounded-full px-3 py-1 text-[11px] ${
                devUserId === id
                  ? "bg-theme text-on-theme"
                  : "bg-surface text-muted"
              }`}
            >
              Local {DEV_USERS[id]?.first_name}
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}
