// Pointer geometry, scenario startup, binary save compatibility, and file dialogs.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  pointerClientPosition = { clientX: event.clientX, clientY: event.clientY };
  pointerCanvasBounds = {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  // Both values are CSS viewport coordinates. DevicePixelRatio must not be
  // applied: the fixed 640x480 bitmap is already scaled by these dimensions.
  const point =
    bounds.width > 0 && bounds.height > 0
      ? {
          x: Math.floor(((event.clientX - bounds.left) * WIDTH) / bounds.width),
          y: Math.floor(
            ((event.clientY - bounds.top) * HEIGHT) / bounds.height,
          ),
        }
      : { x: -16, y: -16 };
  pointerVisible =
    point.x >= 0 && point.x < WIDTH && point.y >= 0 && point.y < HEIGHT;
  return point;
}

function synchronizePointerGeometry() {
  // Keep the unattended native center until a real pointer event arrives.
  if (!pointerClientPosition || !pointerCanvasBounds) return false;
  const bounds = canvas.getBoundingClientRect();
  if (
    ["left", "top", "width", "height"].every(
      (key) => bounds[key] === pointerCanvasBounds[key],
    )
  ) {
    return false;
  }
  pointer = canvasPoint(pointerClientPosition);
  // Only the reversible drag preview follows a layout change. Resizing
  // must not place roads or commit another gameplay action by itself.
  if (windowDragState) moveWindowDrag(pointer);
  return true;
}

function inside(point, x, y, width, height) {
  return (
    point.x >= x && point.x < x + width && point.y >= y && point.y < y + height
  );
}

