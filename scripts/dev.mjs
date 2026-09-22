import { spawn } from "node:child_process";

const children = [
  spawn("bun", ["run", "dev:api"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  }),
  spawn("bun", ["run", "dev:web"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  }),
];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGINT") return;
    shutdown(code ?? 1);
  });
}
