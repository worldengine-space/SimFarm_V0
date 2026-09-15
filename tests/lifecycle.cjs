#!/usr/bin/env node
"use strict";

// Lock the native startup-card lifecycle and blocking About presentation to
// controlled DOS timing probes and the reconstructed resource composition.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const source = canonicalSource.replace(
  "  load();\n",
  `  window.__simfarmLifecycleTest = {
    snapshot() {
      return {
        stage,
        activeWindow,
        startupStageStartedAt,
        pointer: { ...pointer },
        aboutCreditsPhase,
        aboutCreditsLine,
        aboutCreditsLastTick,
      };
    },
    resetTimer: resetStartupStageTimer,
    advanceTimer: advanceStartupStageTick,
    advanceAbout: advanceAboutCredits,
    setStage(value) { stage = value; },
    render,
    captureAboutText() {
      const calls = [];
      const originalDrawText = drawText;
      drawText = (text, x, y, color = "black") => calls.push({ text, x, y, color });
      try {
        drawAboutWindow();
      } finally {
        drawText = originalDrawText;
      }
      return calls;
    },
  };
  load();
`,
);
if (source === canonicalSource)
  throw new Error("failed to instrument lifecycle runtime");

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

function createRuntime(search = "") {
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
      if (value.endsWith("/about.png")) [this.width, this.height] = [400, 224];
      else if (value.endsWith("/lzrdlogo.png"))
        [this.width, this.height] = [104, 112];
      else if (value.endsWith("/ega16til.png"))
        [this.width, this.height] = [320, 704];
      else if (value.endsWith("/egafont.png"))
        [this.width, this.height] = [128, 64];
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
  let now = 55_000;
  class MockDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
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
    location: { search },
    Image: MockImage,
    Audio: MockAudio,
    URLSearchParams,
    Uint8Array,
    DataView,
    Date: MockDate,
    performance: { now: () => now },
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
    setNow(value) {
      now = value;
    },
    move(x, y) {
      pointer("pointermove", x, y);
    },
    click(x, y) {
      pointer("pointerdown", x, y);
      pointer("pointerup", x, y);
    },
  };
}

