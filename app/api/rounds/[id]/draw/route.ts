import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/api-route";
import { drawRound } from "@/lib/round-play";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = await readJson(request);
    const user = await requireUser(request, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    const { id } = await context.params;
    const force = body.force === true;
    return NextResponse.json(await drawRound(id, user, force));
  } catch (error) {
    return apiError(error);
  }
}
