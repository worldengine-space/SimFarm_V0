#!/usr/bin/env node
"use strict";

// Drive File > Load Crop through the shipped renderer and pointer handlers.
// The mutation values and coordinates are pinned by controlled DOS captures.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const source = canonicalSource.replace(
  "  load();\n",
  `  window.__simfarmLoadCropTest = {
    snapshot() {
      const commodity = marketItemDefinition(loadCropSlot);
      const storedCrop = formatItemDefinition(
        "stored-crop", "storedCropItemDefinitionOffset", "storedCropItemDefinitionCount", loadCropSlot,
      );
      const seed = formatItemDefinition(
        "seed", "seedItemDefinitionOffset", "seedItemDefinitionCount", loadCropSlot,
      );
      const nameOffset = saveData.format.cropNameOffset
        + loadCropSlot * saveData.format.cropNameSize;
      return {
        activeWindow,
        modalNotice,
        slot: loadCropSlot,
        fileIndex: loadCropFileIndex,
        scroll: loadCropScroll,
        cropName: cropSlotName(loadCropSlot),
        filenameBytes: Array.from(farmStateBytes.subarray(
          nameOffset, nameOffset + saveData.format.cropNameSize,
        )),
        commodityPrice: commodity?.price,
        storedCropPrice: storedCrop?.price,
        seedPrice: seed?.price,
      };
    },
    setOwn(category, slot, value) {
      const sources = {
        seed: ["seedItemDefinitionOffset", "seedItemDefinitionCount"],
        stored: ["storedCropItemDefinitionOffset", "storedCropItemDefinitionCount"],
      };
      const source = sources[category];
      const item = formatItemDefinition(category, source[0], source[1], slot);
      stateView(item.record).setUint16(4, value, true);
    },
    render: drawLoadCropWindow,
  };
  load();
`,
);
if (source === canonicalSource)
  throw new Error("failed to instrument Load Crop runtime");

const regionData = JSON.parse(
  fs.readFileSync(path.join(root, "data/region.json"), "utf8"),
);
const saveData = JSON.parse(
  fs.readFileSync(path.join(root, "data/save-states.json"), "utf8"),
);
const originalText = JSON.parse(
  fs.readFileSync(path.join(root, "data/original-text.json"), "utf8"),
);
const helpData = JSON.parse(
  fs.readFileSync(path.join(root, "data/help-cards.json"), "utf8"),
);
const cropData = JSON.parse(
  fs.readFileSync(path.join(root, "data/crops.json"), "utf8"),
);

function createRuntime() {
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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
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
      if (value.endsWith("/choscrop.png"))
        [this.width, this.height] = [320, 224];
      else if (value.includes("/crops/")) [this.width, this.height] = [112, 96];
      else if (value.endsWith("/ega16til.png"))
        [this.width, this.height] = [320, 704];
      queueMicrotask(() => this.onload?.());
    }
  }
  class MockAudio {
    constructor(src) {
      this.src = src;
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
    fetch: async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes("region.json")) return regionData;
        if (url.includes("original-text.json")) return originalText;
        if (url.includes("help-cards.json")) return helpData;
        if (url.includes("crops.json")) return cropData;
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
    click(x, y) {
      pointer("pointerdown", x, y);
      pointer("pointerup", x, y);
    },
  };
}

async function readyRuntime() {
  const runtime = createRuntime();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return runtime;
}

function openLoadCrop(runtime) {
  runtime.click(18, 8);
  runtime.click(30, 82);
}

function selectSlot(runtime, slot) {
  runtime.click(192 + (slot & 3) * 32, 176 + Math.floor(slot / 4) * 32);
}