async function readyRuntime(search = "") {
  const runtime = createRuntime(search);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return runtime;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasImageCall(runtime, suffix, predicate = () => true) {
  return runtime.drawingCalls.some(
    ({ type, args }) =>
      type === "drawImage" &&
      args[0]?._src?.endsWith(suffix) &&
      predicate(args),
  );
}

async function main() {
  const startup = await readyRuntime();
  const startupTest = startup.sandbox.__simfarmLifecycleTest;
  let snapshot = startupTest.snapshot();
  assert(snapshot.stage === "presents", "startup did not begin on PRSNT480");
  assert(
    snapshot.pointer.x === 320 && snapshot.pointer.y === 240,
    "DOS mouse did not begin at the native centered position",
  );

  startup.drawingCalls.length = 0;
  startupTest.render();
  assert(
    hasImageCall(startup, "/prsnt480.png"),
    "Presents resource was not painted",
  );
  assert(
    !hasImageCall(startup, "/cursors.png"),
    "Presents incorrectly exposed the cursor",
  );

  // FUN_312a_001c gives the original timer subsystem an exact 20,000 ms.
  startupTest.resetTimer(50_000);
  assert(
    !startupTest.advanceTimer(69_999),
    "Presents advanced before the 20,000 ms timer boundary",
  );
  assert(
    startupTest.snapshot().stage === "presents",
    "Presents changed too early",
  );
  assert(
    startupTest.advanceTimer(70_000),
    "Presents did not time out at 20,000 ms",
  );
  assert(
    startupTest.snapshot().stage === "title",
    "Presents timeout did not enter Title",
  );

  startup.drawingCalls.length = 0;
  startupTest.render();
  assert(
    hasImageCall(startup, "/sftitle.png"),
    "Title resource was not painted",
  );
  assert(
    hasImageCall(
      startup,
      "/cursors.png",
      (args) => args[5] === 320 && args[6] === 240,
    ),
    "Title did not reveal the cursor at the raw canvas pointer coordinate",
  );

  const titleStart = startupTest.snapshot().startupStageStartedAt;
  assert(
    !startupTest.advanceTimer(titleStart + 19_999),
    "Title changed too early",
  );
  assert(
    startupTest.advanceTimer(titleStart + 20_000),
    "Title did not time out",
  );
  assert(
    startupTest.snapshot().stage === "region",
    "Title timeout did not enter Region",
  );

  const manual = await readyRuntime();
  manual.setNow(77_000);
  manual.click(200, 100);
  snapshot = manual.sandbox.__simfarmLifecycleTest.snapshot();
  assert(
    snapshot.stage === "title" && snapshot.startupStageStartedAt === 77_000,
    "manual Presents dismissal did not enter/reset Title",
  );
  manual.click(200, 100);
  assert(
    manual.sandbox.__simfarmLifecycleTest.snapshot().stage === "region",
    "manual Title dismissal did not enter Region",
  );

  const about = await readyRuntime("?scenario=0");
  const aboutTest = about.sandbox.__simfarmLifecycleTest;
  about.drawingCalls.length = 0;
  about.click(18, 8);
  about.click(30, 22);
  assert(
    aboutTest.snapshot().activeWindow === "about",
    "File > About SimFarm did not open",
  );
  assert(
    hasImageCall(
      about,
      "/about.png",
      (args) => args[1] === 96 && args[2] === 112,
    ),
    "ABOUT.BMP differs from the native 96,112 placement",
  );
  assert(
    hasImageCall(
      about,
      "/lzrdlogo.png",
      (args) => args[1] === 360 && args[2] === 176,
    ),
    "LZRDLOGO.BMP differs from the native 360,176 placement",
  );
  assert(
    hasImageCall(
      about,
      "/ega16til.png",
      (args) => args[1] === 0 && args[5] === 96,
    ),
    "About title bar is not using EGA16TIL tile 0",
  );
  assert(
    hasImageCall(
      about,
      "/ega16til.png",
      (args) => args[1] === 32 && args[5] === 480,
    ),
    "About title bar is not using EGA16TIL tile 2 at the right edge",
  );

  const textCalls = JSON.parse(JSON.stringify(aboutTest.captureAboutText()));
  const expectedTextCalls = [
    { text: "ABOUT", x: 280, y: 100, color: "white" },
    { text: "    Concept", x: 240, y: 184, color: "black" },
    { text: "  Programming", x: 240, y: 193, color: "black" },
    { text: "      And", x: 240, y: 202, color: "black" },
    { text: "    Design", x: 240, y: 211, color: "black" },
    { text: "      By", x: 240, y: 220, color: "black" },
    { text: "  Eric Albers", x: 240, y: 229, color: "black" },
    { text: "Leaping Lizard", x: 240, y: 238, color: "black" },
    { text: "   Software", x: 240, y: 247, color: "black" },
    { text: "Eric Albers", x: 256, y: 312, color: "black" },
  ];
  assert(
    JSON.stringify(textCalls) === JSON.stringify(expectedTextCalls),
    `About text/coordinates differ: ${JSON.stringify(textCalls)}`,
  );

  const openingTick = aboutTest.snapshot().aboutCreditsLastTick;
  assert(
    !aboutTest.advanceAbout((openingTick + 0x1ff) * 20),
    "About left its opening card before 0x200 ticks",
  );
  assert(
    aboutTest.advanceAbout((openingTick + 0x200) * 20),
    "About did not enter CREDITZ at 0x200 ticks",
  );
  assert(
    aboutTest.snapshot().aboutCreditsPhase === "page" &&
      aboutTest.snapshot().aboutCreditsLine === 0,
    `About first credit state differs: ${JSON.stringify(aboutTest.snapshot())}`,
  );

  about.drawingCalls.length = 0;
  const pageZeroCalls = JSON.parse(
    JSON.stringify(aboutTest.captureAboutText()),
  );
  const expectedPageZero = [
    { text: "ABOUT", x: 280, y: 100, color: "white" },
    ...originalText.credits.slice(0, 12).map((text, index) => ({
      text,
      x: 240,
      y: 184 + index * 8,
      color: "black",
    })),
    { text: "Eric Albers", x: 256, y: 312, color: "black" },
  ];
  assert(
    JSON.stringify(pageZeroCalls) === JSON.stringify(expectedPageZero),
    `About first CREDITZ page differs: ${JSON.stringify(pageZeroCalls)}`,
  );
  assert(
    !hasImageCall(about, "/lzrdlogo.png"),
    "About retained LZRDLOGO on its first CREDITZ page",
  );

  let pageTick = openingTick + 0x200;
  assert(
    !aboutTest.advanceAbout((pageTick + 0x17f) * 20),
    "About replaced CREDITZ page zero before 0x180 ticks",
  );
  pageTick += 0x180;
  assert(
    aboutTest.advanceAbout(pageTick * 20) &&
      aboutTest.snapshot().aboutCreditsLine === 12,
    "About did not advance to CREDITZ page one at 0x180 ticks",
  );
  for (let page = 2; page <= 12; page += 1) {
    pageTick += 0x180;
    assert(
      aboutTest.advanceAbout(pageTick * 20) &&
        aboutTest.snapshot().aboutCreditsLine === page * 12,
      `About did not advance to CREDITZ page ${page}`,
    );
  }
  assert(
    aboutTest.snapshot().aboutCreditsPhase === "page",
    "About did not retain its partial final CREDITZ page",
  );
  pageTick += 0x180;
  assert(
    aboutTest.advanceAbout(pageTick * 20) &&
      aboutTest.snapshot().aboutCreditsPhase === "opening" &&
      aboutTest.snapshot().aboutCreditsLine === 0,
    "About did not loop from the CREDITZ sentinel to its opening card",
  );

  about.drawingCalls.length = 0;
  aboutTest.render();
  assert(
    !hasImageCall(about, "/cursors.png"),
    "blocking About incorrectly exposed the cursor",
  );
  about.move(300, 208);
  assert(
    aboutTest.snapshot().activeWindow === "map",
    "blocking About presentation did not reveal its underlying Map on pointer movement",
  );

  about.click(18, 8);
  about.click(30, 22);
  about.click(320, 208);
  assert(
    aboutTest.snapshot().activeWindow === "map",
    "blocking About presentation did not reveal its underlying Map on a client-area click",
  );

  console.log(
    "native lifecycle: startup waits/cursor and complete timed CREDITZ About loop exact",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
