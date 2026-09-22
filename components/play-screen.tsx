"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BingoCard } from "@/components/bingo-card";
import { LastCalled, RecentCalls } from "@/components/called-ball";
import { UserChip } from "@/components/user-chip";
import { WinnerOverlay } from "@/components/winner-overlay";
import { AUTO_DRAW_MS, DEFAULT_ROOM_CODE } from "@/lib/bingo";
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

const LOBBY_POLL_MS = 3000;
const LIVE_POLL_MS = 1000;

type View = "picker" | "card";

function asLobby(state: RoundState): LobbyState {
  return {
    room: state.room,
    round: state.round,
    players: state.players,
    me: state.me,
  };
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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const lastBallRef = useRef<string | null>(null);

  const applyLive = useCallback((next: RoundState) => {
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

    if (knownRoundId && knownStatus && knownStatus !== "pending") {
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

    setLobby(nextLobby);
    setCard(cardPayload.card);
    setLive(null);

    // Always keep the number grid fresh while the round is still pending.
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
        statusRef.current === "drawing" || statusRef.current === "checking"
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
    if (card || status === "drawing" || status === "checking" || status === "finished") {
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

  useEffect(() => {
    const roundId = lobby?.round.id;
    if (!roundId || (live?.round.status ?? lobby.round.status) !== "drawing") {
      return;
    }

    const timer = window.setInterval(() => {
      void apiFetch<RoundState>(`/api/rounds/${roundId}/draw`, {
        method: "POST",
        body: JSON.stringify({}),
      })
        .then(applyLive)
        .catch(() => undefined);
    }, AUTO_DRAW_MS);

    return () => window.clearInterval(timer);
  }, [applyLive, live?.round.status, lobby]);

  async function claim(cartelaId: string) {
    if (!lobby) return;
    setBusyId(cartelaId);
    setError(null);
    try {
      const nextCard = await apiFetch<MyCard>(
        `/api/rounds/${lobby.round.id}/cartelas/${cartelaId}/claim`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setCard(nextCard);
      setPreviewId(nextCard.cartelaId);
      setChanging(false);
      setView("card");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim cartela");
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function startRound() {
    if (!lobby) return;
    setError(null);
    try {
      applyLive(
        await apiFetch<RoundState>(`/api/rounds/${lobby.round.id}/start`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the round");
    }
  }

  async function callNext() {
    if (!lobby) return;
    setError(null);
    try {
      applyLive(
        await apiFetch<RoundState>(`/api/rounds/${lobby.round.id}/draw`, {
          method: "POST",
          body: JSON.stringify({ force: true }),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not call a number");
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
      setError(err instanceof Error ? err.message : "Not a valid bingo");
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
  const drawing = status === "drawing";
  const checking = status === "checking";
  const finished = status === "finished";
  const shownCard = live?.myCard ?? card;
  const claimedCount = lobby.players.filter((player) => player.cartelaIndex).length;
  const showWinners = (checking || finished) && (live?.wins.length ?? 0) > 0;

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
        <UserChip
          user={{
            first_name: mine.firstName,
            photo_url: mine.photoUrl,
          }}
        />
      </header>

      {view === "picker" ? (
        <section className="px-4 pb-3">
          <div className="rounded-2xl bg-surface px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
                Room {lobby.room.code}
              </p>
              <p className="text-[11px] font-semibold text-theme uppercase">
                {waiting ? "Waiting" : status}
              </p>
            </div>
            <p className="mt-2 text-sm text-foreground">
              {lobby.players.filter((player) => player.cartelaIndex).length} of{" "}
              {lobby.players.length} picked a cartela
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lobby.players.map((player) => (
                <span
                  key={player.id}
                  className="rounded-full bg-background px-2.5 py-1 text-xs text-foreground"
                >
                  {player.firstName}
                  {player.cartelaIndex ? ` · #${player.cartelaIndex}` : " · picking"}
                </span>
              ))}
            </div>
          </div>
          {error ? <p className="mt-2 text-xs text-theme">{error}</p> : null}
        </section>
      ) : (
        <p className="px-4 pb-2 text-center text-xs text-muted">
          Room {lobby.room.code} · Cartela #{shownCard?.index} · {status}
        </p>
      )}

      {view === "card" ? (
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-5">
          {drawing || checking || finished ? (
            <div className="mb-4 flex flex-col items-center gap-3">
              <LastCalled ball={live?.lastCalled ?? null} />
              <RecentCalls balls={live?.calledNumbers ?? []} />
            </div>
          ) : null}

          {error && view === "card" ? (
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
                disabled={claimedCount === 0}
                onClick={() => void startRound()}
                className="h-12 rounded-2xl bg-theme font-bold text-on-theme disabled:opacity-45"
              >
                Start round
              </button>
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

          {drawing || checking ? (
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={bingoBusy || !shownCard}
                onClick={() => void shoutBingo()}
                className="h-14 rounded-2xl bg-theme text-lg font-extrabold tracking-[0.18em] text-on-theme disabled:opacity-45"
              >
                {bingoBusy ? "Checking…" : "BINGO"}
              </button>
              {drawing ? (
                <button
                  type="button"
                  onClick={() => void callNext()}
                  className="h-11 rounded-2xl bg-surface text-sm font-semibold text-foreground"
                >
                  Call next
                </button>
              ) : (
                <p className="text-center text-xs text-muted">
                  Holding the last number for co-winners…
                </p>
              )}
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
                        onClick={() => setPreviewId(cartela.id)}
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
                          disabled={
                            takenByOther || busyId === preview.id || isMine
                          }
                          onClick={() => void claim(preview.id)}
                          className="mt-3 h-12 shrink-0 rounded-2xl bg-theme font-bold text-on-theme disabled:opacity-45"
                        >
                          {busyId === preview.id
                            ? "Claiming…"
                            : isMine
                              ? `Using #${preview.index}`
                              : takenByOther
                                ? "Already taken"
                                : `Claim #${preview.index}`}
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
          checking={checking}
          busy={nextBusy}
          onNextRound={() => void nextRound()}
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
