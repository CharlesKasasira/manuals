import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, "..");
const repoRoot = resolve(apiRoot, "../..");
const outfile = resolve(apiRoot, "dist/seed.cjs");

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

await build({
  entryPoints: [resolve(apiRoot, "prisma/seed.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["@prisma/client", ".prisma/client"]
});

const env = {
  ...process.env,
  ...parseEnvFile(resolve(repoRoot, ".env")),
  ...parseEnvFile(resolve(apiRoot, ".env"))
};

const result = spawnSync("node", [outfile], {
  cwd: apiRoot,
  env,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
