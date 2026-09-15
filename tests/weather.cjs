#!/usr/bin/env node
"use strict";

// Drive the shipped Weather window through the real renderer and controls.
// Expected values and coordinates come from the recovered 2b98:0000 painter.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const source = canonicalSource.replace(
  "  load();\n",
  `  window.__simfarmWeatherTest = {
    snapshot() {
      const temperature = weatherDisplayedTemperature();
      return {
        activeWindow,
        season: weatherSeason(),
        weeksTill: weatherWeeksTillNextSeason(),
        averageRainfall: weatherAverageRainfall(),
        rainfallToDate: weatherRainfallToDate(),
        temperature,
        gaugeFrame: weatherGaugeFrame(temperature),
        celsius: (temperature - 32) >> 1,
        evaporation: weatherEvaporationLabel(temperature),
        forecast: weatherForecastConditions(),
        windSpeed: state.currentWindSpeed,
        vaneFrame: weatherVaneFrame,
        vaneInterval: weatherVaneInterval(),
      };
    },
    setState(patch) { Object.assign(state, patch); },
    setTownEventMode(mode) { setTownEventModeRaw(mode); },
    drawTile(tile) { drawMapTile(tile, 0, 0); },
    drawMaskedTile(tile) { drawMaskedMapTile(tile, 0, 0); },
    drawTitle() { drawTitleBar(64, 64, 32, "X"); },
    drawExpertArt() { drawExpertItem(35, 0, 0); },
    drawCropCatalog() { drawCropCatalogIcon(0, 0, 0); },
    airplaneSkinSource() { return weatherAirplaneWindow()?._src; },
    capturedWeather(index) { return capturedScenarioWeatherSuffix(index); },
    needsViewportPaint() { return shouldDrawDecodedViewport(); },
    renderGame() { clearGameWindows(); render(); },
    setRainfallEvents(value) {
      stateView(farmStateBytes).setUint16(
        saveData.format.annualRainfallEventCountOffset,
        value,
        true,
      );
    },
    resetVane: resetWeatherVaneTimer,
    tickVane: advanceWeatherVaneTick,
    render: drawWeatherWindow,
  };
  load();
`,
);
if (source === canonicalSource)
  throw new Error("failed to instrument Weather runtime");

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
      if (value.endsWith("/weather.png"))
        [this.width, this.height] = [336, 192];
      else if (/\/ega16til(?:-rain|-frost)?\.png$/.test(value))
        [this.width, this.height] = [320, 704];
      else if (/\/mskdtile(?:-rain|-frost)?\.png$/.test(value))
        [this.width, this.height] = [320, 160];
      else if (
        value.endsWith("/wethsky.png") ||
        value.endsWith("/wethgrnd.png")
      ) {
        [this.width, this.height] = [448, 32];
      } else if (value.endsWith("/wethvane.png"))
        [this.width, this.height] = [64, 32];
      else if (value.endsWith("/fldgrph.png"))
        [this.width, this.height] = [960, 24];
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

function hasImageCall(runtime, suffix, expected) {
  return runtime.drawingCalls.some(
    ({ type, args }) =>
      type === "drawImage" &&
      args[0]?._src?.endsWith(suffix) &&
      expected.every((value, index) => args[index + 1] === value),
  );
}

function hasFillCall(runtime, color, expected) {
  return runtime.drawingCalls.some(
    (call) =>
      call.type === "fillRect" &&
      call.color === color &&
      expected.every((value, index) => call.args[index] === value),
  );
}

function imageCallCount(runtime, suffix) {
  return runtime.drawingCalls.filter(
    ({ type, args }) => type === "drawImage" && args[0]?._src?.endsWith(suffix),
  ).length;
}

