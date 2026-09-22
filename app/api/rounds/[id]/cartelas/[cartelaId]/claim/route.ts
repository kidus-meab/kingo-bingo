import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/api-route";
import { claimCartela } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; cartelaId: string }> },
) {
  try {
    const body = await readJson(request);
    const user = await requireUser(request, {
      initData: typeof body.initData === "string" ? body.initData : "",
    });
    const { id, cartelaId } = await context.params;
    const card = await claimCartela(id, cartelaId, user);
    return NextResponse.json(card);
  } catch (error) {
    return apiError(error);
  }
}
