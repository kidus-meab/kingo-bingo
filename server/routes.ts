import { Hono } from "hono";

import { apiError, readJson } from "@/lib/api-route";
import { requireUser } from "@/lib/auth";
import { DEFAULT_ROOM_CODE } from "@/lib/bingo";
import { getCartelas } from "@/lib/cartelas";
import {
  advanceRound,
  claimBingo,
  drawRound,
  getRoundState,
  markCell,
  startNewRound,
  startRound,
} from "@/lib/round-play";
import {
  claimCartela,
  findCurrentRound,
  findRoom,
  getLobbyState,
  getMyCard,
  getRoundCartelas,
  joinRoom,
  listRooms,
  loadRound,
  RoomError,
} from "@/lib/rooms";
import {
  InitDataError,
  validateTelegramInitData,
} from "@/lib/validate-init-data";
import { createDeposit, getWalletState } from "@/lib/wallet";
import {
  listTransferPeers,
  listTransfers,
  sendTransfer,
} from "@/lib/transfers";

const api = new Hono();

api.post("/auth/telegram", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const initData =
    body &&
    typeof body === "object" &&
    "initData" in body &&
    typeof (body as { initData?: unknown }).initData === "string"
      ? (body as { initData: string }).initData
      : "";

  if (!initData) {
    return c.json({ error: "Missing initData" }, 400);
  }

  try {
    const user = validateTelegramInitData(initData);
    return c.json({ user });
  } catch (error) {
    if (
      error instanceof InitDataError &&
      error.message === "BOT_ACCESS_TOKEN is not configured"
    ) {
      return c.json({ error: "Server misconfigured" }, 500);
    }

    return c.json({ error: "Invalid or expired initData" }, 401);
  }
});

api.get("/cartelas", async (c) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Not found" }, 404);
  }

  try {
    const cartelas = await getCartelas();
    return c.json({ count: cartelas.length, cartelas });
  } catch (error) {
    return c.json(
      {
        error: "Could not load cartelas",
        detail: error instanceof Error ? error.message : "unknown",
      },
      500,
    );
  }
});

api.get("/rooms", async (c) => {
  try {
    await requireUser(c.req.raw);
    const rooms = await listRooms();
    return c.json({ rooms });
  } catch (error) {
    return apiError(error);
  }
});

api.post("/rooms/join", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    const code =
      typeof body.code === "string" && body.code.trim()
        ? body.code
        : DEFAULT_ROOM_CODE;
    const lobby = await joinRoom(code, user);
    await advanceRound(lobby.round.id);
    const round = (await loadRound(lobby.round.id)) ?? null;
    const room = await findRoom(lobby.room.id);
    if (round && room) {
      // May have auto-advanced to a newer round after finished → pending.
      const live = await findCurrentRound(room.id);
      if (live) {
        return c.json(await getLobbyState(room, live, user));
      }
      return c.json(await getLobbyState(room, round, user));
    }
    return c.json(lobby);
  } catch (error) {
    return apiError(error);
  }
});

api.get("/rooms/:id", async (c) => {
  try {
    const user = await requireUser(c.req.raw);
    const id = c.req.param("id");
    const room = await findRoom(id);
    if (!room) throw new RoomError("Room not found", 404);
    let round = await findCurrentRound(room.id);
    if (!round) throw new RoomError("Round not found", 404);
    await advanceRound(round.id);
    round = (await findCurrentRound(room.id)) ?? round;
    return c.json(await getLobbyState(room, round, user));
  } catch (error) {
    return apiError(error);
  }
});

api.post("/rooms/:id/rounds", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    return c.json(await startNewRound(c.req.param("id"), user));
  } catch (error) {
    return apiError(error);
  }
});

api.get("/me/card", async (c) => {
  try {
    const user = await requireUser(c.req.raw);
    const roundId = c.req.query("roundId");
    if (!roundId) throw new RoomError("Missing roundId", 400);
    const card = await getMyCard(roundId, user.id);
    return c.json({ card });
  } catch (error) {
    return apiError(error);
  }
});

api.get("/rounds/:id/cartelas", async (c) => {
  try {
    await requireUser(c.req.raw);
    const cartelas = await getRoundCartelas(c.req.param("id"));
    return c.json({ count: cartelas.length, cartelas });
  } catch (error) {
    return apiError(error);
  }
});

api.post("/rounds/:id/cartelas/:cartelaId/claim", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    const card = await claimCartela(
      c.req.param("id"),
      c.req.param("cartelaId"),
      user,
    );
    await advanceRound(c.req.param("id"));
    return c.json({ card });
  } catch (error) {
    return apiError(error);
  }
});

api.post("/rounds/:id/start", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    return c.json(await startRound(c.req.param("id"), user));
  } catch (error) {
    return apiError(error);
  }
});

api.post("/rounds/:id/draw", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    return c.json(
      await drawRound(c.req.param("id"), user, body.force === true),
    );
  } catch (error) {
    return apiError(error);
  }
});

api.post("/rounds/:id/mark", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    const cellIndex =
      typeof body.cellIndex === "number"
        ? body.cellIndex
        : Number(body.cellIndex);
    const card = await markCell(c.req.param("id"), user, cellIndex);
    return c.json(card);
  } catch (error) {
    return apiError(error);
  }
});

api.get("/rounds/:id/state", async (c) => {
  try {
    const user = await requireUser(c.req.raw);
    return c.json(await getRoundState(c.req.param("id"), user));
  } catch (error) {
    return apiError(error);
  }
});

api.post("/rounds/:id/bingo", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    return c.json(await claimBingo(c.req.param("id"), user));
  } catch (error) {
    return apiError(error);
  }
});

api.get("/wallet", async (c) => {
  try {
    const user = await requireUser(c.req.raw);
    return c.json(await getWalletState(user.id));
  } catch (error) {
    return apiError(error);
  }
});

api.post("/deposits", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    const deposit = await createDeposit(user.id, {
      amount: Number(body.amount),
      smsText: typeof body.smsText === "string" ? body.smsText : "",
      accountId: typeof body.accountId === "string" ? body.accountId : "",
    });
    return c.json({ deposit, wallet: await getWalletState(user.id) });
  } catch (error) {
    return apiError(error);
  }
});

api.get("/send", async (c) => {
  try {
    const user = await requireUser(c.req.raw);
    const wallet = await getWalletState(user.id);
    const [peers, transfers] = await Promise.all([
      listTransferPeers(user.id),
      listTransfers(user.id),
    ]);
    return c.json({
      balance: wallet.balance,
      firstName: wallet.firstName,
      photoUrl: wallet.photoUrl,
      peers,
      transfers,
    });
  } catch (error) {
    return apiError(error);
  }
});

api.post("/send", async (c) => {
  try {
    const body = await readJson(c.req.raw);
    const user = await requireUser(c.req.raw, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    const sent = await sendTransfer(user.id, {
      toUserId: typeof body.toUserId === "string" ? body.toUserId : undefined,
      username: typeof body.username === "string" ? body.username : undefined,
      amount: Number(body.amount),
    });
    const wallet = await getWalletState(user.id);
    const [peers, transfers] = await Promise.all([
      listTransferPeers(user.id),
      listTransfers(user.id),
    ]);
    return c.json({
      sent,
      page: {
        balance: wallet.balance,
        firstName: wallet.firstName,
        photoUrl: wallet.photoUrl,
        peers,
        transfers,
      },
    });
  } catch (error) {
    return apiError(error);
  }
});

export { api };
