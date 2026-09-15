#!/usr/bin/env node
"use strict";

// Lock the native child-window ordering recovered from the DOS reveal probes:
// Evaluation, Load Crop, and About preserve Map below them, paint back-to-front,
// and reveal that same child when the top window closes.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const source = canonicalSource.replace(
  "  load();\n",
  `  window.__simfarmWindowStackTest = {
    snapshot() {
      return {
        activeWindow,
        windowStack: windowStack.filter((name) => name !== editWindowSentinel),
        stage,
        camera: { ...camera },
        mapMode,
        selectedParcel,
        mapNavigationHeld,
        mapPosition: { ...gameWindowPosition("map") },
        simulationBlocked: nativeInputOwnsMainLoop(),
        phase: mapTileAnimationPhase,
        animationTick: mapTileAnimationLastTick,
        weatherVaneFrame,
        speed: state.speed,
        day: state.day,
        funds: state.funds,
        decodedViewport: shouldDrawDecodedViewport(),
      };
    },
    render,
    frame,
    prepareMap() {
      setOnlyGameWindow("map");
      editVisible = true;
      modalNotice = null;
      mapMode = -1;
      camera.x = 21; camera.y = 20;
      mapNavigationHeld = false;
    },
    prepareAnimation() {
      activeWindow = null;
      windowStack = [];
      modalNotice = null;
      state.speed = "Normal";
      writeSpeedRuntimeState("Normal");
      camera.x = camera.initialX; camera.y = camera.initialY;
      mapDirty = false;
      state.currentWeatherCondition = 0;
      resetMapTileAnimationTimer(Date.now());
      resetWeatherVaneTimer(Date.now());
      activityHoldoffPasses = 100;
    },
  };
  load();
`,
);
if (source === canonicalSource)
  throw new Error("failed to instrument window-stack runtime");

