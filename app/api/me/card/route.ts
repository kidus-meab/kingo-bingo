import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-route";
import { getMyCard, RoomError } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const roundId = new URL(request.url).searchParams.get("roundId");
    if (!roundId) throw new RoomError("Missing roundId", 400);
    const card = await getMyCard(roundId, user.id);
    return NextResponse.json({ card });
  } catch (error) {
    return apiError(error);
  }
}
