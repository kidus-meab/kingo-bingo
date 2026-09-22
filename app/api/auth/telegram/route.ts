import { NextResponse } from "next/server";

import {
  InitDataError,
  validateTelegramInitData,
} from "@/lib/validate-init-data";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const initData =
    body &&
    typeof body === "object" &&
    "initData" in body &&
    typeof body.initData === "string"
      ? body.initData
      : "";

  if (!initData) {
    return NextResponse.json({ error: "Missing initData" }, { status: 400 });
  }

  try {
    const user = validateTelegramInitData(initData);
    return NextResponse.json({ user });
  } catch (error) {
    if (
      error instanceof InitDataError &&
      error.message === "BOT_ACCESS_TOKEN is not configured"
    ) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Invalid or expired initData" },
      { status: 401 },
    );
  }
}