async function main() {
  const runtime = await readyRuntime();
  const test = runtime.sandbox.__simfarmLoadCropTest;
  openLoadCrop(runtime);
  let snapshot = test.snapshot();
  if (
    snapshot.activeWindow !== "load-crop" ||
    snapshot.slot !== 0 ||
    snapshot.fileIndex !== 0 ||
    snapshot.cropName !== "corn"
  ) {
    throw new Error(
      `initial Load Crop state differs: ${JSON.stringify(snapshot)}`,
    );
  }
  if (
    !runtime.drawingCalls.some(
      ({ type, args }) =>
        type === "drawImage" &&
        args[0]?._src?.endsWith("/choscrop.png") &&
        args[1] === 160 &&
        args[2] === 112,
    )
  ) {
    throw new Error(
      "CHOSCROP base did not paint at the recovered 160,112 origin",
    );
  }

  runtime.click(456, 280);
  snapshot = test.snapshot();
  if (snapshot.fileIndex !== 1 || snapshot.scroll !== 0) {
    throw new Error("catalog down arrow did not advance the selected file");
  }
  for (let index = 1; index < 16; index += 1) runtime.click(456, 280);
  snapshot = test.snapshot();
  if (snapshot.fileIndex !== 16 || snapshot.scroll !== 1) {
    throw new Error("catalog did not scroll after selection crossed row 16");
  }
  runtime.click(336, 280); // Visible row 15 addresses catalog entry 16 (Soybeans).
  if (test.snapshot().fileIndex !== 16)
    throw new Error("scrolled catalog row mapping differs");

  // Reopen to restore the native initial Almonds selection, then replace the
  // known-unused scenario-0 slot 15 (Peanuts).
  runtime.click(432, 307);
  openLoadCrop(runtime);
  selectSlot(runtime, 15);
  snapshot = test.snapshot();
  const storedPriceBefore = snapshot.storedCropPrice;
  runtime.clearDraws();
  runtime.click(376, 307);
  snapshot = test.snapshot();
  const expectedBytes = [...Buffer.from("ALMONDS.CRP", "ascii"), 0, 0, 0];
  if (
    snapshot.cropName !== "almonds" ||
    snapshot.commodityPrice !== 91 ||
    snapshot.seedPrice !== 75 ||
    snapshot.storedCropPrice !== storedPriceBefore ||
    snapshot.filenameBytes.join(",") !== expectedBytes.join(",")
  ) {
    throw new Error(
      `Peanuts -> Almonds SFM mutation differs: ${JSON.stringify(snapshot)}`,
    );
  }
  if (
    !runtime.drawingCalls.some(
      ({ type, args }) =>
        type === "drawImage" &&
        args[0]?._src?.endsWith("/crops/almonds.png") &&
        args[1] === 16 &&
        args[2] === 80 &&
        args[3] === 16 &&
        args[4] === 16 &&
        args[5] === 272 &&
        args[6] === 256,
    )
  ) {
    throw new Error(
      "replaced slot did not repaint from the Almonds CRP tile sheet",
    );
  }
  if (snapshot.activeWindow !== "load-crop" || snapshot.modalNotice !== null) {
    throw new Error(
      "successful replacement did not leave the original dialog open",
    );
  }

  // Almonds is now loaded, so selecting it for another free slot must take
  // the same blocking path as an outgoing crop that is in use.
  selectSlot(runtime, 14);
  runtime.click(376, 307);
  if (test.snapshot().modalNotice !== "load-crop-in-use") {
    throw new Error("duplicate loaded crop was not rejected");
  }
  runtime.click(320, 318);
  if (test.snapshot().modalNotice !== null)
    throw new Error("Load Crop notice OK did not dismiss");

  const growingRuntime = await readyRuntime();
  const growingTest = growingRuntime.sandbox.__simfarmLoadCropTest;
  openLoadCrop(growingRuntime);
  selectSlot(growingRuntime, 3); // Apples: nine live fields in SCEN2.SSM.
  growingRuntime.click(376, 307);
  if (growingTest.snapshot().modalNotice !== "load-crop-in-use") {
    throw new Error("growing outgoing crop was not rejected");
  }

  console.log(
    "native Load Crop: dialog, catalog, CRP prices, SFM bytes, artwork, and restrictions exact",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