function startGame(forceGeneratedRegion = false) {
  fileDialogPauseHeld = false;
  const startingGeneratedWorld =
    stage === "designer" && designerRuntime?.generated;
  markerIndex = scenarioMarkers.findIndex(
    ([x, y]) => x === selectedRegion.gridX && y === selectedRegion.gridY,
  );
  if (markerIndex < 0) markerIndex = null;
  if (startingGeneratedWorld || forceGeneratedRegion) markerIndex = null;
  // These three runtime cursors are zero-initialized by the DOS executable
  // and advance independently through the five serialized weather years.
  state.weatherCategoryCycle = 0;
  state.weatherPrecipitationCycle = 0;
  state.weatherTemperatureCycle = 0;
  // Unlike those three cycle bytes, the current/lookahead weather buffers,
  // DS:23fe moisture accumulator and wind globals survive FUN_850f_0f2c.
  // The root's normal 1b98:0abc call below shifts the retained lookahead
  // into this game's first week and applies any accumulated soil change.
  state.season = 1;
  state.bankQuarterlyPayment = 0;
  state.bankCreditLimit = 48432;
  state.bankDebt = 0;
  // DS:b3a4's annual interest rate is process-only. New Game resets bank
  // balances/collateral, but keeps that rate until the next annual draw.
  state.bankStructureCollateral = 0;
  state.bankDefaultCountdown = 0;
  state.bankMissedPayment = 0;
  state.bankLastNotice = "";
  state.bankruptcyState = 0;
  state.taxableSaleIncome = 0;
  state.propertyTaxDue = 0;
  state.propertyTaxCountdown = 0;
  state.propertyTaxLastNotice = "";
  state.propertyTaxPenaltyCount = 0;
  state.townReserve = 40000;
  // ovl19_0bc8 initializes the process-global disaster-enabled byte to one
  // for every newly started game. File > Load is deliberately different:
  // resetImportedGameRuntime() retains this non-SFM byte.
  state.disastersDisabled = false;
  // The three LFSRs and the five-word terrain history belong to the DOS
  // process, not a farm. The root initializer seeds them once, outside its
  // New Game loop; File > New Game continues them through the next terrain,
  // forecast and traffic initialization (as does File > Load).
  groundRouteWearCounter = 0;
  evaluationRuntime = freshEvaluationRuntime();
  resetIrrigationRuntime();
  if (markerIndex === null) {
    if (startingGeneratedWorld) {
      generatedWorldBytes = buildDesignerSfm();
      if (!generatedWorldBytes)
        throw new Error("Missing native terrain-designer template");
      farmStateBytes = generatedWorldBytes.slice();
      generatedWorldActive = true;
      currentSaveName = "SIMFARM.SFM";
      readDateAndFunds(farmStateBytes);
      normalizeLoadedTownParcels();
      readStartupCamera(farmStateBytes);
    } else {
      // Selector return3 is the ordinary regional-new-game branch. Native
      // startup has already generated once before the selector, but this
      // branch runs ovl19_073a again before choosing its settlements.
      // Use the same recovered generator used by Design Your Own; unlike an
      // authored scenario this is a complete, mutable SFM state.
      const levels = regionLevels();
      designerRuntime = {
        rainfall: levels.rainfall,
        temperature: levels.temperature,
        windSpeed: levels.windSpeed,
        waterFlags: nativeTerrainWaterFlags,
        generated: false,
      };
      generateDesignerWorld(state.soilMoisture);
      generatedWorldBytes = buildDesignerSfm();
      if (!generatedWorldBytes)
        throw new Error("Missing native generated-region template");
      farmStateBytes = generatedWorldBytes.slice();
      generatedWorldActive = true;
      currentSaveName = "SIMFARM.SFM";
      readDateAndFunds(farmStateBytes);
      normalizeLoadedTownParcels();
      readStartupCamera(farmStateBytes);
    }
  } else {
    generatedWorldActive = false;
    const scenarioIndex = scenarioFileIndexes[markerIndex];
    const scenario = saveData.states.find(
      (candidate) => candidate.scenarioIndex === scenarioIndex,
    );
    if (!scenario)
      throw new Error(`Missing native state for scenario ${scenarioIndex}`);
    farmStateBytes = decodeState(scenario.stateBase64);
    readDateAndFunds(farmStateBytes);
    normalizeLoadedTownParcels();
    readStartupCamera(farmStateBytes);
  }
  livestockAssetValue = farmStateBytes
    ? stateView(farmStateBytes).getUint32(
        saveData.format.livestockPurchaseExpenseOffset1,
        true,
      )
    : 0;
  normalizeScenarioMarketPrices();
  if (markerIndex === null) initializeMarketRuntime();
  else initializeLoadedScenarioMarketRuntime();
  // The original load/new-game path performs one 1b98:0abc buffer shift:
  // the retained lookahead week becomes current while a forecast for the
  // following week is synthesized from the SFM table. Only the very first
  // process start sees the executable's all-zero lookahead initializer.
  applyWeeklyWeatherTransition();
  if (generatedWorldActive) {
    // The custom-world initializer creates eight town-traffic records after
    // that forecast. buildDesignerSfm peeks at these values for stable
    // redraw/save bytes; consume them here so later gameplay sees the same
    // live primary-LFSR state as DOS.
    for (let feature = 0; feature < 8; feature += 1) nextSimRandom();
  } else if (farmStateBytes && markerIndex !== null) {
    // Authored SSM scenarios may already contain live traffic. Native new-
    // game startup nevertheless requests eight more cars, stopping naturally
    // when the fixed 16-record table fills.
    const format = saveData.format;
    const townX =
      stateView(farmStateBytes).getUint16(format.townCenterXOffset, true) * 8;
    const townY =
      stateView(farmStateBytes).getUint16(format.townCenterYOffset, true) * 8;
    for (let car = 0; car < 8; car += 1) allocateTownTraffic(townX, townY, 4);
  }
  // 1c43:02f4 initializes the runtime thermometer from the first authored
  // temperature byte plus the independent FUN_15fd_00a3(5) variation.
  const initialTemperature =
    weatherRecordByteByIndex(
      0,
      saveData?.format?.weatherTemperatureOffset ?? 2,
      true,
    ) ?? currentWeatherTemperature();
  state.currentTemperature = initialTemperature + nextSimSmallRandom(5);
  state.currentWeatherCondition = state.weatherDays[state.day] ?? 0;
  refreshFieldSoilMoisture();
  readAuthoredParcelStatuses();
  readAuthoredWindbreakBytes();
  state.speed = "Normal";
  // The construction template was captured while paused in DOS. A new
  // game's Play transition resumes it without altering its numeric clocks.
  farmStateBytes[saveData.format.speedSelectionOffset ?? 0x21718] = 2;
  farmStateBytes[saveData.format.pauseFlagOffset ?? 0x21719] = 0;
  resetCalendarTimer();
  // ovl19:0174 resets this far-data clock when entering a fresh game.
  // File Load does not serialize or reset it.
  irrigationLastTick = biosClockTick();
  resetLivestockTimer();
  restoreSerializedSpeedRuntime();
  resetTownTrafficTimer();
  resetLivestockHerdRuntime();
  setOnlyGameWindow("map");
  editVisible = true;
  mapMode = -1;
  selectedParcel = null;
  currentMenu = null;
  message = "";
  selectedTool = "Examine";
  selectedPurchaseItem = null;
  resetBuyWindowRuntime();
  resetSellWindowRuntime();
  resetBankWindowRuntime();
  modalNotice = null;
  pendingHomesteadImprovement = null;
  homesteadNoticeAnimation = null;
  nextHomesteadNoticeAnimationAt = 0;
  queuedModalNotice = null;
  queuedGenericEventRecords = [];
  pendingFinanceAuction = null;
  pendingMonthBoundary = null;
  clearGenericEventDisplaySnapshot();
  pendingBankruptcySource = null;
  bankruptcyPromptArmed = false;
  pendingTownVote = null;
  townVoteDisplaySnapshot = null;
  pendingTownEventBoundary = null;
  pendingTownEventPrompt = null;
  pendingBulldozeAction = null;
  townEventDisplaySnapshot = null;
  townEventRandomX = 0;
  townEventRandomY = 0;
  selectedCropSlot = null;
  selectedSprayAction = null;
  selectedFieldSlot = null;
  selectedMachineSlot = null;
  dusterFlight = null;
  tornadoEvent = null;
  locustEvent = null;
  droughtEvent = null;
  floodEvent = null;
  floodDuration = 0;
  frostEvent = null;
  frostCountdown = 0;
  windstormEvent = null;
  closeEncounterEvent = null;
  toxicityWarningShown = false;
  townDebugVisible = false;
  debugCommandBuffer.fill("\0");
  debugCommandIndex = 0;
  disasterEventIntervalTicks = 4;
  fieldScheduleWeek = state.month * 4;
  fieldScheduleSelection = 0;
  fieldScheduleScrollbarHeld = false;
  toolPopup = null;
  heldEditHelp = false;
  heldMapHelp = false;
  heldBankHelp = false;
  weatherVaneFrame = 0;
  resetWeatherVaneTimer();
  mapDirty = false;
  dragState = null;
  heldLivestockInfo = null;
  heldMachineInfo = null;
  heldStructureInfo = null;
  heldTerrainInfo = null;
  movingMachineSlot = 0;
  nextDusterFlightAt = Date.now() + dusterFlightInterval;
  resetMapTileAnimationTimer();
  stage = "game";
}