async function main() {
  const runtime = createRuntime();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const test = runtime.sandbox.__simfarmWeatherTest;

  runtime.click(230, 8); // Windows.
  runtime.clearDraws();
  runtime.click(230, 70); // Weather.
  let snapshot = test.snapshot();
  const initialExpected = {
    activeWindow: "weather",
    season: 2,
    weeksTill: 10,
    averageRainfall: 32,
    rainfallToDate: 0,
    temperature: 44,
    gaugeFrame: 16,
    celsius: 6,
    evaporation: "Slow",
    windSpeed: 5,
    vaneFrame: 0,
    vaneInterval: 1280,
  };
  for (const [key, expected] of Object.entries(initialExpected)) {
    if (snapshot[key] !== expected) {
      throw new Error(
        `scenario-0 ${key}: expected ${expected}, got ${snapshot[key]}`,
      );
    }
  }
  if (Array.from(snapshot.forecast).join(",") !== "0,0,0,0,0") {
    throw new Error(`scenario-0 forecast differs: ${snapshot.forecast}`);
  }

  if (!hasImageCall(runtime, "/weather.png", [160, 144])) {
    throw new Error("Weather base did not paint at native 160,144");
  }
  if (hasImageCall(runtime, "/window-weather.png", [160, 128])) {
    throw new Error("Weather still uses the frozen composite capture");
  }
  if (
    !hasImageCall(runtime, "/wethsky.png", [0, 0, 112, 32, 272, 192, 112, 32])
  ) {
    throw new Error(
      "current sky frame/destination differs from native painter",
    );
  }
  if (
    !hasImageCall(
      runtime,
      "/wethgrnd.png",
      [224, 0, 112, 32, 272, 224, 112, 32],
    )
  ) {
    throw new Error(
      "Summer ground frame/destination differs from native painter",
    );
  }
  if (
    !hasImageCall(runtime, "/wethvane.png", [0, 0, 32, 32, 432, 248, 32, 32])
  ) {
    throw new Error(
      "initial vane frame/destination differs from native painter",
    );
  }
  if (
    !hasImageCall(runtime, "/fldgrph.png", [768, 0, 48, 24, 184, 248, 48, 24])
  ) {
    throw new Error(
      "initial temperature gauge frame/destination differs from native painter",
    );
  }
  if (
    !hasFillCall(runtime, "#ffffff", [232, 180, 8, 44]) ||
    !hasFillCall(runtime, "#c30404", [232, 210, 8, 14]) ||
    !hasFillCall(runtime, "#ffffff", [408, 180, 8, 55]) ||
    !hasFillCall(runtime, "#0000eb", [408, 235, 8, 0])
  ) {
    throw new Error(
      "thermometer or rainfall gauge geometry differs from 2b98 painter",
    );
  }

  runtime.click(175, 143);
  if (test.snapshot().activeWindow !== "map") {
    throw new Error(
      "Weather title close did not reveal the underlying Map at 175,143",
    );
  }

  runtime.click(230, 8);
  runtime.click(230, 70);
  test.setState({
    month: 9,
    week: 0,
    day: 1,
    season: 3,
    currentTemperature: 97,
    currentWeatherCondition: 4,
    currentWindSpeed: 24,
    weatherDays: [0, 1, 2, 3, 4, 0, 1],
    nextWeatherDays: [2, 3, 4, 0, 1, 2, 3],
  });
  test.setRainfallEvents(20);
  test.resetVane(1000);
  if (test.tickVane(1160))
    throw new Error("vane toggled at equality; native comparison is strict");
  if (!test.tickVane(1161))
    throw new Error("vane missed its recovered 8-tick wind interval");
  runtime.clearDraws();
  test.render();
  snapshot = test.snapshot();
  if (
    snapshot.season !== 3 ||
    snapshot.weeksTill !== 9 ||
    snapshot.rainfallToDate !== 5 ||
    snapshot.temperature !== 97 ||
    snapshot.gaugeFrame !== 18 ||
    snapshot.celsius !== 32 ||
    snapshot.evaporation !== "Fast" ||
    snapshot.vaneInterval !== 160 ||
    snapshot.vaneFrame !== 1
  ) {
    throw new Error(
      `mutated Weather model differs: ${JSON.stringify(snapshot)}`,
    );
  }
  if (Array.from(snapshot.forecast).join(",") !== "1,2,3,4,0") {
    throw new Error(`cross-week forecast differs: ${snapshot.forecast}`);
  }
  if (
    !hasImageCall(
      runtime,
      "/wethsky.png",
      [336, 0, 112, 32, 272, 192, 112, 32],
    ) ||
    !hasImageCall(
      runtime,
      "/wethgrnd.png",
      [336, 0, 112, 32, 272, 224, 112, 32],
    ) ||
    !hasImageCall(
      runtime,
      "/fldgrph.png",
      [864, 0, 48, 24, 184, 248, 48, 24],
    ) ||
    !hasImageCall(runtime, "/wethvane.png", [32, 0, 32, 32, 432, 248, 32, 32])
  ) {
    throw new Error("mutated weather artwork did not select native frames");
  }
  if (
    !hasFillCall(runtime, "#c30404", [232, 192, 8, 32]) ||
    !hasFillCall(runtime, "#0000eb", [408, 230, 8, 5])
  ) {
    throw new Error(
      "mutated thermometer/rain gauge did not scale in native units",
    );
  }

  runtime.clearDraws();
  test.setState({ currentWeatherCondition: 3 });
  test.setTownEventMode(1);
  test.drawTile(0x1b);
  test.drawTile(0x2b0);
  test.drawTile(0x1e3);
  test.drawMaskedTile(0x350);
  test.drawMaskedTile(0x3fc);
  test.drawTitle();
  test.drawExpertArt();
  test.drawCropCatalog();
  if (
    !hasImageCall(
      runtime,
      "/ega16til-rain.png",
      [112, 16, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/crops/corn-rain.png",
      [0, 0, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/mskdtile-rain.png",
      [0, 0, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/mskdtile-rain.png",
      [192, 128, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/twnevent-rain.png",
      [240, 16, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/ega16til-rain.png",
      [0, 0, 16, 16, 64, 64, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/alltiles-rain.png",
      [336, 256, 112, 64, 0, 0, 112, 64],
    ) ||
    !hasImageCall(
      runtime,
      "/crops/corn-rain.png",
      [96, 80, 16, 16, 0, 0, 16, 16],
    ) ||
    !test.airplaneSkinSource().endsWith("/airpwndo-rain.png")
  ) {
    throw new Error(
      "daily rain did not select every index-preserving live-game palette asset",
    );
  }
  if (
    test.capturedWeather(0) !== "" ||
    test.capturedWeather(3) !== "Rain" ||
    test.capturedWeather(5) !== "Rain" ||
    test.capturedWeather(7) !== "Rain" ||
    !test.needsViewportPaint()
  ) {
    throw new Error(
      "rain capture baselines or unchanged-map repaint gate differ",
    );
  }
  runtime.clearDraws();
  test.renderGame();
  if (imageCallCount(runtime, "/ega16til-rain.png") < 500) {
    throw new Error(
      "clear-authored static viewport did not fully repaint after Rain palette write",
    );
  }

  runtime.clearDraws();
  test.setState({ currentWeatherCondition: 4 });
  test.setTownEventMode(2);
  test.drawTile(0x1b);
  test.drawTile(0x2b0);
  test.drawTile(0x1e3);
  test.drawMaskedTile(0x350);
  test.drawMaskedTile(0x3fc);
  test.drawExpertArt();
  if (
    !hasImageCall(
      runtime,
      "/ega16til-frost.png",
      [112, 16, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/crops/corn-frost.png",
      [0, 0, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/mskdtile-frost.png",
      [0, 0, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/mskdtile-frost.png",
      [192, 128, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/twnevent-frost.png",
      [160, 48, 16, 16, 0, 0, 16, 16],
    ) ||
    !hasImageCall(
      runtime,
      "/alltiles-frost.png",
      [336, 256, 112, 64, 0, 0, 112, 64],
    ) ||
    !test.airplaneSkinSource().endsWith("/airpwndo-frost.png")
  ) {
    throw new Error(
      "daily frost did not select every index-preserving live-game palette asset",
    );
  }
  runtime.clearDraws();
  test.renderGame();
  if (imageCallCount(runtime, "/ega16til-frost.png") < 500) {
    throw new Error(
      "clear-authored static viewport did not fully repaint after Frost palette write",
    );
  }

  runtime.clearDraws();
  test.setState({ currentWeatherCondition: 0 });
  test.setTownEventMode(0);
  test.drawTile(0x1b);
  if (
    !hasImageCall(runtime, "/ega16til.png", [112, 16, 16, 16, 0, 0, 16, 16])
  ) {
    throw new Error("clear weather did not restore the neutral tile palette");
  }
  if (test.needsViewportPaint()) {
    throw new Error(
      "matching clear authored viewport no longer retains its exact native capture",
    );
  }

  console.log(
    "native weather: live painter plus global indexed Rain/Frost assets and static-map repaint exact",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
