import { NextResponse } from "next/server";

import { getCartelas } from "@/lib/cartelas";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const cartelas = await getCartelas();
    return NextResponse.json({ count: cartelas.length, cartelas });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not load cartelas",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
