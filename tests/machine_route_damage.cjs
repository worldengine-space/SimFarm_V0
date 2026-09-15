#!/usr/bin/env node
"use strict";

// Exercise the ground-route wear branches recovered from FUN_0d5f_07f8.
// Completed planting and spray tests provide independent DOS save oracles;
// this focused test locks the helper arithmetic, global counter, chain rule,
// machine-ID exception, terrain bounds, and signed watchdog comparison.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const source = canonicalSource.replace(
  "  load();\n",
  `  window.__simfarmMachineRouteDamageTest = {
    configure(slot, values) {
      const record = machineRecord(slot);
      const view = stateView(record);
      if (values.id !== undefined) view.setUint16(0, values.id, true);
      if (values.flags !== undefined) view.setUint16(2, values.flags, true);
      if (values.x !== undefined) record[5] = values.x;
      if (values.y !== undefined) record[6] = values.y;
      if (values.targetX !== undefined) record[7] = values.targetX;
      if (values.targetY !== undefined) record[8] = values.targetY;
      if (values.damage !== undefined) record[17] = values.damage;
      if (values.wearWord !== undefined) view.setUint16(18, values.wearWord, true);
      if (values.child !== undefined) view.setUint16(46, values.child, true);
      if (values.routeCounter !== undefined) record[55] = values.routeCounter;
      for (const offset of [9, 11, 13]) record[offset] = record[5];
      for (const offset of [10, 12, 14]) record[offset] = record[6];
    },
    setTile(x, y, tile) {
      const cell = mapCell(x, y);
      const view = stateView(cell);
      view.setUint16(0, (view.getUint16(0, true) & 0xf800) | tile, true);
    },
    setCounter(value) { groundRouteWearCounter = value; },
    counter() { return groundRouteWearCounter; },
    setMessage(value) { message = value; },
    message() { return message; },
    damage(slot, amount) { addMachineRouteDamage(slot, amount); },
    offroad(slot) { applyMachineOffroadRouteWear(slot); },
    route(slot) { advanceMachineRoute(slot); },
    record(slot) { return Array.from(machineRecord(slot)); },
  };
  load();
`,
);
if (source === canonicalSource)
  throw new Error("failed to instrument machine route damage runtime");

const regionData = JSON.parse(
  fs.readFileSync(path.join(root, "data/region.json"), "utf8"),
);
const saveData = JSON.parse(
  fs.readFileSync(path.join(root, "data/save-states.json"), "utf8"),
);
const originalText = JSON.parse(
  fs.readFileSync(path.join(root, "data/original-text.json"), "utf8"),
);

function createRuntime() {
  const drawingContext = new Proxy(
    {},
    {
      get(target, property) {
        if (!(property in target)) target[property] = () => {};
        return target[property];
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    },
  );
  const canvas = {
    getContext: () => drawingContext,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
    addEventListener: () => {},
    focus: () => {},
  };
  class MockImage {
    constructor() {
      this.width = 896;
      this.height = 768;
      this.onload = null;
    }
    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onload?.());
    }
  }
  class MockAudio {
    constructor() {
      this.currentTime = 0;
    }
    play() {
      return Promise.resolve();
    }
  }
  const sandbox = {
    console,
    document: {
      querySelector: () => canvas,
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => drawingContext,
      }),
    },
    location: { search: "?scenario=0&window=main" },
    Image: MockImage,
    Audio: MockAudio,
    URLSearchParams,
    Uint8Array,
    DataView,
    Date,
    performance: { now: () => 1 },
    requestAnimationFrame: () => 0,
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes("region.json")) return regionData;
        if (url.includes("original-text.json")) return originalText;
        return saveData;
      },
    }),
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "game.js" });
  return sandbox;
}

function expect(value, expected, label) {
  if (value !== expected) throw new Error(`${label}: ${value} != ${expected}`);
}

