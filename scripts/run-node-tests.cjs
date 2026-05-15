const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const electron = require("electron");

function findTests(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findTests(fullPath);
    return entry.name.endsWith(".test.cjs") ? [fullPath] : [];
  });
}

const tests = findTests(path.join(process.cwd(), "tests"));
const result = spawnSync(electron, ["--test", ...tests], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
});

process.exit(result.status ?? 1);
