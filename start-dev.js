#!/usr/bin/env node
// Dev server launcher - starts vite from the frontend subdirectory
const { spawnSync } = require("child_process");
const path = require("path");

const frontendDir = path.join(__dirname, "frontend");

// Filter out any --root args injected by tooling
const extraArgs = process.argv.slice(2).filter(a => !a.startsWith("--root"));

spawnSync(
  process.execPath,
  [path.join(frontendDir, "node_modules", "vite", "bin", "vite.js"), "--port", "5173", "--host", "localhost", ...extraArgs],
  { cwd: frontendDir, stdio: "inherit" }
);
