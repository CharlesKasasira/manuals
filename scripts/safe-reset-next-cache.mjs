import { execFileSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, "apps", "web", ".next");
const force = process.argv.includes("--force");

function runningNextDevProcesses() {
  try {
    const output = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith(`${process.pid} `))
      .filter((line) => (/\bnext\b/.test(line) && /\bdev\b/.test(line)) || /\bnext-server\b/.test(line));
  } catch {
    return null;
  }
}

if (!existsSync(nextDir)) {
  console.log("No Next.js cache found at apps/web/.next.");
  process.exit(0);
}

const running = runningNextDevProcesses();
if (running === null && !force) {
  console.error("Refusing to reset apps/web/.next because running processes could not be inspected.");
  console.error("Stop the dev server first, then run npm run clean:next -- --force if you are sure nothing is building.");
  process.exit(1);
}

if (running.length && !force) {
  console.error("Refusing to reset apps/web/.next while next dev appears to be running.");
  console.error("Stop the dev server first, then run npm run clean:next.");
  console.error("Detected:");
  for (const processLine of running) console.error(`- ${processLine}`);
  process.exit(1);
}

const destination = path.join(tmpdir(), `manualflow-next-cache-${Date.now()}`);
renameSync(nextDir, destination);
console.log(`Moved apps/web/.next to ${destination}`);
