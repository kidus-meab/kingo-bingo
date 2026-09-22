import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";

import { api } from "./routes";

/**
 * Optional standalone Hono process for Bun:
 *   bun server/index.ts
 *
 * Normal `bun run dev` serves the same routes from
 * app/api/[[...route]]/route.ts inside Next.js.
 */
const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowHeaders: ["Content-Type", "X-Telegram-Init-Data", "X-Dev-User"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/", (c) => c.json({ ok: true, service: "kingo-bingo-api" }));
app.route("/api", api);

const port = Number(process.env.API_PORT ?? 4000);

console.log(`Kingo API ready on http://127.0.0.1:${port}`);

export default {
  port,
  fetch: app.fetch,
};

export { app, api };
