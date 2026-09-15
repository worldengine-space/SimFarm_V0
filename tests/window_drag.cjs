#!/usr/bin/env node
"use strict";

// Lock the native movable-child behavior recovered at 1c43:06b4 and
// 42e9:0000: relative grab offsets, workspace clamps, release-time 16-pixel
// flooring, translated child controls, and persistent descriptor positions.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const source = canonicalSource.replace(
  "  load();\n",
  `  window.__simfarmWindowDragTest = {
    snapshot() {
      return {
        activeWindow,
        stack: windowStack.filter((name) => name !== editWindowSentinel),
        evaluation: gameWindowPosition("evaluation"),
        drag: windowDragState ? { ...windowDragState } : null,
      };
    },
    render,
  };
  load();
`,
);
if (source === canonicalSource)
  throw new Error("failed to instrument window-drag runtime");

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

function samePoint(actual, x, y, label) {
  assert(
    actual?.x === x && actual?.y === y,
    `${label}: expected ${x},${y}; got ${JSON.stringify(actual)}`,
  );
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
      drawingCalls.push({ type: "fillRect", color: this.fillStyle, args });
    },
    save() {
      drawingCalls.push({ type: "save", args: [] });
    },
    restore() {
      drawingCalls.push({ type: "restore", args: [] });
    },
    translate(...args) {
      drawingCalls.push({ type: "translate", args });
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
    Date,
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
    // Physical pointer coordinates refer to the middle of a displayed logical
    // pixel. Exercise the actual event conversion, including letterboxing.
    listeners.get(type)({
      clientX: bounds.left + ((x + 0.5) * bounds.width) / 640,
      clientY: bounds.top + ((y + 0.5) * bounds.height) / 480,
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
    down(x, y) {
      pointer("pointerdown", x, y);
    },
    move(x, y) {
      pointer("pointermove", x, y);
    },
    up(x, y) {
      pointer("pointerup", x, y);
    },
    cancel() {
      listeners.get("pointercancel")();
    },
    click(x, y) {
      pointer("pointerdown", x, y);
      pointer("pointerup", x, y);
    },
  };
}

async function main() {
  const runtime = createRuntime();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const test = runtime.sandbox.__simfarmWindowDragTest;

  runtime.click(80, 32); // Evaluation over the startup Map.
  samePoint(test.snapshot().evaluation, 128, 128, "descriptor origin");

  runtime.down(300, 136); // Grab offset 172,8.
  runtime.move(380, 200);
  let snapshot = test.snapshot();
  samePoint(snapshot.evaluation, 128, 128, "child stays put while held");
  samePoint(snapshot.drag, 208, 192, "live outline position");
  assert(
    runtime.drawingCalls.some(
      ({ type, color, args }) =>
        type === "fillRect" &&
        color === "#ffffff" &&
        args.join(",") === "208,192,353,1",
    ),
    "native held-drag outline was not painted at the raw coordinate",
  );

  runtime.up(380, 200);
  snapshot = test.snapshot();
  samePoint(snapshot.evaluation, 208, 192, "release-time grid floor");
  assert(snapshot.drag === null, "drag state survived release");
  runtime.clearDraws();
  test.render();
  assert(
    runtime.drawingCalls.some(
      ({ type, args }) => type === "translate" && args.join(",") === "80,64",
    ),
    "moved Evaluation child was not translated from its descriptor origin",
  );

  // Its original CLOSE rectangle is +288,+168 within the child. Controls
  // must follow the translated window, then reopening must reuse its position.
  runtime.click(520, 372);
  assert(
    test.snapshot().activeWindow === "map",
    "moved CLOSE did not reveal Map",
  );
  runtime.click(80, 32);
  samePoint(
    test.snapshot().evaluation,
    208,
    192,
    "reopened descriptor position",
  );

  runtime.down(380, 200);
  runtime.move(1, 1);
  runtime.up(1, 1);
  samePoint(test.snapshot().evaluation, 0, 48, "upper-left workspace clamp");

  runtime.down(172, 56);
  runtime.move(639, 479);
  runtime.up(639, 479);
  samePoint(
    test.snapshot().evaluation,
    288,
    272,
    "lower-right workspace clamp",
  );

  runtime.click(296, 280); // Evaluation's left title control at its moved position.
  assert(
    test.snapshot().activeWindow === "map",
    "title close did not reveal Map",
  );
  runtime.click(80, 32);
  runtime.click(200, 72); // Exposed inactive Map title.
  snapshot = test.snapshot();
  assert(
    snapshot.activeWindow === "map" && snapshot.stack.length === 0,
    `inactive-child activation did not unwind Evaluation: ${JSON.stringify(snapshot)}`,
  );
  runtime.click(88, 72); // Map's left title control.
  assert(
    test.snapshot().activeWindow === null,
    "Map title close did not reveal Edit",
  );

  // Cancelling a captured drag (for example when a touch gesture is taken
  // over by the browser) must erase the XOR outline immediately, even when
  // the world is paused and no animation triggers another render.
  runtime.click(80, 32);
  const positionBeforeCancel = { ...test.snapshot().evaluation };
  runtime.down(460, 280);
  runtime.move(430, 250);
  assert(test.snapshot().drag !== null, "cancel probe did not begin a drag");
  runtime.clearDraws();
  runtime.cancel();
  assert(
    test.snapshot().drag === null,
    "pointercancel retained the drag outline state",
  );
  samePoint(
    test.snapshot().evaluation,
    positionBeforeCancel.x,
    positionBeforeCancel.y,
    "cancelled drag preserves descriptor",
  );
  assert(
    runtime.drawingCalls.some(({ type }) => type === "drawImage"),
    "pointercancel did not repaint the screen to erase the held outline",
  );

  // A software cursor can look correct while controls still receive a
  // different coordinate space. Cover press, held movement, release and a
  // translated CLOSE button together at fractional and downscaled sizes.
  for (const bounds of [
    { left: 99.328125, top: 0, width: 1001.328125, height: 751 },
    { left: 0, top: 193.375, width: 375, height: 281.25 },
  ]) {
    const scaled = createRuntime(bounds);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const scaledTest = scaled.sandbox.__simfarmWindowDragTest;
    scaled.click(80, 32);
    assert(
      scaledTest.snapshot().activeWindow === "evaluation",
      `scaled toolbar click missed Evaluation: ${JSON.stringify(bounds)}`,
    );
    scaled.down(300, 136);
    scaled.move(380, 200);
    samePoint(scaledTest.snapshot().drag, 208, 192, "scaled live drag outline");
    scaled.up(380, 200);
    samePoint(
      scaledTest.snapshot().evaluation,
      208,
      192,
      "scaled release position",
    );
    scaled.click(520, 372);
    assert(
      scaledTest.snapshot().activeWindow === "map",
      `scaled translated CLOSE missed: ${JSON.stringify(bounds)}`,
    );
    scaled.click(88, 72);
    assert(
      scaledTest.snapshot().activeWindow === null,
      `scaled Map title close missed: ${JSON.stringify(bounds)}`,
    );
  }

  console.log(
    "native child MDI: drag geometry, controls, persistence, title close, ancestor activation, and scaled pointer event routing exact",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
