import "dotenv/config";

import {
  CARTELA_COUNT,
  generateUniqueCartelas,
  serializeCartelaCells,
} from "../lib/bingo";
import { newId } from "../lib/ids";
import { db } from "./db";

async function seed() {
  const existingCartelas = await db.orm.Cartela.select("id").all();

  if (existingCartelas.length === 0) {
    const cards = generateUniqueCartelas(CARTELA_COUNT);
    await db.orm.Cartela.createAll(
      cards.map((cells, offset) => ({
        id: newId(),
        index: offset + 1,
        cells: serializeCartelaCells(cells),
      })),
    );
    console.log(`Seeded ${CARTELA_COUNT} cartelas`);
  } else {
    console.log(`Cartelas already present (${existingCartelas.length})`);
  }

  let room = await db.orm.Room.where({ code: "KINGO" }).first();
  if (!room) {
    room = await db.orm.Room.create({
      id: newId(),
      code: "KINGO",
      status: "waiting",
    });
    console.log("Seeded default room KINGO");
  }

  const rounds = (await db.orm.Round.where({ roomId: room.id }).all()) as Array<{
    status: string;
  }>;
  const currentRound = rounds.find((round) => round.status !== "finished");

  if (!currentRound) {
    await db.orm.Round.create({
      id: newId(),
      roomId: room.id,
      status: "pending",
      pattern: "any_line",
    });
    console.log("Seeded pending round for KINGO");
  }
}

async function main() {
  try {
    await seed();
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
