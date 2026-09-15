#!/usr/bin/env node
"use strict";

// Prove that the native browser runtime imports and exports the original
// fixed-size SFM/SSM state without translating it through a new game format.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const source = canonicalSource.replace(
  "  load();\n",
  `  window.__simfarmSaveCompatTest = {
    importBytes: importSfmBytes,
    serializeBytes: serializeSfmBytes,
    inferMarker: inferMarkerIndexFromSfm,
    normalizeFilename: normalizeSfmFilename,
    download: downloadSfmFile,
    saveFile: saveSfmFile,
    commitNamedSave(name) { saveDialogName = name; return commitSaveGameDialog(); },
    dismiss: dismissModalNotice,
    saveLocal: saveGame,
    loadLocal: loadGame,
    selectSpeed(speed) { activateMenuItem(menus[2], speed); },
    openSaveDialog: openSaveGameDialog,
    closeWindow: closeActiveWindow,
    finishFileDialog: endNativeFileDialogPause,
    startNewAuthoredViaUi() {
      stage = "game";
      activateMenuItem(menus[0], "New Game");
      click({ x: 384, y: 318 });
      selectedRegion = { gridX: 1, gridY: 3 };
      click({ x: 160, y: 244 });
    },
    startAuthoredWithSeeds() {
      stage = "region";
      selectedRegion = { gridX: 1, gridY: 3 };
      simRandomState = 0xabc1;
      simSecondaryRandomState = 0x7123;
      simSmallRandomState = 0x23;
      designerRandomHistory = [101, 202, 303, 404, 505];
      startGame();
      return {
        randomState: simRandomState,
        secondaryRandomState: simSecondaryRandomState,
        smallRandomState: simSmallRandomState,
        history: [...designerRandomHistory],
      };
    },
    resetCalendar: resetCalendarTimer,
    advanceCalendar: advanceCalendarTimer,
    snapshot() {
      return {
        markerIndex,
        generatedWorldActive,
        speed: state.speed,
        calendarIntervalTicks,
        livestockIntervalTicks,
        disasterEventIntervalTicks,
        selectedRegion: { ...selectedRegion },
        currentSaveName,
        camera: { ...camera },
        stage,
        message,
        modalNotice,
        season: state.season,
        displayedSeason: weatherSeason(),
        weatherCategoryCycle: state.weatherCategoryCycle,
        weatherPrecipitationCycle: state.weatherPrecipitationCycle,
        weatherTemperatureCycle: state.weatherTemperatureCycle,
        weatherDays: [...state.weatherDays],
        nextWeatherDays: [...state.nextWeatherDays],
        weatherMoistureAccumulator: state.weatherMoistureAccumulator,
        soilMoisture: state.soilMoisture,
        currentWindSpeed: state.currentWindSpeed,
        windBoost: state.windBoost,
        currentTemperature: state.currentTemperature,
        currentWeatherCondition: state.currentWeatherCondition,
        bankInterestRate: state.bankInterestRate,
        townReserve: state.townReserve,
        randomState: simRandomState,
        secondaryRandomState: simSecondaryRandomState,
        smallRandomState: simSmallRandomState,
        marketRuntime: {
          initialized: marketRuntime.initialized,
          selectedCrop: marketRuntime.selectedCrop,
          trend: marketRuntime.trend,
          trendAge: marketRuntime.trendAge,
          firstSample: marketRuntime.history[0][0],
          lastSample: marketRuntime.history[15][29],
        },
        evaluationRuntime: { ...evaluationRuntime },
      };
    },
    setProcessRuntime(statePatch, randomStates, processModels) {
      Object.assign(state, statePatch);
      simRandomState = randomStates.randomState;
      simSecondaryRandomState = randomStates.secondaryRandomState;
      simSmallRandomState = randomStates.smallRandomState;
      marketRuntime.initialized = true;
      marketRuntime.selectedCrop = processModels.market.selectedCrop;
      marketRuntime.trend = processModels.market.trend;
      marketRuntime.trendAge = processModels.market.trendAge;
      marketRuntime.history[0][0] = processModels.market.firstSample;
      marketRuntime.history[15][29] = processModels.market.lastSample;
      Object.assign(evaluationRuntime, processModels.evaluation);
    },
  };
  load();
`,
);
if (source === canonicalSource)
  throw new Error("failed to instrument save compatibility runtime");