async function main() {
  const sandbox = createRuntime();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const test = sandbox.__simfarmMachineRouteDamageTest;

  test.configure(18, { id: 0, damage: 100, wearWord: 4, child: 0 });
  test.damage(18, 2);
  expect(test.record(18)[17], 103, "damage helper includes wearWord/4");
  test.configure(18, { damage: 250, wearWord: 20 });
  test.damage(18, 10);
  expect(test.record(18)[17], 255, "damage helper saturates");

  test.setTile(39, 25, 0x0f);
  test.configure(18, {
    id: 0,
    x: 39,
    y: 25,
    damage: 50,
    wearWord: 4,
    child: 25,
  });
  test.configure(25, { id: 3, damage: 70, wearWord: 8, child: 0 });
  test.setCounter(10);
  test.offroad(18);
  expect(test.counter(), 0, "eleventh off-road step resets global counter");
  expect(test.record(18)[17], 53, "eleventh off-road step damages root");
  expect(test.record(25)[17], 74, "eleventh off-road step damages child");
  expect(
    test.message(),
    originalText.qmessage[0x2c],
    "eleventh off-road step QMESSAGE",
  );

  test.configure(18, { id: 6, damage: 50, wearWord: 4, child: 25 });
  test.configure(25, { damage: 70, wearWord: 8 });
  test.setCounter(10);
  test.offroad(18);
  expect(test.record(18)[17], 50, "machine ID 6 root is exempt");
  expect(test.record(25)[17], 74, "machine ID 6 child still wears");

  test.setTile(39, 25, 0x1f);
  test.setCounter(10);
  test.offroad(18);
  expect(test.counter(), 10, "tile 0x1f is outside wear range");
  test.setTile(39, 25, 0x0e);
  test.offroad(18);
  expect(test.counter(), 10, "tile 0x0e is outside wear range");

  test.setTile(39, 25, 0x1e);
  test.configure(18, { id: 0, damage: 10, wearWord: 0, child: 0 });
  test.configure(19, {
    id: 0,
    x: 39,
    y: 25,
    damage: 20,
    wearWord: 0,
    child: 0,
  });
  test.setCounter(0);
  for (let index = 0; index < 5; index += 1) test.offroad(18);
  for (let index = 0; index < 5; index += 1) test.offroad(19);
  expect(test.counter(), 10, "off-road counter is shared across roots");
  expect(test.record(18)[17], 10, "first ten shared steps do not damage");
  test.offroad(18);
  expect(test.counter(), 0, "shared eleventh step resets");
  expect(
    test.record(18)[17],
    12,
    "shared eleventh step damages its current root",
  );

  for (let x = 39; x <= 49; x += 1) test.setTile(x, 25, 0x96);
  test.configure(18, {
    id: 0,
    flags: 0x22,
    x: 39,
    y: 25,
    targetX: 49,
    targetY: 25,
    damage: 50,
    wearWord: 4,
    child: 25,
    routeCounter: 0x3f,
  });
  test.configure(25, { id: 3, flags: 0x20, damage: 70, wearWord: 8, child: 0 });
  test.setCounter(0);
  test.setMessage("sentinel");
  test.route(18);
  let record = test.record(18);
  expect(record[5], 49, "watchdog snaps x to target");
  expect(record[6], 25, "watchdog snaps y to target");
  expect(record[17], 61, "watchdog uses wear-aware amount 10");
  expect(
    test.record(25)[17],
    70,
    "watchdog leaves linked child damage unchanged",
  );
  expect(record[55], 0, "watchdog resets route counter");
  expect(record[2] & 2, 0, "watchdog completes the snapped route");
  expect(test.message(), originalText.qmessage[0x2d], "watchdog QMESSAGE");

  test.configure(19, {
    id: 6,
    flags: 0x22,
    x: 39,
    y: 25,
    targetX: 49,
    targetY: 25,
    damage: 50,
    wearWord: 4,
    child: 0,
    routeCounter: 0x3f,
  });
  test.route(19);
  record = test.record(19);
  expect(record[5], 49, "ID 6 watchdog still snaps");
  expect(record[17], 50, "ID 6 watchdog damage exemption");
  expect(record[2] & 2, 0, "ID 6 watchdog still completes its route");

  test.configure(20, {
    id: 0,
    flags: 0x22,
    x: 39,
    y: 25,
    targetX: 49,
    targetY: 25,
    damage: 50,
    wearWord: 4,
    child: 0,
    routeCounter: 0x7f,
  });
  test.route(20);
  record = test.record(20);
  expect(record[5], 40, "signed-negative route counter does not snap");
  expect(record[17], 50, "signed-negative route counter does not damage");
  expect(record[55], 0x80, "route counter wraps through signed byte range");

  console.log(
    "native ground-route wear: helper, terrain counter/QMESSAGE, chain, exception, and watchdog exact",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
