import { execFileSync } from "node:child_process";

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const processOutput = run("ps", ["-axo", "pid=,ppid=,command="]);
const repoProcesses = processOutput
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => line.includes("/manuals/") || line.includes("next-server"));

const nextProcesses = repoProcesses.filter((line) => /\bnext\b/.test(line) && /\bdev\b/.test(line));
const nextServers = repoProcesses.filter((line) => /\bnext-server\b/.test(line));
const nestWatchers = repoProcesses.filter((line) => /\bnest\b/.test(line) && /\bstart\b/.test(line) && /\bwatch\b/.test(line));
const apiChildren = repoProcesses.filter((line) => line.includes("/apps/api/dist/src/main"));

function printGroup(title, lines) {
  console.log(`\n${title} (${lines.length})`);
  if (!lines.length) {
    console.log("  none");
    return;
  }
  for (const line of lines) console.log(`  ${line}`);
}

console.log("Manualflow dev process doctor");
printGroup("Next dev commands", nextProcesses);
printGroup("Next server children", nextServers);
printGroup("Nest watch commands", nestWatchers);
printGroup("API server children", apiChildren);

const webPort = run("lsof", ["-nP", "-iTCP:3000", "-sTCP:LISTEN"]);
const apiPort = run("lsof", ["-nP", "-iTCP:4000", "-sTCP:LISTEN"]);
console.log("\nPort 3000 listener");
console.log(webPort || "  none");
console.log("\nPort 4000 listener");
console.log(apiPort || "  none");

const warnings = [];
if (nextProcesses.length > 1 || nextServers.length > 1) warnings.push("More than one Next dev/server process is active for this repo.");
if (nestWatchers.length > 1 || apiChildren.length > 1) warnings.push("More than one API watch/server process is active for this repo.");
if (!webPort) warnings.push("Nothing is listening on port 3000.");
if (!apiPort) warnings.push("Nothing is listening on port 4000.");

if (warnings.length) {
  console.log("\nWarnings");
  for (const warning of warnings) console.log(`- ${warning}`);
  process.exitCode = 1;
} else {
  console.log("\nLooks clean: one web listener and one API listener.");
}
