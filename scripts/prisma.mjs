import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raw = realpathSync(
  path.dirname(fileURLToPath(new URL("../prisma.config.ts", import.meta.url))),
);
const cwd = raw
  .replace(/\\/g, "/")
  .replace(/^([a-zA-Z]):/, (_, drive) => `${drive.toUpperCase()}:`);
process.chdir(cwd);

const result = spawnSync("bunx", ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  cwd,
  env: {
    ...process.env,
    PWD: cwd,
  },
});

process.exit(result.status ?? 1);
