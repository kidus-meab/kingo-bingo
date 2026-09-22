import { AuthError } from "@/lib/auth";
import { RoomError } from "@/lib/rooms";

export function apiError(error: unknown) {
  if (error instanceof AuthError || error instanceof RoomError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