const regionData = JSON.parse(
  fs.readFileSync(path.join(root, "data/region.json"), "utf8"),
);
const saveData = JSON.parse(
  fs.readFileSync(path.join(root, "data/save-states.json"), "utf8"),
);
const originalText = JSON.parse(
  fs.readFileSync(path.join(root, "data/original-text.json"), "utf8"),
);
const cropData = JSON.parse(
  fs.readFileSync(path.join(root, "data/crops.json"), "utf8"),
);
const format = saveData.format;
const scenarioFileIndexes = [2, 3, 5, 4, 0, 7, 1, 6];
const scenarioMarkers = [
  [1, 3],
  [3, 6],
  [11, 6],
  [9, 7],
  [0, 8],
  [15, 8],
  [1, 11],
  [13, 11],
];

function createRuntime() {
  const listeners = new Map();
  const fileListeners = new Map();
  const fileInput = {
    addEventListener: (name, handler) => fileListeners.set(name, handler),
    click: () => {},
  };
  const storage = new Map();
  const downloads = [];
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
    width: 640,
    height: 480,
    getContext: () => drawingContext,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
    addEventListener: (name, handler) => listeners.set(name, handler),
    setPointerCapture: () => {},
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
  class MockBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options?.type;
    }
  }
  let lastBlob = null;
  let revokedUrl = null;
  const sandbox = {
    console,
    document: {
      querySelector: () => canvas,
      getElementById: (id) => (id === "simfarm-save-file" ? fileInput : null),
      createElement: (tag) => {
        if (tag !== "a") {
          return { width: 0, height: 0, getContext: () => drawingContext };
        }
        return {
          click() {
            downloads.push({
              name: this.download,
              bytes: Buffer.from(lastBlob.parts[0]),
              type: lastBlob.type,
            });
          },
          remove: () => {},
        };
      },
      body: { append: () => {} },
    },
    location: { search: "" },
    Image: MockImage,
    Audio: MockAudio,
    Blob: MockBlob,
    URL: {
      createObjectURL(blob) {
        lastBlob = blob;
        return "blob:simfarm-test";
      },
      revokeObjectURL(url) {
        revokedUrl = url;
      },
    },
    URLSearchParams,
    Uint8Array,
    ArrayBuffer,
    DataView,
    Date,
    performance: { now: () => 1 },
    requestAnimationFrame: () => 0,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes("region.json")) return regionData;
        if (url.includes("original-text.json")) return originalText;
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
  return {
    sandbox,
    downloads,
    loadNativeFile(bytes) {
      return fileListeners.get("change")({
        target: {
          files: [
            {
              name: "CROPAUD.SFM",
              arrayBuffer: async () => Uint8Array.from(bytes).buffer,
            },
          ],
        },
      });
    },
    revokedUrl: () => revokedUrl,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertBytes(actual, expected, label) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (!actualBuffer.equals(expectedBuffer)) {
    let first = 0;
    while (
      first < actualBuffer.length &&
      actualBuffer[first] === expectedBuffer[first]
    )
      first += 1;
    throw new Error(
      `${label} differs at byte ${first}: ${actualBuffer[first]}/${expectedBuffer[first]}`,
    );
  }
}

