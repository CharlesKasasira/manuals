import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, "..");
const repoRoot = resolve(apiRoot, "../..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const row of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = row.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const env = {
  ...process.env,
  ...parseEnvFile(resolve(repoRoot, ".env")),
  ...parseEnvFile(resolve(apiRoot, ".env"))
};

const args = process.argv.slice(2);
const command = args[0] === "db" && args[1] === "seed" ? "tsx" : "prisma";
const commandArgs = command === "tsx" ? ["prisma/seed.ts"] : args;
const result = spawnSync(command, commandArgs, {
  cwd: apiRoot,
  env,
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
