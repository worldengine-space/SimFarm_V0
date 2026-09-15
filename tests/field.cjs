#!/usr/bin/env node
"use strict";

// Execute the shipped native game in a minimal DOM, drive its real pointer
// handlers, save through its File menu, and inspect the resulting SFM payload.
// This is deliberately not a second implementation of the field routines.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const source = canonicalSource.replace(
  "  load();\n",
  `  window.__simfarmFieldMessageTest = {
    snapshot() {
      return {
        message,
        quickMessageRing: Array.from(quickMessageRing),
        quickMessageRingIndex,
      };
    },
  };
  load();
`,
);
if (source === canonicalSource)
  throw new Error("failed to instrument field QMESSAGE state");
const regionData = JSON.parse(
  fs.readFileSync(path.join(root, "data/region.json"), "utf8"),
);
const saveData = JSON.parse(
  fs.readFileSync(path.join(root, "data/save-states.json"), "utf8"),
);
const originalText = JSON.parse(
  fs.readFileSync(path.join(root, "data/original-text.json"), "utf8"),
);
const format = saveData.format;
const scenario = saveData.states.find(
  (candidate) => candidate.scenarioIndex === 2,
);
const fixture = Buffer.from(scenario.stateBase64, "base64");
const candidateX = 20;
const candidateY = 10;

function mapOffset(x, y) {
  return (
    format.displayCellMapOffset +
    (x * format.mapHeight + y) * format.mapCellSize
  );
}

// Make a deterministic valid patch inside marker 0's initial viewport. The
// original scenario bytes remain untouched on disk; only this in-memory fetch
// response is adapted to isolate native placement behavior.
for (let x = candidateX - 1; x <= candidateX + 8; x += 1) {
  for (let y = candidateY - 1; y <= candidateY + 8; y += 1) {
    const offset = mapOffset(x, y);
    const overlay = fixture.readUInt16LE(offset + 2) & ~0x1000;
    fixture.writeUInt16LE(overlay, offset + 2);
  }
}
for (let x = candidateX; x < candidateX + 8; x += 1) {
  for (let y = candidateY; y < candidateY + 8; y += 1) {
    const offset = mapOffset(x, y);
    fixture.writeUInt16LE(0x0019, offset);
    fixture.writeUInt16LE(0x0800, offset + 2);
  }
}
scenario.stateBase64 = fixture.toString("base64");

const listeners = new Map();
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
  addEventListener: (name, handler) => listeners.set(name, handler),
  setPointerCapture: () => {},
  focus: () => {},
};
const storage = new Map();

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
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  fetch: async (url) => {
    const data = url.includes("region.json")
      ? regionData
      : url.includes("original-text.json")
        ? originalText
        : saveData;
    return { ok: true, status: 200, json: async () => data };
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

async function main() {
  // Allow image and JSON promises in load() to settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Original Plant interaction is press-drag-release, then a map press.
  pointer("pointerdown", 40, 219);
  pointer("pointermove", 104, 136);
  pointer("pointerup", 104, 136);
  const messageTest = sandbox.__simfarmFieldMessageTest;
  if (
    messageTest.snapshot().quickMessageRingIndex !== 1 ||
    messageTest.snapshot().quickMessageRing[1] !== 17
  ) {
    throw new Error(
      `Plant selection QMESSAGE differs: ${JSON.stringify(messageTest.snapshot())}`,
    );
  }
  // The only direct QMESSAGE call in native placement callback 21c2:0002 is
  // record 51 on rejection. A later accepted placement must retain it.
  pointer("pointerdown", 560, 400);
  pointer("pointerup", 560, 400);
  if (
    messageTest.snapshot().quickMessageRingIndex !== 2 ||
    messageTest.snapshot().quickMessageRing[2] !== 51
  ) {
    throw new Error(
      `invalid field QMESSAGE differs: ${JSON.stringify(messageTest.snapshot())}`,
    );
  }
  pointer("pointermove", 136, 120);
  pointer("pointerdown", 136, 120);
  pointer("pointerup", 136, 120);
  if (
    messageTest.snapshot().quickMessageRingIndex !== 2 ||
    messageTest.snapshot().message !== originalText.qmessage[51]
  ) {
    throw new Error(
      `accepted field did not retain record 51: ${JSON.stringify(messageTest.snapshot())}`,
    );
  }

  // File -> Save serializes the private closure state through the real UI.
  pointer("pointerdown", 8, 8);
  pointer("pointerup", 8, 8);
  pointer("pointerdown", 20, 44);
  pointer("pointerup", 20, 44);

  const saved = JSON.parse(storage.get("simfarm-native-save"));
  const raw = Buffer.from(saved.stateBase64, "base64");
  const count = raw.readUInt16LE(format.fieldCountOffset);
  if (count !== 10) throw new Error(`expected field count 10, got ${count}`);
  const recordOffset = format.fieldRecordOffset + 10 * format.fieldRecordSize;
  const record = raw.subarray(
    recordOffset,
    recordOffset + format.fieldRecordSize,
  );
  if (
    record.readUInt16LE(0) !== 10 ||
    record[2] !== 3 ||
    record[3] !== 3 ||
    !(record[7] & 1)
  ) {
    throw new Error("native field record state/sequence/active bytes differ");
  }
  if ([...record.subarray(10, 15)].join(",") !== "20,10,8,8,0") {
    throw new Error("native field record coordinates, size, or crop differ");
  }
  const environmentalCell =
    ((candidateX + 4) >> 3) * 12 + ((candidateY + 4) >> 3);
  const environmental =
    format.environmentalGridOffset +
    environmentalCell * format.environmentalGridCellSize;
  if (
    record[20] !== raw[environmental + 2] ||
    record[21] !== raw[environmental + 4] ||
    record[22] !== raw[environmental + 3] ||
    record[28] !== raw[environmental + 6] ||
    record[29] !== raw[environmental + 6]
  ) {
    throw new Error("native field environmental samples differ");
  }

  const markerTiles = new Map([
    ["0,0", 0x21b],
    ["1,0", 0x21c],
    ["0,1", 0x21d],
    ["1,1", 0x21e],
  ]);
  for (let x = candidateX; x < candidateX + 8; x += 1) {
    for (let y = candidateY; y < candidateY + 8; y += 1) {
      const offset = mapOffset(x, y);
      const expected =
        markerTiles.get(`${x - candidateX},${y - candidateY}`) ?? 0x24;
      if (
        (raw.readUInt16LE(offset) & 0x07ff) !== expected ||
        (raw.readUInt16LE(offset + 2) & 0x1800) !== 0x1800
      ) {
        throw new Error(`native field footprint differs at (${x},${y})`);
      }
    }
  }
  if (saved.state.funds !== 39880)
    throw new Error(`expected native funds 39880, got ${saved.state.funds}`);
  console.log(
    "native field runtime: pointer UI -> slot 10 -> exact 8x8 saved footprint",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
