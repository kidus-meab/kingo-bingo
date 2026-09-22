import "dotenv/config";

import { assertValidCartela, cartelaKey, parseCartelaCells } from "../lib/bingo";
import { db } from "./db";

async function main() {
  const rows = await db.orm.Cartela.select("id", "index", "cells")
    .orderBy((cartela) => cartela.index.asc())
    .all();
  const keys = new Set<string>();

  for (const row of rows) {
    const cells = parseCartelaCells(row.cells);
    assertValidCartela(cells);
    const key = cartelaKey(cells);
    if (keys.has(key)) {
      throw new Error(`Duplicate cartela at index ${row.index}`);
    }
    keys.add(key);
  }

  const room = await db.orm.Room.where({ code: "KINGO" }).first();
  const rounds = room
    ? await db.orm.Round.where({ roomId: room.id }).all()
    : [];

  console.log(
    JSON.stringify({
      cartelas: rows.length,
      unique: keys.size,
      firstIndex: rows[0]?.index ?? null,
      lastIndex: rows.at(-1)?.index ?? null,
      room: room?.code ?? null,
      rounds: rounds.length,
    }),
  );
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
