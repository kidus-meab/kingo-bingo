import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-route";
import { getRoundState } from "@/lib/round-play";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return NextResponse.json(await getRoundState(id, user));
  } catch (error) {
    return apiError(error);
  }
}