async function main() {
  const runtime = createRuntime();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const api = runtime.sandbox.__simfarmSaveCompatTest;

  assert(
    api.normalizeFilename("My Farm?.ssm") === "MYFARM.SFM",
    "DOS filename normalization differs",
  );
  assert(
    api.normalizeFilename("abcdefghijk.sfm") === "ABCDEFGH.SFM",
    "DOS filename was not truncated",
  );

  for (let marker = 0; marker < scenarioFileIndexes.length; marker += 1) {
    const scenarioIndex = scenarioFileIndexes[marker];
    const scenario = saveData.states.find(
      (candidate) => candidate.scenarioIndex === scenarioIndex,
    );
    const original = Buffer.from(scenario.stateBase64, "base64");
    assert(
      original.length === format.fileSize,
      `scenario ${scenarioIndex} has the wrong size`,
    );
    assert(
      api.inferMarker(original) === marker,
      `scenario ${scenarioIndex} inferred marker differs`,
    );
    api.importBytes(original, `S${marker}.SSM`);
    assertBytes(
      api.serializeBytes(),
      original,
      `scenario ${scenarioIndex} round trip`,
    );
    const snapshot = api.snapshot();
    assert(
      snapshot.markerIndex === marker,
      `scenario ${scenarioIndex} loaded the wrong marker`,
    );
    assert(
      snapshot.selectedRegion.gridX === scenarioMarkers[marker][0] &&
        snapshot.selectedRegion.gridY === scenarioMarkers[marker][1],
      `scenario ${scenarioIndex} loaded the wrong region`,
    );
    assert(
      snapshot.currentSaveName === `S${marker}.SFM`,
      `scenario ${scenarioIndex} filename differs`,
    );
    assert(
      snapshot.camera.x ===
        Math.min(63, original[format.startupCoordinateXOffset] + 1) &&
        snapshot.camera.y ===
          Math.min(73, original[format.startupCoordinateYOffset]),
      `scenario ${scenarioIndex} camera differs`,
    );
    assert(
      snapshot.season === original.readUInt16LE(format.seasonIndexOffset),
      `scenario ${scenarioIndex} serialized season differs`,
    );
  }

  const transientState = {
    weatherCategoryCycle: 4,
    weatherPrecipitationCycle: 3,
    weatherTemperatureCycle: 2,
    weatherDays: [4, 3, 2, 1, 0, 4, 3],
    nextWeatherDays: [1, 2, 3, 4, 0, 1, 2],
    weatherMoistureAccumulator: -7,
    soilMoisture: 11,
    currentWindSpeed: 22,
    windBoost: 6,
    currentTemperature: 91,
    currentWeatherCondition: 4,
    bankInterestRate: 9,
    townReserve: 12345,
  };
  const transientRandom = {
    randomState: 0x4321,
    secondaryRandomState: 0x7654,
    smallRandomState: 0x2468,
  };
  const transientModels = {
    market: {
      initialized: true,
      selectedCrop: 13,
      trend: 2,
      trendAge: 17,
      firstSample: 1111,
      lastSample: 2222,
    },
    evaluation: {
      farmGrowth: 101,
      previousFarmGrowth: 102,
      productivity: 103,
      previousProductivity: 104,
      environmentCount: 105,
      previousEnvironmentCount: 106,
    },
  };
  api.setProcessRuntime(transientState, transientRandom, transientModels);
  const seasonFixture = Buffer.from(
    saveData.states.find((candidate) => candidate.scenarioIndex === 0)
      .stateBase64,
    "base64",
  );
  seasonFixture.writeUInt16LE(3, format.seasonIndexOffset);
  api.importBytes(seasonFixture, "season.sfm");
  const loadedRuntime = api.snapshot();
  for (const [key, expected] of Object.entries({
    ...transientState,
    ...transientRandom,
  })) {
    const actual = loadedRuntime[key];
    assert(
      Array.isArray(expected)
        ? Array.from(actual).join(",") === expected.join(",")
        : actual === expected,
      `native process-only ${key} was reset by SFM load`,
    );
  }
  for (const [key, expected] of Object.entries(transientModels.market)) {
    if (key === "lastSample") continue;
    assert(
      loadedRuntime.marketRuntime[key] === expected,
      `native process-only market ${key} was reset by SFM load`,
    );
  }
  assert(
    loadedRuntime.marketRuntime.lastSample === 23,
    "SFM crop-definition reload failed to reset Peanuts graph tail29 to CRP baseline23",
  );
  for (const [key, expected] of Object.entries(transientModels.evaluation)) {
    assert(
      loadedRuntime.evaluationRuntime[key] === expected,
      `native process-only evaluation ${key} was reset by SFM load`,
    );
  }
  assert(
    loadedRuntime.season === 3 && loadedRuntime.displayedSeason === 3,
    "serialized native season word was recomputed from the date",
  );
  assertBytes(
    api.serializeBytes(),
    seasonFixture,
    "raw serialized season round trip",
  );

  const fixture = Buffer.from(saveData.states[0].stateBase64, "base64");
  api.importBytes(fixture, "collision.sfm");
  assertBytes(api.serializeBytes(), fixture, "scenario save round trip");

  // The native reader/writer places DS:a8a0 and DS:0187 directly before
  // DS:1f8c/1f90/2286/2402. Load restores selected speed, Pause, and the
  // retained numeric cadences, including Pause over a previously Fast game.
  for (const [speed, index, paused, calendar, actors] of [
    ["Ultra", 0, 0, 0x40, 1],
    ["Fast", 1, 0, 0x80, 8],
    ["Normal", 2, 0, 0x100, 0x10],
    ["Slow", 3, 0, 0x280, 0x20],
    ["Pause", 4, 1, 0x80, 8],
  ]) {
    const speedFixture = Buffer.from(fixture);
    speedFixture[format.speedSelectionOffset] = index;
    speedFixture[format.pauseFlagOffset] = paused;
    speedFixture.writeUInt16LE(calendar, format.calendarSpeedThresholdOffset);
    speedFixture.writeUInt16LE(actors, format.actorSpeedThresholdOffset);
    api.selectSpeed("Ultra");
    api.importBytes(speedFixture, "SPEED.SFM");
    const importedSpeed = api.snapshot();
    assert(
      importedSpeed.speed === speed &&
        importedSpeed.calendarIntervalTicks === calendar &&
        importedSpeed.livestockIntervalTicks === actors,
      speed + " SFM load did not restore its selected speed and numeric clocks",
    );
    assert(
      importedSpeed.disasterEventIntervalTicks === 1,
      "SFM load reset the nonserialized DS:69b2 disaster cadence",
    );
    assertBytes(
      api.serializeBytes(),
      speedFixture,
      speed + " speed bytes round trip",
    );
    api.resetCalendar(0);
    assert(
      !api.advanceCalendar(calendar * 20),
      speed + " advanced before its strict threshold",
    );
    assert(
      api.advanceCalendar((calendar + 1) * 20) === !paused,
      speed + " imported speed used an incorrect daily cadence",
    );
  }
  api.selectSpeed("Fast");
  api.selectSpeed("Pause");
  const pausedSave = Buffer.from(api.serializeBytes());
  assert(
    pausedSave[format.speedSelectionOffset] === 4 &&
      pausedSave[format.pauseFlagOffset] === 1 &&
      pausedSave.readUInt16LE(format.calendarSpeedThresholdOffset) === 0x80 &&
      pausedSave.readUInt16LE(format.actorSpeedThresholdOffset) === 8,
    "Pause failed to serialize its own index/flag while retaining Fast numeric clocks",
  );

  api.selectSpeed("Slow");
  api.openSaveDialog();
  let held = Buffer.from(api.serializeBytes());
  assert(
    api.snapshot().speed === "Pause" &&
      held[format.pauseFlagOffset] === 1 &&
      held[format.speedSelectionOffset] === 3 &&
      held.readUInt16LE(format.calendarSpeedThresholdOffset) === 640,
    "Save As did not preserve Slow index/cadence beneath its pause nesting level",
  );
  api.closeWindow();
  assert(
    api.snapshot().speed === "Normal",
    "Save As cancellation did not resume Normal",
  );
  api.selectSpeed("Fast");
  api.selectSpeed("Pause");
  api.openSaveDialog();
  held = Buffer.from(api.serializeBytes());
  assert(
    held[format.pauseFlagOffset] === 2 &&
      held[format.speedSelectionOffset] === 4,
    "Save As failed to nest over a manually paused game",
  );
  api.closeWindow();
  assert(
    api.snapshot().speed === "Pause" &&
      api.serializeBytes()[format.pauseFlagOffset] === 1,
    "Save As cancellation released the user's independent Pause level",
  );
  api.importBytes(held, "NESTED.SFM");
  api.finishFileDialog(true);
  assert(
    api.snapshot().speed === "Pause" &&
      api.serializeBytes()[format.pauseFlagOffset] === 1 &&
      api.snapshot().calendarIntervalTicks === 128,
    "UI Load failed to preserve a nested manual Pause and its retained Fast cadence",
  );

  const continued = api.startAuthoredWithSeeds();
  assert(
    continued.secondaryRandomState === 0x7123 &&
      continued.history.join(",") === "101,202,303,404,505",
    "authored New Game reseeded the process-only secondary LFSR or terrain history",
  );
  // FUN_15fd_00a3 performs one 8-bit step for the startup thermometer.
  assert(
    continued.smallRandomState === ((0x23 >>> 1) ^ 0xb8),
    "authored New Game did not continue the small LFSR through its thermometer draw",
  );

  // FUN_850f_0f2c clears the three weather-table cursors, not the current or
  // lookahead buffers / moisture accumulator / wind or annual bank rate.
  // Root calls1b98:0abc once after the selector, exactly as on a weekly shift.
  api.setProcessRuntime(transientState, transientRandom, transientModels);
  api.startNewAuthoredViaUi();
  const restarted = api.snapshot();
  assert(
    restarted.stage === "game" && restarted.markerIndex === 0,
    "New Game confirmation/selector route failed to start an authored farm",
  );
  assert(
    restarted.weatherCategoryCycle === 0 &&
      restarted.weatherPrecipitationCycle === 0 &&
      restarted.weatherTemperatureCycle === 0,
    "New Game failed to reset the three native weather-table cursors",
  );
  assert(
    restarted.weatherDays.join(",") ===
      transientState.nextWeatherDays.join(",") &&
      restarted.weatherMoistureAccumulator === -7 &&
      restarted.currentWindSpeed === 22 &&
      restarted.windBoost === 6,
    "New Game erased retained forecast/moisture/wind process state",
  );
  assert(
    restarted.bankInterestRate === 9 && restarted.townReserve === 40000,
    "New Game must retain the annual interest rate but reset the town reserve",
  );
  api.setProcessRuntime(
    { ...transientState, weatherMoistureAccumulator: 16, soilMoisture: 4 },
    transientRandom,
    transientModels,
  );
  api.startNewAuthoredViaUi();
  assert(
    api.snapshot().soilMoisture === 6 &&
      api.snapshot().weatherMoistureAccumulator === 0,
    "New Game startup failed to apply its retained full moisture accumulator",
  );

  api.importBytes(fixture, "collision.sfm");

  const beforeInvalidImport = Buffer.from(api.serializeBytes());
  let invalidRejected = false;
  try {
    api.importBytes(Buffer.alloc(format.fileSize - 1), "broken.sfm");
  } catch (error) {
    invalidRejected = /exactly 139072 bytes/.test(error.message);
  }
  assert(invalidRejected, "invalid SFM length was not rejected");
  assertBytes(
    api.serializeBytes(),
    beforeInvalidImport,
    "invalid import changed the current game",
  );

  api.saveLocal();
  const otherScenario = Buffer.from(
    saveData.states.find((candidate) => candidate.scenarioIndex === 3)
      .stateBase64,
    "base64",
  );
  api.importBytes(otherScenario, "other.sfm");
  api.loadLocal();
  assertBytes(api.serializeBytes(), fixture, "local fallback round trip");
  assert(
    api.snapshot().currentSaveName === "COLLISIO.SFM",
    "local fallback lost the save name",
  );

  const downloaded = api.download("My Farm?.sfm");
  assertBytes(downloaded, fixture, "download return bytes");
  assert(
    runtime.downloads.length === 1,
    "download did not click exactly one file link",
  );
  assert(
    runtime.downloads[0].name === "MYFARM.SFM",
    "download filename differs",
  );
  assert(
    runtime.downloads[0].type === "application/octet-stream",
    "download MIME type differs",
  );
  assertBytes(runtime.downloads[0].bytes, fixture, "download payload");
  assert(
    runtime.revokedUrl() === "blob:simfarm-test",
    "download URL was not revoked",
  );

  // A storage failure must not prevent either explicit native-file workflow.
  const originalSetItem = runtime.sandbox.localStorage.setItem;
  for (const failure of ["QuotaExceededError", "SecurityError"]) {
    runtime.sandbox.localStorage.setItem = () => {
      throw new Error(failure);
    };
    api.importBytes(fixture, "CACHE.SFM");
    let count = runtime.downloads.length;
    assert(api.saveFile(false), `${failure}: Save did not succeed`);
    assert(
      runtime.downloads.length === count + 1,
      `${failure}: Save download was blocked by cache`,
    );
    assertBytes(
      runtime.downloads.at(-1).bytes,
      fixture,
      `${failure}: Save payload`,
    );
    api.saveFile(true);
    const expectedSaveAs = Buffer.from(api.serializeBytes());
    count = runtime.downloads.length;
    assert(
      api.commitNamedSave("CACHEAS"),
      `${failure}: Save As did not succeed`,
    );
    assert(
      runtime.downloads.length === count + 1,
      `${failure}: Save As download was blocked by cache`,
    );
    assert(
      runtime.downloads.at(-1).name === "CACHEAS.SFM",
      `${failure}: Save As filename differs`,
    );
    assertBytes(
      runtime.downloads.at(-1).bytes,
      expectedSaveAs,
      `${failure}: Save As payload`,
    );
    assert(
      api.snapshot().modalNotice === "save-success",
      `${failure}: exported Save As omitted success`,
    );
    api.dismiss();
    let cacheFailure;
    try {
      api.saveLocal();
    } catch (error) {
      cacheFailure = error;
    }
    assert(
      cacheFailure?.message === failure,
      "cache-only persistence concealed its failure",
    );
  }
  runtime.sandbox.localStorage.setItem = originalSetItem;

  // Export errors remain failures: a cache write must not falsely report the
  // native file as saved or display the Save As success card.
  const originalCreateUrl = runtime.sandbox.URL.createObjectURL;
  runtime.sandbox.URL.createObjectURL = () => {
    throw new Error("Export unavailable");
  };
  api.importBytes(fixture, "EXPORT.SFM");
  const beforeExportFailure = api.snapshot().message;
  let exportFailure;
  try {
    api.saveFile(false);
  } catch (error) {
    exportFailure = error;
  }
  assert(
    exportFailure?.message === "Export unavailable",
    "Save concealed export failure",
  );
  assert(
    api.snapshot().message === beforeExportFailure,
    "failed Save reported success",
  );
  api.saveFile(true);
  exportFailure = null;
  try {
    api.commitNamedSave("FAILED");
  } catch (error) {
    exportFailure = error;
  }
  assert(
    exportFailure?.message === "Export unavailable",
    "Save As concealed export failure",
  );
  assert(
    api.snapshot().modalNotice !== "save-success",
    "failed Save As reported success",
  );
  runtime.sandbox.URL.createObjectURL = originalCreateUrl;
  api.closeWindow();

  console.log(
    "native save compatibility: all 8 scenarios, saved Speed/Pause cadence, serialized season, process-state persistence, invalid imports, cache failures and export failures verified",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
