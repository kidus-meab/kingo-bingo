import "dotenv/config";

import {
  CARTELA_COUNT,
  generateUniqueCartelas,
  serializeCartelaCells,
} from "../lib/bingo";
import { DEFAULT_ROOM_CODE, DEFAULT_STAKE_BIRR } from "../lib/config";
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

  let room = await db.orm.Room.where({ code: DEFAULT_ROOM_CODE }).first();
  if (!room) {
    room = await db.orm.Room.create({
      id: newId(),
      code: DEFAULT_ROOM_CODE,
      status: "waiting",
      stake: DEFAULT_STAKE_BIRR,
    });
    console.log(`Seeded default room ${DEFAULT_ROOM_CODE}`);
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
    console.log(`Seeded pending round for ${DEFAULT_ROOM_CODE}`);
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
