import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-route";
import { findCurrentRound, findRoom, getLobbyState, RoomError } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const room = await findRoom(id);
    if (!room) throw new RoomError("Room not found", 404);
    const round = await findCurrentRound(room.id);
    if (!round) throw new RoomError("Round not found", 404);
    return NextResponse.json(await getLobbyState(room, round, user));
  } catch (error) {
    return apiError(error);
  }
}
