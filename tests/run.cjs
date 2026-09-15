"use strict";

// Run each suite in a fresh process so its simulated browser remains isolated.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const suites = [
  "save_compat",
  "field",
  "machine_route_damage",
  "weather",
  "load_crop",
  "lifecycle",
  "window_drag",
  "window_stack",
  "gameplay",
];
for (const suite of suites) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, `${suite}.cjs`)],
    {
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`All ${suites.length} regression suites passed.`);
