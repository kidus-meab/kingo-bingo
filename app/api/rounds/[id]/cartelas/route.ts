import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-route";
import { getRoundCartelas } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(request);
    const { id } = await context.params;
    const cartelas = await getRoundCartelas(id);
    return NextResponse.json({ count: cartelas.length, cartelas });
  } catch (error) {
    return apiError(error);
  }
}
