import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const backendPort = process.env.ORVIA_BACKEND_PORT || "3001";
const nextPort = process.env.ORVIA_FRONTEND_PORT || "3000";

const env = {
  ...process.env,
  PORT: backendPort,
};

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

const children = [
  spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    stdio: "inherit",
    env,
  }),
  // Invoke Next directly through Node instead of spawning npm.cmd.
  // This avoids Windows EINVAL/spawn failures when npm is a .cmd shim.
  spawn(process.execPath, [nextBin, "dev", "-p", nextPort], {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, PORT: nextPort },
  }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 250);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (stopping) return;
    if (signal) stop(1);
    else if (code !== 0) stop(code || 1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
