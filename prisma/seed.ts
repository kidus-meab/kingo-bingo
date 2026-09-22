import "dotenv/config";

import {
  CARTELA_COUNT,
  DEFAULT_ROUND_PATTERN,
  generateUniqueCartelas,
  serializeCartelaCells,
} from "../lib/bingo";
import { DEFAULT_ROOM_CODE, DEFAULT_STAKE_BIRR } from "../lib/config";
import { newId } from "../lib/ids";
import { db } from "./db";

const EXTRA_ROOMS: Array<{ code: string; stake: number }> = [
  { code: "QUICK", stake: 5 },
  { code: "GOLD", stake: 20 },
  { code: "VIP", stake: 50 },
];

async function ensureRoom(code: string, stake: number) {
  let room = await db.orm.Room.where({ code }).first();
  if (!room) {
    room = await db.orm.Room.create({
      id: newId(),
      code,
      status: "waiting",
      stake,
    });
    console.log(`Seeded room ${code} (${stake} Br)`);
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
      pattern: DEFAULT_ROUND_PATTERN,
    });
    console.log(`Seeded pending round for ${code}`);
  }
}

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

  await ensureRoom(DEFAULT_ROOM_CODE, DEFAULT_STAKE_BIRR);
  for (const room of EXTRA_ROOMS) {
    await ensureRoom(room.code, room.stake);
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
