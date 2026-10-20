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
    serializeFarmBytes: serializeFarmSaveBytes,
    saveFile: saveSfmFile,
    commitNamedSave(name) { saveDialogName = name; return commitSaveGameDialog(); },
    dismiss: dismissModalNotice,
    saveLocal: saveGame,
    loadLocal: loadGame,
    selectSpeed(speed) { activateMenuItem(menus[2], speed); },
    openSaveDialog: openSaveGameDialog,
    closeWindow: closeActiveWindow,
    finishFileDialog: endNativeFileDialogPause,
    sellStoredCrop(id, quantity, quality) {
      const format = saveData.format;
      const slot = 1;
      const record = storageLotRecord(slot);
      const recordView = stateView(record);
      recordView.setUint16(0, id, true);
      recordView.setUint16(2, quantity, true);
      recordView.setUint16(4, quality, true);
      record[8] = 0;
      record[9] = 0;
      record[10] |= 0x20;
      stateView(farmStateBytes).setUint16(
        format.storageLotCountOffset,
        1,
        true,
      );
      const definition = itemDefinitionForKeyAndId("stored-crop", id);
      stateView(definition.record).setUint16(4, 1, true);
      const entry = {
        categoryKey: "stored-crop",
        slot,
        record,
        definition,
        price: storedCropSalePrice(record),
      };
      const price = entry.price;
      sellInventoryEntry(entry);
      return price;
    },
    accountingSnapshot() {
      const view = stateView(farmStateBytes);
      const format = saveData.format;
      return {
        funds: state.funds,
        cropSales: view.getUint32(format.storedCropSaleIncomeOffset, true),
        taxableSales: state.taxableSaleIncome,
      };
    },
    prepareInsuranceField(cropSlot, price, funds) {
      const format = saveData.format;
      let slot = -1;
      for (let index = 1; index < format.fieldRecordCount; index += 1) {
        if ((fieldRecord(index)[7] & 1) === 0) {
          slot = index;
          break;
        }
      }
      if (slot < 0) throw new Error("no test field slot available");
      const record = fieldRecord(slot);
      record.fill(0);
      record[2] = 3;
      record[7] = 1;
      record[14] = cropSlot;
      const saveView = stateView(farmStateBytes);
      saveView.setUint16(
        format.fieldCountOffset,
        saveView.getUint16(format.fieldCountOffset, true) + 1,
        true,
      );
      const commodity = itemDefinitionForKeyAndId("commodity", 0x80 + cropSlot);
      stateView(commodity.record).setUint16(6, price, true);
      state.funds = funds;
      return slot;
    },
    insuranceQuote: cropInsuranceQuote,
    setFunds(value) { state.funds = value; },
    insureField: purchaseCropInsurance,
    cancelFieldPolicy: cancelCropInsurance,
    insurancePolicy: cropInsurancePolicy,
    settleInsurance(fieldSlot, actualValue) {
      return settleCropInsurance(fieldRecord(fieldSlot), actualValue);
    },
    insuranceHarvestValue(fieldSlot) {
      const policy = cropInsurancePolicy(fieldSlot);
      return harvestValueAtPrice(fieldRecord(fieldSlot), policy.referencePrice);
    },
    finishInsuranceHarvest(fieldSlot) {
      const before = state.funds;
      finishHarvestField(fieldRecord(fieldSlot));
      return state.funds - before;
    },
    insurancePayout: calculateCropInsurancePayout,
    insuranceSnapshot() {
      return {
        funds: state.funds,
        currentSaveName,
        extension: JSON.parse(JSON.stringify(farmExtensionState)),
      };
    },
    normalizeExtension: normalizeFarmExtensionState,
    setCameraZoom(value) {
      cameraZoom = value;
      clampCameraToZoom();
    },
    getCameraZoom() {
      return cameraZoom;
    },
    rollCalendarYear() {
      state.week = 4;
      state.month = 11;
      const previousYear = state.year;
      finishMonthBoundary(null);
      return state.year - previousYear;
    },
    findEligibleConservationParcel() {
      for (let x = 0; x < saveData.format.parcelGridWidth; x += 1) {
        for (let y = 0; y < saveData.format.parcelGridHeight; y += 1) {
          if (conservationParcelEligible(x, y)) return { x, y };
        }
      }
      return null;
    },
    findVacantConservationParcel() {
      for (let x = 0; x < saveData.format.parcelGridWidth; x += 1) {
        for (let y = 0; y < saveData.format.parcelGridHeight; y += 1) {
          if (!parcelHasActiveField(x, y) && !parcelHasActiveStructure(x, y))
            return { x, y };
        }
      }
      return null;
    },
    findUnownedVacantParcel() {
      for (let x = 0; x < saveData.format.parcelGridWidth; x += 1) {
        for (let y = 0; y < saveData.format.parcelGridHeight; y += 1) {
          if (
            parcelStatus(x, y) !== 1 &&
            !parcelHasActiveField(x, y) &&
            !parcelHasActiveStructure(x, y)
          )
            return { x, y };
        }
      }
      return null;
    },
    enrollConservationParcel: enrollConservationParcel,
    conservationParcelEligible: conservationParcelEligible,
    withdrawConservationParcel: withdrawConservationParcel,
    conservationCell: isConservationCell,
    conservationFieldFootprint: fieldFootprintIsValid,
    conservationStructureFootprint(x, y, width, height) {
      return structureFootprintIsValid({ width, height }, x, y);
    },
    conservationToolPlacement(x, y) {
      const priorCamera = { ...camera };
      const priorTool = selectedTool;
      const priorDrag = dragState;
      camera.x = x;
      camera.y = y;
      cameraZoom = 1;
      selectedTool = "Paved Road";
      dragState = { lastCell: null, placed: new Set(), soundPlayed: false };
      const cell = mapCell(x, y);
      const before = cell.slice(0, 4);
      placeSelectedToolAtPoint({ x: 80, y: 80 });
      const unchanged = before.every((value, index) => cell[index] === value);
      camera = priorCamera;
      selectedTool = priorTool;
      dragState = priorDrag;
      return unchanged;
    },
    sellConservationParcel: sellParcel,
    advanceConservationYear(year) {
      state.year = year;
      const before = state.funds;
      const changed = advanceConservationContracts();
      return { changed, fundsDelta: state.funds - before };
    },
    conservationSnapshot() {
      return {
        funds: state.funds,
        year: state.year,
        extension: JSON.parse(JSON.stringify(farmExtensionState)),
      };
    },
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
        year: state.year,
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
    TextEncoder,
    TextDecoder,
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

  // Mobile hosts receive the exact native save, without a second browser
  // download. Bridge errors must still propagate to the existing save UI.
  api.importBytes(fixture, "MOBILE.SFM");
  let hostExport;
  runtime.sandbox.SimFarmHost = {
    saveFile(name, base64) {
      hostExport = { name, bytes: Buffer.from(base64, "base64") };
    },
  };
  const browserDownloadCount = runtime.downloads.length;
  api.download("MOBILE.SFM");
  assert(hostExport.name === "MOBILE.SFM", "native host filename differs");
  assertBytes(hostExport.bytes, fixture, "native host payload");
  assert(
    runtime.downloads.length === browserDownloadCount,
    "native save also downloaded in browser",
  );
  runtime.sandbox.SimFarmHost.saveFile = () => {
    throw new Error("Native export unavailable");
  };
  let nativeExportFailure;
  try {
    api.download();
  } catch (error) {
    nativeExportFailure = error;
  }
  assert(
    nativeExportFailure?.message === "Native export unavailable",
    "native save concealed failure",
  );
  delete runtime.sandbox.SimFarmHost;

  api.importBytes(fixture, "SALE.SFM");
  const beforeCropSale = api.accountingSnapshot();
  const cropSalePrice = api.sellStoredCrop(0xa8, 100, 0);
  const afterCropSale = api.accountingSnapshot();
  assert(cropSalePrice > 0, "stored crop sale did not produce proceeds");
  assert(
    afterCropSale.funds - beforeCropSale.funds === cropSalePrice,
    "stored crop sale cash credit differs from its price",
  );
  assert(
    afterCropSale.cropSales - beforeCropSale.cropSales === cropSalePrice,
    "crop-sale ledger differs from cash proceeds",
  );
  assert(
    afterCropSale.taxableSales - beforeCropSale.taxableSales === cropSalePrice,
    "taxable crop-sale income differs from cash proceeds",
  );

  assert(api.insurancePayout(1000, 1000) === 0, "no-loss claim paid out");
  assert(api.insurancePayout(1000, 600) === 200, "partial-loss payout differs");
  assert(api.insurancePayout(1000, 0) === 500, "total-loss payout cap differs");
  assert(api.insurancePayout(0, 0) === 0, "zero coverage paid out");
  assert(api.insurancePayout(-1, 0) === 0, "negative coverage paid out");
  assert(api.insurancePayout(1000, -1) === 0, "negative yield paid out");
  assert(api.insurancePayout(1.5, 0) === 0, "fractional coverage paid out");

  api.importBytes(fixture, "INSURE.SFM");
  const insuredFieldSlot = api.prepareInsuranceField(4, 1000, 0);
  const insuranceQuote = api.insuranceQuote(insuredFieldSlot);
  assert(insuranceQuote?.premium > 0, "insurable field has no premium quote");
  assert(
    insuranceQuote.premium === Math.ceil(insuranceQuote.expectedValue * 0.05),
    "premium is not 5% of expected crop value",
  );
  assert(
    !api.insureField(insuredFieldSlot),
    "unaffordable policy was accepted",
  );
  api.setFunds(1000000);
  assert(api.insureField(insuredFieldSlot), "affordable policy was rejected");
  assert(!api.insureField(insuredFieldSlot), "duplicate policy was accepted");
  const insuredSnapshot = api.insuranceSnapshot();
  assert(
    insuredSnapshot.funds === 1000000 - insuranceQuote.premium &&
      insuredSnapshot.extension.cropInsurancePremiums ===
        insuranceQuote.premium,
    "policy premium was not charged and recorded",
  );
  api.saveLocal();
  api.cancelFieldPolicy?.(insuredFieldSlot);
  api.loadLocal();
  assert(
    api.insuranceSnapshot().extension.cropInsurancePolicies.length === 1,
    "local save/load lost crop insurance policy",
  );

  const extendedSave = api.serializeFarmBytes();
  assert(
    Buffer.from(extendedSave.subarray(0, 4)).toString("ascii") === "SFMX",
    "insured farm was not serialized as SFMX",
  );
  assert(
    Buffer.from(extendedSave).readUInt32LE(8) === format.fileSize,
    "SFMX native payload length differs",
  );
  api.importBytes(extendedSave, "INSURE.SFMX");
  const extendedSnapshot = api.insuranceSnapshot();
  assert(
    extendedSnapshot.currentSaveName === "INSURE.SFMX" &&
      extendedSnapshot.extension.cropInsurancePolicies.length === 1,
    "SFMX round trip lost policy or filename",
  );
  const restoredFieldSlot =
    extendedSnapshot.extension.cropInsurancePolicies[0].fieldSlot;
  const restoredFunds = extendedSnapshot.funds;
  const harvestValue = api.insuranceHarvestValue(restoredFieldSlot);
  const expectedHarvestClaim = api.insurancePayout(
    insuranceQuote.expectedValue,
    harvestValue,
  );
  assert(
    api.finishInsuranceHarvest(restoredFieldSlot) === expectedHarvestClaim &&
      api.insuranceSnapshot().funds === restoredFunds + expectedHarvestClaim,
    "harvest completion did not settle the insured crop claim",
  );
  assert(
    api.finishInsuranceHarvest(restoredFieldSlot) === 0,
    "second harvest completion paid a duplicate claim",
  );
  const claimedSave = api.serializeFarmBytes();
  assert(
    Buffer.from(claimedSave.subarray(0, 4)).toString("ascii") === "SFMX" &&
      api.insuranceSnapshot().extension.cropInsuranceClaims ===
        expectedHarvestClaim,
    "claim ledger was not preserved in SFMX",
  );
  const invalidExtendedSave = Buffer.from(extendedSave);
  invalidExtendedSave.writeUInt16LE(2, 4);
  let unsupportedExtensionError;
  try {
    api.importBytes(invalidExtendedSave, "BAD.SFMX");
  } catch (error) {
    unsupportedExtensionError = error;
  }
  assert(
    unsupportedExtensionError?.message ===
      "Unsupported SimFarm extension save version.",
    "unsupported SFMX version was not rejected",
  );
  let malformedExtensionError;
  try {
    api.normalizeExtension({
      version: 1,
      cropInsurancePolicies: [insuranceQuote, insuranceQuote],
      cropInsurancePremiums: insuranceQuote.premium * 2,
      cropInsuranceClaims: 0,
    });
  } catch (error) {
    malformedExtensionError = error;
  }
  assert(
    malformedExtensionError?.message ===
      "Invalid SimFarm crop insurance policy.",
    "duplicate extension policies were not rejected",
  );

  api.importBytes(fixture, "CONSERVE.SFM");
  const eligibleParcel = api.findVacantConservationParcel();
  assert(eligibleParcel, "fixture has no vacant conservation parcel");
  const conservationFixture = Buffer.from(fixture);
  const conservationParcelIndex =
    eligibleParcel.x * format.parcelGridHeight + eligibleParcel.y;
  conservationFixture[
    format.parcelRecordOffset +
      conservationParcelIndex * format.parcelRecordSize +
      format.parcelStatusOffset
  ] = 1;
  api.importBytes(conservationFixture, "CONSERVE.SFM");
  assert(
    api.findEligibleConservationParcel()?.x === eligibleParcel.x &&
      api.findEligibleConservationParcel()?.y === eligibleParcel.y,
    "test owned vacant parcel was not eligible",
  );
  const unownedParcel = api.findUnownedVacantParcel();
  assert(unownedParcel, "fixture has no unowned vacant parcel");
  assert(
    !api.conservationParcelEligible(unownedParcel.x, unownedParcel.y),
    "unowned parcel passed conservation eligibility",
  );
  const initialConservation = api.conservationSnapshot();
  assert(
    api.enrollConservationParcel(eligibleParcel.x, eligibleParcel.y),
    "eligible conservation parcel was rejected",
  );
  let conservation = api.conservationSnapshot();
  const firstContract = conservation.extension.conservationContracts[0];
  assert(
    conservation.funds === initialConservation.funds + 100 &&
      conservation.extension.conservationPayments === 100 &&
      firstContract.startYear === initialConservation.year &&
      firstContract.endYear === initialConservation.year + 3,
    "enrollment payment or contract dates differ",
  );
  assert(
    api.conservationCell(eligibleParcel.x * 8, eligibleParcel.y * 8) &&
      !api.conservationFieldFootprint(
        eligibleParcel.x * 8,
        eligibleParcel.y * 8,
        1,
        1,
      ),
    "enrolled land allowed a field footprint",
  );
  assert(
    !api.conservationStructureFootprint(
      eligibleParcel.x * 8,
      eligibleParcel.y * 8,
      1,
      1,
    ) &&
      api.conservationToolPlacement(eligibleParcel.x * 8, eligibleParcel.y * 8),
    "enrolled land allowed construction or terrain-tool changes",
  );
  assert(
    !api.sellConservationParcel(eligibleParcel.x, eligibleParcel.y) &&
      api.conservationCell(eligibleParcel.x * 8, eligibleParcel.y * 8),
    "enrolled land could be sold",
  );
  api.saveLocal();
  api.loadLocal();
  assert(
    api.conservationSnapshot().extension.conservationContracts.length === 1,
    "local save/load lost a conservation contract",
  );

  const conservationSave = api.serializeFarmBytes();
  assert(
    Buffer.from(conservationSave.subarray(0, 4)).toString("ascii") === "SFMX",
    "conservation contract was not serialized as SFMX",
  );
  api.importBytes(conservationSave, "CONSERVE.SFMX");
  assert(
    api.conservationSnapshot().extension.conservationContracts.length === 1,
    "SFMX round trip lost conservation contract",
  );
  assert(
    api.rollCalendarYear() === 1,
    "native calendar boundary did not advance the conservation year",
  );
  const afterYearOne = api.conservationSnapshot();
  assert(
    afterYearOne.extension.conservationPayments === 200 &&
      afterYearOne.extension.conservationContracts[0].paymentsMade === 2,
    "calendar rollover did not issue its conservation payment",
  );
  const yearTwo = api.advanceConservationYear(firstContract.startYear + 2);
  const expiration = api.advanceConservationYear(firstContract.startYear + 3);
  conservation = api.conservationSnapshot();
  assert(
    yearTwo.changed &&
      yearTwo.fundsDelta === 100 &&
      expiration.changed &&
      expiration.fundsDelta === 0 &&
      conservation.extension.conservationPayments === 300 &&
      conservation.extension.conservationContracts.length === 0,
    "annual conservation payments or three-year expiry differ",
  );
  assert(
    !api.conservationCell(eligibleParcel.x * 8, eligibleParcel.y * 8),
    "expired contract still restricted the parcel",
  );

  assert(
    api.enrollConservationParcel(eligibleParcel.x, eligibleParcel.y),
    "parcel could not be reenrolled after contract expiry",
  );
  conservation = api.conservationSnapshot();
  const withdrawnContract = conservation.extension.conservationContracts[0];
  assert(
    api.withdrawConservationParcel(eligibleParcel.x, eligibleParcel.y),
    "active conservation contract could not be withdrawn",
  );
  const withdrawnYear = api.advanceConservationYear(
    withdrawnContract.startYear + 1,
  );
  conservation = api.conservationSnapshot();
  assert(
    withdrawnYear.changed === false &&
      withdrawnYear.fundsDelta === 0 &&
      conservation.extension.conservationWithdrawals === 1 &&
      conservation.extension.conservationContracts.length === 0,
    "withdrawal left a future payment or active restriction",
  );

  const maliciousContractSave = Buffer.from(conservationSave);
  const parcelIndex =
    eligibleParcel.x * format.parcelGridHeight + eligibleParcel.y;
  const parcelStatusByte =
    16 +
    format.parcelRecordOffset +
    parcelIndex * format.parcelRecordSize +
    format.parcelStatusOffset;
  maliciousContractSave[parcelStatusByte] = 0;
  let invalidContractSaveError;
  try {
    api.importBytes(maliciousContractSave, "INVALID-CONTRACT.SFMX");
  } catch (error) {
    invalidContractSaveError = error;
  }
  assert(
    invalidContractSaveError?.message ===
      "SFMX conservation contract does not match an owned vacant parcel.",
    "SFMX accepted a contract for an unowned parcel",
  );

  const legacyExtension = api.normalizeExtension({
    version: 1,
    cropInsurancePolicies: [],
    cropInsurancePremiums: 0,
    cropInsuranceClaims: 0,
  });
  assert(
    legacyExtension.conservationContracts.length === 0 &&
      legacyExtension.conservationPayments === 0 &&
      legacyExtension.conservationWithdrawals === 0,
    "pre-conservation extension state did not receive safe defaults",
  );

  api.importBytes(fixture, "ZOOM.SFM");
  api.setCameraZoom(1.5);
  assertBytes(
    api.serializeBytes(),
    fixture,
    "camera zoom must not alter native save bytes",
  );
  api.saveLocal();
  api.setCameraZoom(1);
  api.loadLocal();
  assert(
    api.getCameraZoom() === 1.5,
    "local save/load lost the transient camera zoom preference",
  );

  console.log(
    "save compatibility: 8 native scenarios, crop-sale accounting, SFMX insurance and conservation round trips, payment/expiry/withdrawal, and boundary validation verified",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
