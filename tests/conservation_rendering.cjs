#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createGameRuntime } = require("./lib/full_game_runtime.cjs");

async function main() {
  const runtime = await createGameRuntime({ scenario: 0 });
  runtime.api.setup({ camera: { x: 20, y: 20 }, dirty: true, window: null });
  const x = 150;
  const y = 150;
  const before = runtime.context.getImageData(x, y, 1, 1).data;

  runtime.api.setConservationContracts([{ parcelX: 3, parcelY: 3 }]);
  const after = runtime.context.getImageData(x, y, 1, 1).data;
  const overlay = [86, 132, 47];
  for (let channel = 0; channel < 3; channel += 1) {
    const expected = Math.round(
      before[channel] * 0.72 + overlay[channel] * 0.28,
    );
    assert(
      Math.abs(after[channel] - expected) <= 1,
      `conservation tint channel ${channel}: expected ${expected} from ${Array.from(before)}, got ${Array.from(after)}`,
    );
  }
  assert.equal(after[3], 255, "conservation overlay changed map opacity");
  console.log(
    "conservation rendering: static scenario map receives the configured green tint",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
