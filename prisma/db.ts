import path from "node:path";

import sqlite from "@prisma/orm-sqlite/runtime";

import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

function sqlitePath() {
  const raw = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(
    /^file:/,
    "",
  );
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export const db = sqlite<Contract>({
  contractJson,
  path: sqlitePath(),
});
