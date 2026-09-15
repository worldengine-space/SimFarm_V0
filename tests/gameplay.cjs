#!/usr/bin/env node
"use strict";

// User-facing smoke checks drive the real event listeners. Source-derived
// camera expectations come from7a62:0aea, not the earlier incomplete handler.
const assert = require("node:assert/strict");
const { createRuntime } = require("./window_stack.cjs");

async function ready(bounds) {
  const runtime = createRuntime(bounds);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  runtime.api = runtime.sandbox.__simfarmWindowStackTest;
  return runtime;
}

async function main() {
  for (const bounds of [
    { left: 0, top: 0, width: 640, height: 480 },
    { left: 99.328125, top: 0, width: 1001.328125, height: 751 },
    { left: 0, top: 150, width: 375, height: 281.25 },
  ]) {
    const runtime = await ready(bounds);
    const api = runtime.api;
    const point = (x, y) => [
      bounds.left + ((x + 0.25) * bounds.width) / 640,
      bounds.top + ((y + 0.25) * bounds.height) / 480,
    ];
    const click = (x, y) => runtime.click(...point(x, y));
    // camera.x retains the historical native descriptororigin+1 convention;
    // the restored first visible column uses camera.x-1.
    const camera = () => {
      const { x, y } = api.snapshot().camera;
      return [x - 1, y];
    };
    const startFunds = api.snapshot().funds;
    // Overview, center, both extremes, exact inclusive lower/right border.
    for (const [x, y, expected] of [
      [200, 120, [24, 20]],
      [248, 176, [48, 48]],
      [152, 80, [0, 0]],
      [343, 271, [59, 71]],
      [344, 272, [59, 71]],
    ]) {
      api.prepareMap();
      click(x, y);
      assert.deepEqual(
        camera(),
        expected,
        `overview(${x},${y}) at width${bounds.width}`,
      );
      assert.equal(
        api.snapshot().activeWindow,
        "map",
        "navigation must keep Map open",
      );
      assert.equal(
        api.snapshot().mapNavigationHeld,
        false,
        "released Map navigation remained held",
      );
      assert.equal(
        api.snapshot().decodedViewport,
        true,
        "navigation did not repaint live farm",
      );
    }
    for (const [x, y] of [
      [151, 120],
      [345, 120],
      [200, 79],
      [200, 273],
    ]) {
      api.prepareMap();
      click(x, y);
      assert.deepEqual(
        camera(),
        [20, 20],
        "outside overview changed farm origin",
      );
    }
    const buttons = [
      [90, 86],
      [122, 86],
      [90, 118],
      [122, 118],
      [90, 150],
      [122, 150],
      [90, 182],
      [122, 182],
    ];
    for (let mode = 0; mode < buttons.length; mode += 1) {
      api.prepareMap();
      click(buttons[mode][0] + 12, buttons[mode][1] + 12);
      assert.equal(api.snapshot().mapMode, mode, `Map mode button${mode}`);
      click(248, 176);
      assert.deepEqual(
        camera(),
        mode === 0 ? [20, 20] : [48, 48],
        `navigation in mode${mode}`,
      );
      if (mode === 0)
        assert.deepEqual(
          { ...api.snapshot().selectedParcel },
          { x: 6, y: 6 },
          "Property mode must select a parcel instead of moving the farm",
        );
    }
    api.prepareMap();
    runtime.press(...point(180, 100));
    assert.equal(
      api.snapshot().simulationBlocked,
      true,
      "held Map loop must block simulation",
    );
    runtime.move(...point(212, 150));
    assert.deepEqual(camera(), [30, 35], "Map drag did not navigate");
    runtime.move(...point(350, 150));
    assert.equal(
      api.snapshot().mapNavigationHeld,
      false,
      "leaving Map did not stop tracking",
    );
    runtime.move(...point(200, 100));
    assert.deepEqual(
      camera(),
      [30, 35],
      "reentering restarted an ended native drag",
    );
    runtime.release(...point(200, 100));
    runtime.press(...point(180, 100));
    runtime.cancel();
    assert.equal(
      api.snapshot().simulationBlocked,
      false,
      "pointercancel left the game blocked",
    );
    // Actual title drag relocates Map; the overview uses the same local coordinates.
    runtime.press(...point(200, 70));
    runtime.move(...point(240, 100));
    runtime.release(...point(240, 100));
    const moved = api.snapshot().mapPosition;
    assert(
      moved.x !== 80 || moved.y !== 64,
      "Map title drag did not move its window",
    );
    click(moved.x + 120, moved.y + 56);
    assert.deepEqual(
      camera(),
      [24, 20],
      "moved Map used old click coordinates",
    );
    click(moved.x + 248, moved.y + 231);
    assert.equal(
      api.snapshot().activeWindow,
      null,
      "translated Map CLOSE failed",
    );
    assert.equal(
      api.snapshot().funds,
      startFunds,
      "navigation spent farm money",
    );
    click(112, 32); // Map toolbar icon.
    assert.equal(
      api.snapshot().activeWindow,
      "map",
      "Map toolbar failed to reopen",
    );
  }

  const animation = await ready();
  const api = animation.api;
  animation.setNow(100_000);
  api.prepareAnimation();
  animation.setNow(100_179);
  api.frame();
  assert.equal(
    api.snapshot().phase,
    0,
    "river animation ran before ninth tick",
  );
  animation.setNow(100_180);
  api.frame();
  assert.equal(
    api.snapshot().phase,
    1,
    "actual frame failed to animate river/pump tiles",
  );
  assert.equal(
    api.snapshot().decodedViewport,
    true,
    "animated authored farm still used the static startup screenshot",
  );
  animation.click(164, 8); // Speed menu.
  animation.click(164, 70); // Pause.
  assert.equal(api.snapshot().speed, "Pause", "Speed > Pause did not pause");
  const paused = api.snapshot();
  animation.setNow(120_000);
  api.frame();
  assert.equal(
    api.snapshot().phase,
    paused.phase,
    "Pause changed tile animation",
  );
  assert.equal(
    api.snapshot().weatherVaneFrame,
    paused.weatherVaneFrame,
    "Pause changed weather vane",
  );
  assert.equal(api.snapshot().day, paused.day, "Pause advanced the calendar");
  animation.click(164, 8);
  animation.click(164, 46); // Normal.
  assert.equal(api.snapshot().speed, "Normal", "Speed > Normal did not resume");
  api.frame();
  assert.equal(
    api.snapshot().phase,
    0,
    "resuming did not animate the already-due phase",
  );
  console.log(
    "basic gameplay: Map click/drag in8 views, strict edges, moved/scaled windows, CLOSE/reopen, cancellation, no charges, actual-frame animation, Pause/resume pass",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
