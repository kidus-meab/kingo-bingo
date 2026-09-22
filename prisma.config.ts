import "dotenv/config";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-sqlite/config";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/kingo.db";
const sqlitePath = databaseUrl.replace(/^file:/, "");

export default definePrismaConfig({
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
  orm: ormConfig({
    contract: "./prisma/contract.prisma",
    db: {
      connection: sqlitePath,
    },
  }),
});
