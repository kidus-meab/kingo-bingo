import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { DEFAULT_ROOM_CODE } from "@/lib/bingo";
import { apiError, readJson } from "@/lib/api-route";
import { joinRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const user = await requireUser(request, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    const code =
      typeof body.code === "string" && body.code.trim()
        ? body.code
        : DEFAULT_ROOM_CODE;
    const lobby = await joinRoom(code, user);
    return NextResponse.json(lobby);
  } catch (error) {
    return apiError(error);
  }
}