function decodeState(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeState(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function stateView(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readStartupCamera(bytes) {
  const x = Math.min(63, bytes[saveData.format.startupCoordinateXOffset] + 1);
  const y = Math.min(73, bytes[saveData.format.startupCoordinateYOffset]);
  camera = { x, y, initialX: x, initialY: y };
}

function readDateAndFunds(bytes) {
  const view = stateView(bytes);
  state.funds = view.getInt32(saveData.format.fundsOffset, true);
  state.day = view.getUint16(saveData.format.dayIndexOffset, true);
  state.week = view.getUint16(saveData.format.weekIndexOffset, true);
  state.year = view.getUint16(saveData.format.yearOffset, true);
  state.month = view.getUint16(saveData.format.monthIndexOffset, true);
  state.season =
    saveData.format.seasonIndexOffset === undefined
      ? calendarSeasonForDate()
      : view.getUint16(saveData.format.seasonIndexOffset, true);
  state.bankQuarterlyPayment = view.getUint32(
    saveData.format.bankQuarterlyPaymentOffset,
    true,
  );
  state.bankCreditLimit = view.getUint32(
    saveData.format.bankCreditLimitOffset,
    true,
  );
  state.bankDebt = view.getUint32(saveData.format.bankTotalDebtOffset, true);
  state.taxableSaleIncome = view.getUint32(
    saveData.format.taxableSaleIncomeOffset,
    true,
  );
  state.propertyTaxDue = view.getUint32(
    saveData.format.propertyTaxDueOffset,
    true,
  );
  state.propertyTaxCountdown =
    bytes[saveData.format.propertyTaxCountdownOffset];
  state.bankInterestRate ??= 15;
  state.options.AutoBuy = bytes[saveData.format.autoBuyOptionOffset] !== 0;
  state.options.AutoScroll =
    bytes[saveData.format.autoScrollOptionOffset] !== 0;
  state.options.AutoDoze = bytes[saveData.format.autoDozeOptionOffset] !== 0;
  state.options.AutoLease = bytes[saveData.format.autoLeaseOptionOffset] !== 0;
  state.options.Messages = bytes[saveData.format.messagesOptionOffset] !== 0;
  state.options.AutoGoto = bytes[saveData.format.autoGotoOptionOffset] !== 0;
}

function writeDateAndFunds(bytes) {
  const view = stateView(bytes);
  view.setInt32(saveData.format.fundsOffset, state.funds, true);
  view.setUint16(saveData.format.dayIndexOffset, state.day, true);
  if (saveData.format.seasonIndexOffset !== undefined) {
    view.setUint16(
      saveData.format.seasonIndexOffset,
      state.season ?? calendarSeasonForDate(),
      true,
    );
  }
  view.setUint16(saveData.format.weekIndexOffset, state.week, true);
  view.setUint16(saveData.format.yearOffset, state.year, true);
  view.setUint16(saveData.format.monthIndexOffset, state.month, true);
  view.setUint32(
    saveData.format.bankQuarterlyPaymentOffset,
    state.bankQuarterlyPayment,
    true,
  );
  view.setUint32(
    saveData.format.bankCreditLimitOffset,
    state.bankCreditLimit,
    true,
  );
  view.setUint32(saveData.format.bankTotalDebtOffset, state.bankDebt, true);
  view.setUint32(
    saveData.format.taxableSaleIncomeOffset,
    state.taxableSaleIncome,
    true,
  );
  view.setUint32(
    saveData.format.propertyTaxDueOffset,
    state.propertyTaxDue,
    true,
  );
  bytes[saveData.format.propertyTaxCountdownOffset] =
    state.propertyTaxCountdown;
  bytes[saveData.format.autoBuyOptionOffset] = state.options.AutoBuy ? 1 : 0;
  bytes[saveData.format.autoBuyRuntimeOffset] = state.options.AutoBuy ? 1 : 0;
  bytes[saveData.format.autoBuyRuntimeMirrorOffset] = state.options.AutoBuy
    ? 1
    : 0;
  bytes[saveData.format.autoScrollOptionOffset] = state.options.AutoScroll
    ? 1
    : 0;
  bytes[saveData.format.autoScrollRuntimeOffset] = state.options.AutoScroll
    ? 1
    : 0;
  bytes[saveData.format.autoScrollRuntimeMirrorOffset] = state.options
    .AutoScroll
    ? 1
    : 0;
  bytes[saveData.format.autoDozeOptionOffset] = state.options.AutoDoze ? 1 : 0;
  bytes[saveData.format.autoDozeRuntimeOffset] = state.options.AutoDoze ? 1 : 0;
  bytes[saveData.format.autoDozeRuntimeMirrorOffset] = state.options.AutoDoze
    ? 1
    : 0;
  bytes[saveData.format.autoLeaseOptionOffset] = state.options.AutoLease
    ? 1
    : 0;
  bytes[saveData.format.autoLeaseRuntimeOffset] = state.options.AutoLease
    ? 1
    : 0;
  bytes[saveData.format.messagesOptionOffset] = state.options.Messages ? 1 : 0;
  bytes[saveData.format.messagesRuntimeOffset] = state.options.Messages ? 1 : 0;
  bytes[saveData.format.autoGotoOptionOffset] = state.options.AutoGoto ? 1 : 0;
  bytes[saveData.format.autoGotoRuntimeOffset] = state.options.AutoGoto ? 1 : 0;
}

function writeSpeedRuntimeState(speed) {
  if (speedTickThresholds[speed] !== undefined) {
    calendarIntervalTicks = speedTickThresholds[speed];
  }
  if (!farmStateBytes) return;
  const format = saveData.format;
  const index = ["Ultra", "Fast", "Normal", "Slow", "Pause"].indexOf(speed);
  if (index < 0) return;
  farmStateBytes[format.speedSelectionOffset ?? 0x21718] = index;
  farmStateBytes[format.pauseFlagOffset ?? 0x21719] = speed === "Pause" ? 1 : 0;
  if (speedTickThresholds[speed] === undefined) return;
  const view = stateView(farmStateBytes);
  view.setUint16(
    format.calendarSpeedThresholdOffset ?? 0x2171a,
    speedTickThresholds[speed],
    true,
  );
  view.setUint16(format.machinerySpeedThresholdOffset ?? 0x2171c, 1, true);
  view.setUint16(
    format.actorSpeedThresholdOffset ?? 0x2171e,
    livestockTickThresholds[speed],
    true,
  );
  view.setUint16(format.secondaryActorControlOffset ?? 0x21720, 2, true);
}

function restoreSerializedSpeedRuntime() {
  if (!farmStateBytes || !saveData) return;
  const format = saveData.format;
  const view = stateView(farmStateBytes);
  calendarIntervalTicks = view.getUint16(
    format.calendarSpeedThresholdOffset ?? 0x2171a,
    true,
  );
  livestockIntervalTicks = view.getUint16(
    format.actorSpeedThresholdOffset ?? 0x2171e,
    true,
  );
  const index = farmStateBytes[format.speedSelectionOffset ?? 0x21718];
  const paused = farmStateBytes[format.pauseFlagOffset ?? 0x21719] !== 0;
  // FUN_4e29_283c restores both the selected menu index and the independent
  // pause byte, followed by numeric calendar/actor clocks. Pause can retain
  // any prior numeric cadence; never infer those thresholds from its index.
  state.speed = paused
    ? "Pause"
    : ["Ultra", "Fast", "Normal", "Slow"][index] ||
      Object.keys(speedTickThresholds).find(
        (speed) => speedTickThresholds[speed] === calendarIntervalTicks,
      ) ||
      "Normal";
}

function beginNativeFileDialogPause() {
  if (fileDialogPauseHeld || !farmStateBytes) return;
  // ovl18_10e2 increments DS:0187 without changing DS:a8a0 or any numeric
  // speed thresholds. This byte is a nesting counter, not a boolean: Save
  // As over the Pause menu writes two, while Save As over Slow writes one.
  const offset = saveData.format.pauseFlagOffset ?? 0x21719;
  farmStateBytes[offset] = (farmStateBytes[offset] + 1) & 0xff;
  fileDialogPauseHeld = true;
  state.speed = "Pause";
}

function endNativeFileDialogPause(loadedState = false) {
  if ((!fileDialogPauseHeld && !loadedState) || !farmStateBytes) return;
  fileDialogPauseHeld = false;
  const offset = saveData.format.pauseFlagOffset ?? 0x21719;
  const level = farmStateBytes[offset];
  // ovl22_054e reads the serialized counter before releasing its Load
  // dialog, whereas the raw 4e29:283c disk reader does not normalize it.
  if (level === 0) return;
  farmStateBytes[offset] = level - 1;
  if (level > 1) {
    state.speed = "Pause";
    return;
  }
  // ovl18_1138 always resumes at Normal, even if the dialog was opened over
  // Fast/Slow. Restoring the previous speed is not native behavior.
  state.speed = "Normal";
  disasterEventIntervalTicks = 4;
  livestockIntervalTicks = livestockTickThresholds.Normal;
  writeSpeedRuntimeState("Normal");
  message = "";
}

function normalizeSfmFilename(name) {
  const leaf = String(name || "")
    .split(/[\\/]/)
    .pop()
    .replace(/\.(?:sfm|ssm)$/i, "");
  const stem = leaf
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 8);
  return `${stem || "SIMFARM"}.SFM`;
}

function serializeSfmBytes() {
  if (!farmStateBytes) return null;
  writeDateAndFunds(farmStateBytes);
  return farmStateBytes.slice();
}

function inferMarkerIndexFromSfm(bytes) {
  if (!saveData || bytes.length !== saveData.format.fileSize) return null;
  const format = saveData.format;
  const coordinateOffsets = [
    format.startupCoordinateXOffset,
    format.startupCoordinateXOffset + 1,
    format.startupCoordinateYOffset,
    format.startupCoordinateYOffset + 1,
    format.startupCoordinateReducedXOffset,
    format.startupCoordinateReducedXOffset + 1,
    format.startupCoordinateReducedYOffset,
    format.startupCoordinateReducedYOffset + 1,
    format.townCenterXOffset,
    format.townCenterXOffset + 1,
    format.townCenterYOffset,
    format.townCenterYOffset + 1,
  ];
  for (
    let candidate = 0;
    candidate < scenarioFileIndexes.length;
    candidate += 1
  ) {
    const scenarioIndex = scenarioFileIndexes[candidate];
    const scenario = saveData.states.find(
      (entry) => entry.scenarioIndex === scenarioIndex,
    );
    if (!scenario) continue;
    const authored = decodeState(scenario.stateBase64);
    if (
      !coordinateOffsets.every((offset) => bytes[offset] === authored[offset])
    )
      continue;
    // SFM has no region identifier. Only select a captured scenario skin
    // when both its fixed origins and complete terrain/elevation byte
    // plane match. Gameplay changes tiles, crops, ownership and entities,
    // but preserves this fifth display-cell byte. A different terrain
    // plane is a custom world and must use the fully decoded renderer.
    let matchesTerrain = true;
    for (let cell = 0; cell < format.mapCellCount; cell += 1) {
      const offset =
        format.displayCellMapOffset + cell * format.mapCellSize + 4;
      if (bytes[offset] !== authored[offset]) {
        matchesTerrain = false;
        break;
      }
    }
    if (matchesTerrain) return candidate;
  }
  return null;
}

function isDesignerGeneratedSfm(bytes) {
  if (!saveData || bytes.length !== saveData.format.fileSize) return false;
  // Empty inventories and exactly nine owned parcels identify only a new
  // farm. A developed generated world must remain loadable after planting,
  // buying animals/machines, and acquiring or selling land.
  return (
    bytes[saveData.format.leadingCropCountOffset] === 24 &&
    inferMarkerIndexFromSfm(bytes) === null
  );
}

function inferDesignerClimateLevels(bytes) {
  const tables = regionData.climate.tables;
  const names = ["windSpeed", "rainfall", "temperature"];
  const inferred = {};
  names.forEach((name, category) => {
    inferred[name] = 0;
    for (let level = 0; level < 4; level += 1) {
      let record = 0;
      let matches = true;
      for (let cycle = 0; cycle < 5 && matches; cycle += 1) {
        for (let month = 0; month < 12 && matches; month += 1) {
          for (let week = 0; week < 4; week += 1) {
            const actual =
              bytes[
                saveData.format.weatherRecordOffset + record * 3 + category
              ];
            if (actual !== (tables[name][level][cycle][month][week] & 0xff))
              matches = false;
            record += 1;
          }
        }
      }
      if (matches) {
        inferred[name] = level;
        break;
      }
    }
  });
  return inferred;
}

function resetImportedGameRuntime() {
  // Raw disk import discards child-window ownership; the actual File Load
  // callback releases the newly read pause counter explicitly afterward.
  fileDialogPauseHeld = false;
  const retainedOptions = state?.options || {};
  const retainedDisastersDisabled = Boolean(state?.disastersDisabled);
  // Native FUN_4e29_283c only overwrites the addresses explicitly present
  // in the 139,072-byte payload. The weather buffers/cursors/readings and
  // the three 15fd RNG words are process globals absent from that stream,
  // so File > Load leaves them untouched. New-game initialization remains
  // in startGame(); imported SFM files must retain the live process values.
  const retainedWeatherRuntime = {
    weatherCategoryCycle: state?.weatherCategoryCycle ?? 0,
    weatherPrecipitationCycle: state?.weatherPrecipitationCycle ?? 0,
    weatherTemperatureCycle: state?.weatherTemperatureCycle ?? 0,
    weatherDays: Array.isArray(state?.weatherDays)
      ? [...state.weatherDays]
      : [3, 3, 3, 0, 0, 0, 0],
    nextWeatherDays: Array.isArray(state?.nextWeatherDays)
      ? [...state.nextWeatherDays]
      : [0, 0, 0, 0, 0, 0, 0],
    weatherMoistureAccumulator: state?.weatherMoistureAccumulator ?? 0,
    soilMoisture: state?.soilMoisture ?? 8,
    currentWindSpeed: state?.currentWindSpeed ?? 5,
    windBoost: state?.windBoost ?? 0,
    currentTemperature: state?.currentTemperature,
    currentWeatherCondition: state?.currentWeatherCondition,
  };
  const retainedFinancialRuntime = {
    // DS:b3a4's annually selected interest and the separate town expansion
    // reserve are process globals, not fields in FUN_4e29's SFM stream.
    bankInterestRate: state?.bankInterestRate ?? 15,
    townReserve: state?.townReserve ?? 40000,
  };
  state = {
    funds: 40000,
    day: 0,
    season: 1,
    week: 0,
    month: 3,
    year: 1998,
    ...retainedWeatherRuntime,
    bankQuarterlyPayment: 0,
    bankCreditLimit: 48432,
    bankDebt: 0,
    ...retainedFinancialRuntime,
    bankStructureCollateral: 0,
    bankDefaultCountdown: 0,
    bankMissedPayment: 0,
    bankLastNotice: "",
    bankruptcyState: 0,
    taxableSaleIncome: 0,
    propertyTaxDue: 0,
    propertyTaxCountdown: 0,
    propertyTaxLastNotice: "",
    propertyTaxPenaltyCount: 0,
    speed: "Normal",
    options: {
      Music: true,
      "Sound Effects": true,
      AutoBuy: true,
      AutoScroll: true,
      AutoDoze: false,
      AutoGoto: true,
      Messages: true,
      AutoLease: true,
      ...retainedOptions,
    },
    disastersDisabled: retainedDisastersDisabled,
  };
  generatedWorldActive = false;
  generatedWorldBytes = null;
  groundRouteWearCounter = 0;
  livestockAssetValue = 0;
  resetIrrigationRuntime();
  manualHarvestAnimationTicks.clear();
  storedMachineDirections.clear();
  resetCalendarTimer();
  resetLivestockTimer();
  resetTownTrafficTimer();
  resetLivestockHerdRuntime();
  nextDusterFlightAt = Date.now() + dusterFlightInterval;
  resetMapTileAnimationTimer();
  clearGameWindows();
  editVisible = true;
  mapMode = -1;
  selectedParcel = null;
  currentMenu = null;
  menuHover = -1;
  selectedTool = "Examine";
  selectedPurchaseItem = null;
  resetBuyWindowRuntime();
  resetSellWindowRuntime();
  resetBankWindowRuntime();
  modalNotice = null;
  pendingHomesteadImprovement = null;
  homesteadNoticeAnimation = null;
  nextHomesteadNoticeAnimationAt = 0;
  queuedModalNotice = null;
  queuedGenericEventRecords = [];
  pendingFinanceAuction = null;
  pendingMonthBoundary = null;
  clearGenericEventDisplaySnapshot();
  pendingBankruptcySource = null;
  bankruptcyPromptArmed = false;
  pendingTownVote = null;
  townVoteDisplaySnapshot = null;
  pendingTownEventBoundary = null;
  pendingTownEventPrompt = null;
  pendingBulldozeAction = null;
  townEventDisplaySnapshot = null;
  townEventRandomX = 0;
  townEventRandomY = 0;
  selectedCropSlot = null;
  selectedSprayAction = null;
  selectedFieldSlot = null;
  selectedMachineSlot = null;
  dusterFlight = null;
  tornadoEvent = null;
  locustEvent = null;
  droughtEvent = null;
  floodEvent = null;
  floodDuration = 0;
  frostEvent = null;
  frostCountdown = 0;
  windstormEvent = null;
  closeEncounterEvent = null;
  toxicityWarningShown = false;
  townDebugVisible = false;
  debugCommandBuffer.fill("\0");
  debugCommandIndex = 0;
  fieldScheduleSelection = 0;
  toolPopup = null;
  heldEditHelp = false;
  heldMapHelp = false;
  heldBankHelp = false;
  weatherVaneFrame = 0;
  resetWeatherVaneTimer();
  dragState = null;
  heldLivestockInfo = null;
  heldMachineInfo = null;
  heldStructureInfo = null;
  heldTerrainInfo = null;
  movingMachineSlot = 0;
}

function importSfmBytes(input, filename = "SIMFARM.SFM") {
  let source;
  if (input instanceof ArrayBuffer) source = new Uint8Array(input);
  else if (ArrayBuffer.isView(input)) {
    source = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else source = new Uint8Array(input);
  if (!saveData || source.byteLength !== saveData.format.fileSize) {
    throw new Error(
      `SimFarm saves must be exactly ${saveData?.format?.fileSize || 139072} bytes.`,
    );
  }
  const imported = source.slice();
  const importedGeneratedWorld = isDesignerGeneratedSfm(imported);
  const importedMarker = importedGeneratedWorld
    ? null
    : inferMarkerIndexFromSfm(imported);
  if (!importedGeneratedWorld && importedMarker === null) {
    throw new Error("Unable to identify this SimFarm save's region.");
  }

  const retainedRandomStates = {
    primary: simRandomState,
    secondary: simSecondaryRandomState,
    small: simSmallRandomState,
  };
  resetImportedGameRuntime();
  farmStateBytes = imported;
  livestockAssetValue = stateView(farmStateBytes).getUint32(
    saveData.format.livestockPurchaseExpenseOffset1,
    true,
  );
  markerIndex = importedMarker;
  generatedWorldActive = importedGeneratedWorld;
  generatedWorldBytes = importedGeneratedWorld ? imported.slice() : null;
  if (importedGeneratedWorld) {
    designerRuntime = {
      ...inferDesignerClimateLevels(imported),
      generated: false,
    };
  } else {
    const [gridX, gridY] = scenarioMarkers[markerIndex];
    selectedRegion = { gridX, gridY };
  }
  currentSaveName = normalizeSfmFilename(filename);
  readDateAndFunds(farmStateBytes);
  restoreSerializedSpeedRuntime();
  readStartupCamera(farmStateBytes);
  readAuthoredParcelStatuses();
  readAuthoredWindbreakBytes();
  // The native reader retains samples0..28/control bytes but reloads each
  // crop definition, replacing its graph tail29 with the CRP baseline.
  initializeLoadedScenarioMarketRuntime();
  simRandomState = retainedRandomStates.primary;
  simSecondaryRandomState = retainedRandomStates.secondary;
  simSmallRandomState = retainedRandomStates.small;
  fieldScheduleWeek = state.month * 4;
  mapDirty = true;
  stage = "game";
  message = `Game Loaded: ${currentSaveName}`;
  return true;
}

function downloadSfmFile(filename = currentSaveName) {
  const bytes = serializeSfmBytes();
  if (!bytes) return null;
  currentSaveName = normalizeSfmFilename(filename);
  const urlApi = globalThis.URL;
  if (
    typeof Blob === "undefined" ||
    typeof urlApi?.createObjectURL !== "function"
  )
    return bytes;
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = urlApi.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = currentSaveName;
  anchor.hidden = true;
  document.body?.append?.(anchor);
  anchor.click();
  anchor.remove?.();
  urlApi.revokeObjectURL(url);
  return bytes;
}

function openSaveGameDialog(exitAfter = false) {
  beginNativeFileDialogPause();
  const existingStem = currentSaveName.replace(/\.sfm$/i, "");
  saveDialogName = existingStem === "SIMFARM" ? "" : existingStem.slice(0, 8);
  saveDialogExitAfter = exitAfter;
  saveDialogSavedName = "";
  modalNotice = null;
  openGameWindow("save-game");
  message = "";
}

function quitToTitle() {
  fileDialogPauseHeld = false;
  modalNotice = null;
  pendingHomesteadImprovement = null;
  homesteadNoticeAnimation = null;
  nextHomesteadNoticeAnimationAt = 0;
  genericEventRecord = null;
  queuedGenericEventRecords = [];
  pendingFinanceAuction = null;
  pendingMonthBoundary = null;
  clearGenericEventDisplaySnapshot();
  townDebugVisible = false;
  clearGameWindows();
  currentMenu = null;
  selectedFieldSlot = null;
  selectedMachineSlot = null;
  selectedPurchaseItem = null;
  toolPopup = null;
  saveDialogExitAfter = false;
  stage = "title";
  resetStartupStageTimer();
}

function commitSaveGameDialog() {
  if (!saveDialogName) return false;
  currentSaveName = normalizeSfmFilename(saveDialogName);
  downloadSfmFile(currentSaveName);
  saveGame({ optionalCache: true });
  saveDialogSavedName = currentSaveName;
  modalNotice = "save-success";
  return true;
}

function saveSfmFile(saveAs = false) {
  if (saveAs) {
    openSaveGameDialog(false);
    return true;
  }
  downloadSfmFile(currentSaveName);
  saveGame({ optionalCache: true });
  message = `Game Saved: ${currentSaveName}`;
  return true;
}

function requestLoadGame() {
  beginNativeFileDialogPause();
  if (
    saveFileInput &&
    saveFileInput !== canvas &&
    typeof saveFileInput.click === "function"
  ) {
    saveFileInput.value = "";
    saveFileInput.click();
    return;
  }
  loadGame();
  endNativeFileDialogPause(true);
}

function saveGame({ optionalCache = false } = {}) {
  if (farmStateBytes) writeDateAndFunds(farmStateBytes);
  const serialized = JSON.stringify({
    state,
    markerIndex,
    generatedWorldActive,
    selectedRegion,
    currentSaveName,
    camera,
    mapDirty,
    randomState: simRandomState,
    secondaryRandomState: simSecondaryRandomState,
    smallRandomState: simSmallRandomState,
    designerRandomHistory,
    marketRuntime,
    evaluationRuntime,
    livestockAssetValue,
    irrigationRuntime,
    stateBase64: farmStateBytes ? encodeState(farmStateBytes) : null,
  });
  try {
    localStorage.setItem("simfarm-native-save", serialized);
  } catch (error) {
    // The native SFM file is the explicit Save result. Browser storage is
    // an additional recovery cache and may be disabled or out of quota.
    // Direct cache-only callers still receive their write failure.
    if (!optionalCache) throw error;
    return false;
  }
  message = "Game Saved";
  return true;
}

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem("simfarm-native-save"));
    if (!saved) throw new Error("missing");
    state = saved.state;
    state.weatherCategoryCycle ??= 0;
    state.weatherPrecipitationCycle ??= 0;
    state.weatherTemperatureCycle ??= 0;
    state.weatherDays ??= [3, 3, 3, 0, 0, 0, 0];
    state.nextWeatherDays ??= [0, 0, 0, 0, 0, 0, 0];
    state.weatherMoistureAccumulator ??= 0;
    state.soilMoisture ??= 8;
    state.currentWindSpeed ??= 5;
    state.windBoost ??= 0;
    state.bankQuarterlyPayment ??= 0;
    state.bankCreditLimit ??= 48432;
    state.bankDebt ??= 0;
    state.bankInterestRate ??= 15;
    state.bankStructureCollateral ??= 0;
    state.bankDefaultCountdown ??= 0;
    state.bankMissedPayment ??= 0;
    state.bankLastNotice ??= "";
    state.bankruptcyState ??= 0;
    state.taxableSaleIncome ??= 0;
    state.propertyTaxDue ??= 0;
    state.propertyTaxCountdown ??= 0;
    state.propertyTaxLastNotice ??= "";
    state.propertyTaxPenaltyCount ??= 0;
    state.townReserve ??= 40000;
    markerIndex = saved.markerIndex;
    generatedWorldActive =
      saved.generatedWorldActive ??
      (saved.stateBase64
        ? isDesignerGeneratedSfm(decodeState(saved.stateBase64))
        : false);
    selectedRegion = saved.selectedRegion;
    currentSaveName = normalizeSfmFilename(saved.currentSaveName);
    farmStateBytes = saved.stateBase64 ? decodeState(saved.stateBase64) : null;
    generatedWorldBytes =
      generatedWorldActive && farmStateBytes ? farmStateBytes.slice() : null;
    if (farmStateBytes) readDateAndFunds(farmStateBytes);
    readAuthoredParcelStatuses();
    readAuthoredWindbreakBytes();
    if (saved.camera) camera = saved.camera;
    else if (farmStateBytes) readStartupCamera(farmStateBytes);
    mapDirty = saved.mapDirty ?? Boolean(farmStateBytes);
    simRandomState = saved.randomState || seedSimRandom();
    simSecondaryRandomState =
      saved.secondaryRandomState || seedSimSecondaryRandom();
    simSmallRandomState = saved.smallRandomState || seedSimSmallRandom();
    designerRandomHistory = Array.isArray(saved.designerRandomHistory)
      ? saved.designerRandomHistory.map((value) => value & 0xffff).slice(0, 5)
      : seedDesignerRandomHistory();
    while (designerRandomHistory.length < 5) designerRandomHistory.push(0);
    groundRouteWearCounter = 0;
    marketRuntime = freshMarketRuntime();
    if (saved.marketRuntime) {
      marketRuntime.initialized = Boolean(saved.marketRuntime.initialized);
      marketRuntime.selectedCrop = Math.max(
        0,
        Math.min(15, Math.trunc(saved.marketRuntime.selectedCrop ?? 0)),
      );
      marketRuntime.trend = Math.max(
        0,
        Math.min(2, Math.trunc(saved.marketRuntime.trend ?? 0)),
      );
      marketRuntime.trendAge = Math.max(
        0,
        Math.trunc(saved.marketRuntime.trendAge ?? 0),
      );
      if (Array.isArray(saved.marketRuntime.history)) {
        for (let slot = 0; slot < 16; slot += 1) {
          if (!Array.isArray(saved.marketRuntime.history[slot])) continue;
          for (let sample = 0; sample < 30; sample += 1) {
            marketRuntime.history[slot][sample] =
              Math.trunc(saved.marketRuntime.history[slot][sample] ?? 0) &
              0xffff;
          }
        }
      }
    }
    if (!marketRuntime.initialized && farmStateBytes)
      initializeLoadedScenarioMarketRuntime();
    evaluationRuntime = {
      ...freshEvaluationRuntime(),
      ...(saved.evaluationRuntime || {}),
    };
    livestockAssetValue =
      saved.livestockAssetValue ??
      (farmStateBytes
        ? stateView(farmStateBytes).getUint32(
            saveData.format.livestockPurchaseExpenseOffset1,
            true,
          )
        : 0);
    resetIrrigationRuntime(saved.irrigationRuntime);
    dragState = null;
    heldLivestockInfo = null;
    heldMachineInfo = null;
    heldStructureInfo = null;
    heldTerrainInfo = null;
    selectedParcel = null;
    selectedPurchaseItem = null;
    selectedFieldSlot = null;
    selectedMachineSlot = null;
    dusterFlight = null;
    tornadoEvent = null;
    locustEvent = null;
    droughtEvent = null;
    floodEvent = null;
    floodDuration = 0;
    frostEvent = null;
    frostCountdown = 0;
    windstormEvent = null;
    closeEncounterEvent = null;
    toxicityWarningShown = false;
    townDebugVisible = false;
    debugCommandBuffer.fill("\0");
    debugCommandIndex = 0;
    disasterEventIntervalTicks =
      state.speed === "Ultra" ? 1 : state.speed === "Fast" ? 2 : 4;
    resetSellWindowRuntime();
    resetBankWindowRuntime();
    modalNotice = null;
    pendingHomesteadImprovement = null;
    homesteadNoticeAnimation = null;
    nextHomesteadNoticeAnimationAt = 0;
    queuedModalNotice = null;
    queuedGenericEventRecords = [];
    pendingFinanceAuction = null;
    pendingMonthBoundary = null;
    clearGenericEventDisplaySnapshot();
    pendingBankruptcySource = null;
    bankruptcyPromptArmed = false;
    pendingTownVote = null;
    townVoteDisplaySnapshot = null;
    pendingTownEventBoundary = null;
    pendingTownEventPrompt = null;
    pendingBulldozeAction = null;
    townEventDisplaySnapshot = null;
    townEventRandomX = 0;
    townEventRandomY = 0;
    resetCalendarTimer();
    resetLivestockTimer();
    restoreSerializedSpeedRuntime();
    resetTownTrafficTimer();
    resetLivestockHerdRuntime();
    nextDusterFlightAt = Date.now() + dusterFlightInterval;
    resetMapTileAnimationTimer();
    weatherVaneFrame = 0;
    resetWeatherVaneTimer();
    clearGameWindows();
    stage = "game";
    message = "Game Loaded";
  } catch (_) {
    // File-menu callback 4a42:0bf0 requests forced EVENTS.DAT record zero
    // when its *.SFM search finds nothing. The force bit makes this blocking
    // card independent of the Messages option.
    requestGenericEvent(0x80);
  }
}