const datasets = new Map([
  [
    "region.json",
    JSON.parse(fs.readFileSync(path.join(root, "data/region.json"), "utf8")),
  ],
  [
    "save-states.json",
    JSON.parse(
      fs.readFileSync(path.join(root, "data/save-states.json"), "utf8"),
    ),
  ],
  [
    "original-text.json",
    JSON.parse(
      fs.readFileSync(path.join(root, "data/original-text.json"), "utf8"),
    ),
  ],
  [
    "help-cards.json",
    JSON.parse(
      fs.readFileSync(path.join(root, "data/help-cards.json"), "utf8"),
    ),
  ],
  [
    "crops.json",
    JSON.parse(fs.readFileSync(path.join(root, "data/crops.json"), "utf8")),
  ],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createRuntime(bounds = { left: 0, top: 0, width: 640, height: 480 }) {
  const listeners = new Map();
  const drawingCalls = [];
  const contextTarget = {
    fillStyle: "#000000",
    drawImage(...args) {
      drawingCalls.push({ type: "drawImage", args });
    },
    fillRect(...args) {
      drawingCalls.push({ type: "fillRect", args });
    },
  };
  const drawingContext = new Proxy(contextTarget, {
    get(target, property) {
      if (!(property in target)) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  const canvas = {
    getContext: () => drawingContext,
    getBoundingClientRect: () => bounds,
    addEventListener: (name, handler) => listeners.set(name, handler),
    setPointerCapture: () => {},
    focus: () => {},
  };
  class MockImage {
    constructor() {
      this.width = 640;
      this.height = 480;
      this.onload = null;
    }
    set src(value) {
      this._src = value;
      if (value.endsWith("/about.png")) [this.width, this.height] = [400, 224];
      queueMicrotask(() => this.onload?.());
    }
  }
  class MockAudio {
    play() {
      return Promise.resolve();
    }
  }
  const sandbox = {
    console,
    document: {
      querySelector: () => canvas,
      getElementById: () => null,
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => drawingContext,
      }),
    },
    location: { search: "?scenario=0" },
    Image: MockImage,
    Audio: MockAudio,
    URLSearchParams,
    Uint8Array,
    DataView,
    Date: class extends Date {
      static now() {
        return sandbox.__now ?? 100_000;
      }
    },
    performance: { now: () => 1 },
    requestAnimationFrame: () => 0,
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (url) => {
      const entry = [...datasets.entries()].find(([name]) =>
        url.includes(name),
      );
      return { ok: true, status: 200, json: async () => entry?.[1] };
    },
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "game.js" });

  function pointer(type, x, y) {
    listeners.get(type)({
      clientX: x,
      clientY: y,
      pointerId: 1,
      preventDefault: () => {},
    });
  }
  return {
    sandbox,
    drawingCalls,
    clearDraws() {
      drawingCalls.length = 0;
    },
    setNow(value) {
      sandbox.__now = value;
    },
    press(x, y) {
      pointer("pointerdown", x, y);
    },
    release(x, y) {
      pointer("pointerup", x, y);
    },
    cancel() {
      listeners.get("pointercancel")();
    },
    click(x, y) {
      pointer("pointerdown", x, y);
      pointer("pointerup", x, y);
    },
    move(x, y) {
      pointer("pointermove", x, y);
    },
    key(key) {
      listeners.get("keydown")({ key, preventDefault: () => {} });
    },
  };
}

function choose(runtime, menuX, itemY) {
  runtime.click(menuX, 8);
  runtime.click(menuX, itemY);
}

function assertState(test, activeWindow, windowStack, label) {
  const snapshot = test.snapshot();
  assert(
    snapshot.activeWindow === activeWindow &&
      snapshot.windowStack.join(",") === windowStack.join(","),
    `${label}: ${JSON.stringify(snapshot)}`,
  );
}

function assertEscapeIgnored(runtime, test, label) {
  const before = JSON.stringify(test.snapshot());
  runtime.key("Escape");
  const after = JSON.stringify(test.snapshot());
  assert(after === before, `${label} changed on Escape: ${before} -> ${after}`);
}

function imageIndex(runtime, suffix) {
  return runtime.drawingCalls.findIndex(
    ({ type, args }) => type === "drawImage" && args[0]?._src?.endsWith(suffix),
  );
}

function hasTileCall(runtime, sourceX, sourceY, destinationX, destinationY) {
  return runtime.drawingCalls.some(
    ({ type, args }) =>
      type === "drawImage" &&
      args[0]?._src?.endsWith("/ega16til.png") &&
      args.slice(1).join(",") ===
        [sourceX, sourceY, 16, 16, destinationX, destinationY, 16, 16].join(
          ",",
        ),
  );
}

async function main() {
  const runtime = createRuntime();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const test = runtime.sandbox.__simfarmWindowStackTest;
  assertState(test, "map", [], "startup Map");

  choose(runtime, 230, 46); // Windows > Evaluation.
  assertState(test, "evaluation", ["map"], "Evaluation over Map");
  runtime.clearDraws();
  test.render();
  const mapIndex = imageIndex(runtime, "/marker-0-map-window.png");
  const evaluationIndex = imageIndex(runtime, "/evaluate.png");
  assert(
    mapIndex >= 0 && evaluationIndex > mapIndex,
    "Evaluation did not paint after its underlying Map child",
  );
  assert(
    hasTileCall(runtime, 288, 80, 96, 64) &&
      hasTileCall(runtime, 304, 80, 352, 64),
    "underlying Map did not receive the native inactive title tiles 118/119",
  );
  assert(
    hasTileCall(runtime, 288, 80, 32, 48) &&
      hasTileCall(runtime, 304, 80, 608, 48),
    "underlying Edit did not receive the native inactive title tiles 118/119",
  );
  assert(
    hasTileCall(runtime, 16, 0, 144, 128) &&
      hasTileCall(runtime, 32, 0, 464, 128),
    "active Evaluation did not retain the native title tiles 1/2",
  );
  runtime.click(440, 308);
  assertState(test, "map", [], "Map after Evaluation Close");

  choose(runtime, 18, 82); // File > Load Crop.
  assertState(test, "load-crop", ["map"], "Load Crop over Map");
  runtime.clearDraws();
  test.render();
  const loadMapIndex = imageIndex(runtime, "/marker-0-map-window.png");
  const loadCropIndex = imageIndex(runtime, "/choscrop.png");
  assert(
    loadMapIndex >= 0 && loadCropIndex > loadMapIndex,
    "Load Crop did not paint after its underlying Map child",
  );
  runtime.key("Escape");
  assertState(test, "map", [], "Map after Load Crop Escape");
  choose(runtime, 18, 82);
  runtime.click(432, 307);
  assertState(test, "map", [], "Map after Load Crop content Close");

  choose(runtime, 18, 22); // File > About SimFarm.
  assertState(test, "about", ["map"], "About over Map");
  runtime.move(300, 208);
  assertState(test, "map", [], "Map after About pointer dismissal");

  choose(runtime, 230, 46);
  runtime.key("Escape");
  assertState(test, "evaluation", ["map"], "Evaluation ignores Escape");
  runtime.click(136, 136);
  assertState(test, "map", [], "Map after Evaluation title close");

  // Independent native before/after captures are byte-identical for all ten
  // ordinary Windows-menu children and the Edit root. They consume Escape
  // without using it as a generic close command.
  assertEscapeIgnored(runtime, test, "Map");
  for (const [x, name] of [
    [16, "buy"],
    [48, "sell"],
    [80, "evaluation"],
    [144, "weather"],
    [176, "balance"],
    [208, "bank"],
    [272, "market"],
  ]) {
    runtime.click(x, 32);
    assert(
      test.snapshot().activeWindow === name,
      `${name}: toolbar did not activate child`,
    );
    assertEscapeIgnored(runtime, test, name);
  }
  choose(runtime, 230, 130); // Windows > Farm Expert.
  assert(
    test.snapshot().activeWindow === "expert",
    "Farm Expert did not activate",
  );
  assertEscapeIgnored(runtime, test, "Farm Expert");

  choose(runtime, 18, 58); // File > Save As.
  assert(
    test.snapshot().activeWindow === "save-game",
    "Save Game did not activate",
  );
  assertEscapeIgnored(runtime, test, "Save Game");

  runtime.click(240, 32); // Bring Edit above the retained child stack.
  assert(test.snapshot().activeWindow === null, "Edit did not become active");
  assertEscapeIgnored(runtime, test, "Edit");

  console.log(
    "native window stack: child order, title-close reveal, all Escape rules, and title chrome exact",
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
module.exports = { createRuntime };
