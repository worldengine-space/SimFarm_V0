// Selection input, town events, weekly aging, calendar updates, and main loop.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function selectorReleaseButtonAtPoint(point) {
  if (stage === "region") {
    // ovl06_0000 compares x97..236 inclusively, with distinct row bounds.
    if (point.x < 97 || point.x > 236) return null;
    for (const [action, top, bottom, bevel] of [
      ["play", 233, 255, [96, 232, 140, 23]],
      ["design", 257, 279, [96, 256, 141, 24]],
      ["load", 281, 304, [96, 280, 140, 24]],
      ["quit", 305, 327, [96, 305, 140, 23]],
    ]) {
      if (point.y >= top && point.y <= bottom) return { action, bevel };
    }
  } else if (stage === "designer") {
    if (point.y >= 286 && point.y <= 308) {
      if (point.x >= 402 && point.x <= 448) {
        return { action: "play", bevel: [401, 285, 47, 24] };
      }
      if (point.x >= 267 && point.x <= 388) {
        return { action: "generate", bevel: [266, 285, 122, 24] };
      }
    }
    for (const [name, top] of [
      ["rainfall", 102],
      ["temperature", 160],
      ["windSpeed", 219],
    ]) {
      if (point.y < top || point.y > top + 16) continue;
      for (const [left, delta] of [
        [244, 1],
        [139, -1],
      ]) {
        if (point.x >= left && point.x <= left + 16) {
          return { action: "climate", name, delta, bevel: [left, top, 15, 15] };
        }
      }
    }
  }
  return null;
}

function click(point, sound = true) {
  if (!ready) return;
  if (sound) play();
  if (stage === "presents") {
    stage = "title";
    resetStartupStageTimer();
  } else if (stage === "title") stage = "region";
  else if (stage === "region") {
    const button = selectorReleaseButtonAtPoint(point);
    // 3f18:0375..03c7 uses strict outer bounds before subtracting the
    // SCENARIO origin and arithmetic-shifting both coordinates by four.
    // Consequently the top/left frame pixels are not selector hotspots.
    if (point.x > 248 && point.x < 536 && point.y > 40 && point.y < 320) {
      const gridX = Math.floor((point.x - 248) / 16);
      const gridY = Math.floor((point.y - 40) / 16);
      if (regionData.selector.maps.selectable[gridY][gridX])
        selectedRegion = { gridX, gridY };
    } else if (button?.action === "play") startGame();
    else if (button?.action === "design") enterTerrainDesigner();
    else if (button?.action === "load") {
      // ovl06_0000 returns1 only after a second terrain pass and settlement
      // selection. Startup builds that farm before opening Load; cancelling
      // therefore leaves its live Edit/Map windows, not the Region selector.
      startGame(true);
      requestLoadGame();
    } else if (button?.action === "quit") {
      stage = "title";
      resetStartupStageTimer();
    }
  } else if (stage === "designer") {
    const button = selectorReleaseButtonAtPoint(point);
    // The native large-button comparisons are strict on all four edges.
    if (button?.action === "play") startGame();
    else if (button?.action === "generate") {
      generateDesignerWorld();
    } else if (
      point.x > 176 &&
      point.x < 224 &&
      point.y > 258 &&
      point.y < 282
    ) {
      designerRuntime.waterFlags ^= 1;
    } else if (
      point.x > 176 &&
      point.x < 224 &&
      point.y > 285 &&
      point.y < 309
    ) {
      designerRuntime.waterFlags ^= 2;
    } else if (button?.action === "climate")
      adjustDesignerClimate(button.name, button.delta);
  } else if (stage === "game") handleGameClick(point);
  render();
}

function selectToolPopup(point) {
  if (toolPopup === "plant" && inside(point, 64, 128, 224, 128)) {
    const column = point.x < 176 ? 0 : 1;
    const row = Math.floor((point.y - 128) / 16);
    const cropSlot = row + column * 8;
    if (cropSlot >= 0 && cropSlot < fieldCropNames.length) {
      selectedTool = "Plant Field";
      selectedCropSlot = cropSlot;
      selectedSprayAction = null;
      setQuickMessage(0x11);
    }
  } else if (toolPopup === "spray" && inside(point, 64, 208, 112, 64)) {
    const action = sprayActions[Math.floor((point.y - 208) / 16)];
    if (action) {
      selectedTool = `Spray Field: ${action.name}`;
      selectedCropSlot = null;
      selectedSprayAction = action;
      setQuickMessage(action.messageRecord);
    }
  }
  toolPopup = null;
}

function updateMenuHover(point) {
  if (currentMenu === null) return;
  const menu = menus[currentMenu];
  menuHover = inside(
    point,
    menu.dropX,
    16,
    menu.dropWidth,
    menu.items.length * 12,
  )
    ? Math.floor((point.y - 16) / 12)
    : -1;
}

function activeTownEventLivestock() {
  const active = [];
  if (!farmStateBytes || !saveData) return active;
  for (let slot = 1; slot < saveData.format.objectRecordCount; slot += 1) {
    const record = objectRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    active.push({
      slot,
      selection: (view.getUint16(6, true) + 0x60) & 0xff,
    });
  }
  return active;
}

function townEventAnimal(selection = townEventSelection()) {
  return {
    name: townEventAnimalNames[selection] || "Betsy",
    species: townEventAnimalSpecies[selection] || "Cow",
  };
}

function openTownEventPrompt(kind, lines, displaySnapshot, question = false) {
  pendingTownEventPrompt = { kind, lines, question };
  townEventDisplaySnapshot = { ...displaySnapshot };
  modalNotice = question ? `town-${kind}-question` : `town-${kind}`;
}

function beginTownRodeo(displaySnapshot) {
  if (!startTownEventMode(1)) return false;
  // 19ab:0bde requires a $1,000 balance before it even offers the $500 bet.
  if (state.funds < 1000) {
    startTownEventMode(0);
    return false;
  }
  playMusic("rodeo");
  openTownEventPrompt(
    "rodeo",
    [
      "The Town Rodeo is starting!",
      "Your cousin Jed wants to",
      "know if you'll bet 500",
      "bucks on him to win! If he",
      "wins you'll get 1,000",
      "dollars back.",
    ],
    displaySnapshot,
    true,
  );
  return true;
}

function beginTownFair(displaySnapshot) {
  if (!startTownEventMode(2)) return false;
  playMusic("carnival");
  const active = activeTownEventLivestock();
  if (active.length === 0 || state.funds < 200) {
    setTownEventSelection(0xff);
    openTownEventPrompt(
      "fair-info",
      ["The town fair is starting!"],
      displaySnapshot,
    );
    return true;
  }
  const selected = active[nextSimSmallRandom(active.length)] || active[0];
  setTownEventSelection(selected.selection);
  const animal = townEventAnimal(selected.selection);
  openTownEventPrompt(
    "fair",
    [
      "The Town Fair is starting!",
      "Would you like to enter",
      `${animal.name} the ${animal.species} in the ${animal.species.toLowerCase()}`,
      "judging contest? Entry fee",
      "is 200 dollars",
    ],
    displaySnapshot,
    true,
  );
  return true;
}

function triggerTownEventAtBoundary(displaySnapshot) {
  if (!state.options.Messages || state.week !== 4) return false;
  if (state.month === 5) return beginTownRodeo(displaySnapshot);
  if (state.month === 8) return beginTownFair(displaySnapshot);
  return false;
}

function resolveTownEventPhase(displaySnapshot) {
  const phase = townEventPhase();
  if (phase === 0) return false;
  setTownEventPhase(phase - 1);
  if (phase > 1) return false;

  const mode = townEventMode();
  let lines = null;
  if (mode === 1 && townEventResult() !== 0) {
    if ((nextSimRandom() & 3) === 2) {
      state.funds += townEventResult();
      lines = ["Your cousin Jed WON!! You", "made 500 dollars!!!"];
    } else {
      lines = ["Your cousin Jed LOST. You", "lost your 500 bucks."];
    }
  } else if (
    mode === 2 &&
    townEventResult() !== 0 &&
    townEventSelection() !== 0xff
  ) {
    const animal = townEventAnimal();
    if ((nextSimRandom() & 1) !== 0) {
      state.funds += 1000;
      lines = [`${animal.name} WON FIRST PRIZE!!! You`, "Win 1000 Dollars!"];
    } else {
      lines = [`${animal.name} LOST! Well, maybe`, "next year."];
    }
    setTownEventSelection(0xff);
  }
  startTownEventMode(0);
  if (!lines) return false;
  openTownEventPrompt("event-result", lines, displaySnapshot);
  return true;
}

function answerTownEventPrompt(accepted) {
  if (!pendingTownEventPrompt?.question) return false;
  const kind = pendingTownEventPrompt.kind;
  if (kind === "rodeo") {
    if (accepted && state.funds >= 500) {
      state.funds -= 500;
      adjustMachineOperatingExpense(500);
      setTownEventResult(1000);
    } else {
      setTownEventResult(0);
    }
    setTownEventPhase(2);
  } else if (kind === "fair") {
    if (accepted && state.funds >= 200) {
      state.funds -= 200;
      adjustMachineOperatingExpense(200);
      setTownEventResult(1);
    } else {
      setTownEventResult(0);
    }
    setTownEventPhase(3);
  } else {
    return false;
  }
  modalNotice = null;
  pendingTownEventPrompt = null;
  completePendingTownEventBoundary();
  return true;
}

function dismissTownEventNotice() {
  if (!pendingTownEventPrompt || pendingTownEventPrompt.question) return false;
  if (pendingTownEventPrompt.kind === "fair-info") setTownEventPhase(3);
  modalNotice = null;
  pendingTownEventPrompt = null;
  completePendingTownEventBoundary();
  return true;
}

function advanceMachineWeek() {
  if (!farmStateBytes || !saveData) return false;
  const saveView = stateView(farmStateBytes);
  let changed = false;
  // The DOS loop uses the live owned-machine count as its upper record
  // bound.  If an early slot wears out and is sold, the decremented bound
  // deliberately leaves the former last slot untouched for this week.
  for (
    let slot = 1;
    slot <= saveView.getUint16(saveData.format.machineCountOffset, true);
    slot += 1
  ) {
    const record = machineRecord(slot);
    if (!record) break;
    const view = stateView(record);
    const flags = view.getUint16(2, true);
    if ((flags & 0x20) === 0) continue;

    const nextAge = record[18] + 1;
    if (nextAge <= 4) {
      record[18] = nextAge;
      changed = true;
      continue;
    }

    record[18] = 0;
    record[17] = Math.min(0xff, record[17] + Math.floor(nextAge / 4) + 1);
    changed = true;
    // Temporary leased machinery accumulates the same wear, but the weekly
    // routine never sells it when that wear reaches the terminal value.
    if (record[17] !== 0xff || (flags & 0x40) !== 0) continue;

    const definition = itemDefinitionForKeyAndId(
      "machine",
      view.getUint16(0, true),
    );
    if (!definition) continue;
    if ((flags & 4) !== 0)
      clearStoredMachineFootprint(record[5], record[6], slot);
    sellInventoryEntry({
      categoryKey: "machine",
      slot,
      record,
      definition,
      price: machineCurrentValue(record, definition),
    });
    // 19ab:02ec follows the successful terminal-damage sale callback.
    play("explode");
    setQuickMessage(0x49);
  }
  return changed;
}

function advanceStructureWeek(now = Date.now()) {
  if (!farmStateBytes || !saveData) return false;
  const saveView = stateView(farmStateBytes);
  let changed = false;
  let processed = 0;
  // 19ab:0398 walks physical slots until it has seen the current number of
  // active structures. Empty holes therefore do not consume the live-count
  // bound. The bit-1 state used by a burst tower remains active, but freezes
  // its age on subsequent weeks.
  for (
    let slot = 1;
    processed < saveView.getUint16(saveData.format.structureCountOffset, true);
    slot += 1
  ) {
    const record = structureRecord(slot);
    if (!record) break;
    const view = stateView(record);
    const flags = view.getUint16(2, true);
    if ((flags & 0x20) === 0) continue;
    processed += 1;
    if ((flags & 0x0002) !== 0) continue;

    const age = (view.getUint16(8, true) + 1) & 0xffff;
    view.setUint16(8, age, true);
    record[6] = age < 0x03fc ? age >>> 2 : 0xff;
    changed = true;

    if (
      view.getUint16(0, true) !== 0x48 ||
      age <= 0x01e0 ||
      (nextSimRandom() & 0x3f) !== 7
    )
      continue;
    record[6] = 0xff;
    view.setUint16(10, 0, true);
    const cell = mapCell(record[4], record[5]);
    if (cell) {
      const word = tileWords(cell).base;
      writeMapBaseWord(cell, (word & 0xf895) | 0x0095);
      mapDirty = true;
    }
    record[2] |= 0x02;
    // The state mutation is unconditional. EVENTS.DAT record 44 still uses
    // the ordinary Messages option and 0x3c0-tick repeat gate.
    requestGenericEvent(44, now);
  }
  return changed;
}

function advanceChemicalStorageWeek() {
  if (!farmStateBytes || !saveData) return false;
  const saveView = stateView(farmStateBytes);
  let processed = 0;
  let changed = false;
  // The following 19ab:0504 loop uses the same active-record count walk as
  // structures. Both raw counters intentionally wrap at their native byte
  // and word widths; 0xff/0xffff are not treated as saturation sentinels.
  for (
    let slot = 1;
    processed <
    saveView.getUint16(saveData.format.chemicalStorageCountOffset, true);
    slot += 1
  ) {
    const record = chemicalStorageRecord(slot);
    if (!record) break;
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    record[9] = (record[9] + 1) & 0xff;
    view.setUint16(10, (view.getUint16(10, true) + 1) & 0xffff, true);
    processed += 1;
    changed = true;
  }
  return changed;
}

function drawWaterFromTowers(limit) {
  if (!farmStateBytes || !saveData || limit <= 0) return 0;
  const saveView = stateView(farmStateBytes);
  let processed = 0;
  let total = 0;
  for (
    let slot = 1;
    processed < saveView.getUint16(saveData.format.structureCountOffset, true);
    slot += 1
  ) {
    if (total >= limit) break;
    const record = structureRecord(slot);
    if (!record) break;
    const view = stateView(record);
    const flags = view.getUint16(2, true);
    if ((flags & 0x20) === 0) continue;
    processed += 1;
    if (view.getUint16(0, true) !== 0x48) continue;
    const reserve = view.getUint16(10, true);
    if (reserve === 0) continue;
    total = reserve + total < limit ? total + reserve : limit;
    // FUN_27d4_0304 empties the selected tower even when only part of its
    // reserve was required, so excess water is deliberately discarded.
    view.setUint16(10, 0, true);
    if ((flags & 1) !== 0) {
      const cell = mapCell(record[4], record[5]);
      if (cell) {
        writeMapBaseWord(cell, 0x0053);
        mapDirty = true;
      }
    }
  }
  return total;
}

function advanceStorageLotWeek() {
  if (!farmStateBytes || !saveData) return false;
  const saveView = stateView(farmStateBytes);
  let processed = 0;
  let changed = false;
  for (
    let slot = 1;
    processed < saveView.getUint16(saveData.format.storageLotCountOffset, true);
    slot += 1
  ) {
    const record = storageLotRecord(slot);
    if (!record) break;
    const view = stateView(record);
    const flags = record[10];
    if ((flags & 0x20) === 0) continue;
    processed += 1;
    const id = view.getUint16(0, true);
    if ((id >= 0x00a8 && id <= 0x00bf) || (id >= 0x00c0 && id <= 0x00d7)) {
      const quality = view.getUint16(4, true);
      if (quality < 0xfffa) {
        view.setUint16(
          4,
          Math.min(0xfffa, quality + ((flags & 4) !== 0 ? 1 : 4)),
          true,
        );
      }
    }
    if (id === 0x012b && view.getUint16(2, true) === 0) {
      const refill = drawWaterFromTowers(0x40);
      view.setUint16(2, (refill << 1) & 0xffff, true);
      if (refill !== 0) {
        const cell = mapCell(record[8], record[9]);
        if (cell) {
          writeMapBaseWord(cell, (tileWords(cell).base & 0xf800) | 0x00b0);
          mapDirty = true;
        }
      }
    }
    view.setUint16(6, (view.getUint16(6, true) + 1) & 0xffff, true);
    changed = true;
  }
  return changed;
}

function advanceWaterTowerDay() {
  if (!farmStateBytes || !saveData) return false;
  const saveView = stateView(farmStateBytes);
  let processed = 0;
  let changed = false;
  const carriesGroundwater = (x, y) => {
    const cell = mapCell(x, y);
    if (!cell) return false;
    const tile = tileWords(cell).base & 0x07ff;
    return tile >= 0x0062 && tile < 0x0062 + 0x0b;
  };
  for (
    let slot = 1;
    processed < saveView.getUint16(saveData.format.structureCountOffset, true);
    slot += 1
  ) {
    const record = structureRecord(slot);
    if (!record) break;
    const view = stateView(record);
    const flags = view.getUint16(2, true);
    if ((flags & 0x20) === 0) continue;
    processed += 1;
    if (
      view.getUint16(0, true) !== 0x48 ||
      record[6] === 0xff ||
      (flags & 0x40) !== 0
    )
      continue;
    const x = record[4];
    const y = record[5];
    if (
      !carriesGroundwater(x, y - 1) &&
      !carriesGroundwater(x + 1, y) &&
      !carriesGroundwater(x, y + 1) &&
      !carriesGroundwater(x - 1, y)
    )
      continue;
    const reserve = Math.min(0xff, view.getUint16(10, true) + 0x32);
    view.setUint16(10, reserve, true);
    if ((flags & 1) !== 0) {
      const cell = mapCell(x, y);
      if (cell) {
        writeMapBaseWord(cell, (reserve >>> 6) + 0x53);
        mapDirty = true;
      }
    }
    changed = true;
  }
  return changed;
}

function pauseMonthBoundary(nextPhase, priorDisplay, enteredNewYear) {
  if (
    modalNotice === null &&
    genericEventRecord === null &&
    !bankruptcyPromptArmed &&
    pendingBankruptcySource === null
  )
    return false;
  pendingMonthBoundary = { phase: nextPhase, priorDisplay, enteredNewYear };
  return true;
}

function rollAnnualFieldSchedule() {
  if (!farmStateBytes || !saveData) return false;
  const format = saveData.format;
  const scheduleStart = format.sourceMapBlockOffset;
  const wordsPerYear = 48 * format.fieldRecordCount;
  const scheduleWords = 240 * format.fieldRecordCount;
  const sourceStart = scheduleStart + wordsPerYear * 2;
  // Native's year rollover copies a full 240-week block from week 48 back
  // to week zero. Its separately allocated source extends 48 weeks into
  // uninitialized heap memory. The browser's contiguous SFM image supplies
  // deterministic tail bytes instead; all retained active schedule rows
  // have the same overlapping move and exact contents.
  farmStateBytes.copyWithin(
    scheduleStart,
    sourceStart,
    sourceStart + scheduleWords * 2,
  );
  return true;
}

function finishMonthBoundary(priorDisplay, continuation = null) {
  let phase = continuation?.phase ?? 0;
  let enteredNewYear = continuation?.enteredNewYear ?? false;
  if (phase === 0 && state.week >= 4) {
    state.week = 0;
    state.month += 1;
    // 19ab:0f70 mutates the secondary LFSR at every month rollover before
    // December is normalized to January and before the weekly Market pass.
    // Its `CMP word`/`JLE` is signed: values 0x8000..0xffff are negative and
    // therefore do not take the positive overflow reset.
    simSecondaryRandomState =
      (simSecondaryRandomState + state.month * 4) & 0xffff;
    if (simSecondaryRandomState < 0x8000 && simSecondaryRandomState > 0x1fff) {
      simSecondaryRandomState = 0x04d2;
    }
    if (state.month >= 12) {
      state.month = 0;
      rollAnnualFieldSchedule();
      state.year += 1;
      enteredNewYear = true;
      state.bankInterestRate = (nextSimSecondaryRandom() & 7) + 8;
      resetAnnualRainfallEvents();
      state.weatherCategoryCycle = ((state.weatherCategoryCycle ?? 0) + 1) % 5;
      state.weatherPrecipitationCycle =
        ((state.weatherPrecipitationCycle ?? 0) + 1) % 5;
      state.weatherTemperatureCycle =
        ((state.weatherTemperatureCycle ?? 0) + 1) % 5;
    }
    advanceLivestockMating();
    phase = 1;
  } else if (phase === 0) {
    phase = 5;
  }

  if (phase <= 1) {
    processBankMonthlyDefault();
    if (pauseMonthBoundary(2, priorDisplay, enteredNewYear)) return true;
    phase = 2;
  }
  if (phase <= 2) {
    processPropertyTaxMonthlyDefault();
    if (pauseMonthBoundary(3, priorDisplay, enteredNewYear)) return true;
    phase = 3;
  }
  if (phase <= 3) {
    if (enteredNewYear) {
      processAnnualPropertyTax(priorDisplay);
    } else {
      processPropertyTaxEstimateWarning();
    }
    if (pauseMonthBoundary(4, priorDisplay, enteredNewYear)) return true;
    phase = 4;
  }
  if (phase <= 4) {
    if (enteredNewYear) {
      // Native 19ab performs the property-tax collection (including its
      // blocking town annex), rolls the ledgers, updates Evaluation, and
      // only then classifies the homestead from the post-tax cash balance.
      resetAnnualCashFlowLedgers();
      updateAnnualEvaluation();
      playFarmConditionMusic();
      updateAnnualHomesteadAudio();
    }
    if (pauseMonthBoundary(5, priorDisplay, enteredNewYear)) return true;
    phase = 5;
  }
  if (phase <= 5) {
    if ([0, 2, 6, 9].includes(state.month)) processBankQuarterlyPayment();
    if (pauseMonthBoundary(6, priorDisplay, enteredNewYear)) return true;
  }
  advanceMarketWeek();
  updateWeatherDisasterLifecycle(state.weatherMoistureAccumulator ?? 0);
  applyWeeklyWeatherTransition(true);
  return false;
}

function completePendingMonthBoundary() {
  if (
    !pendingMonthBoundary ||
    modalNotice !== null ||
    genericEventRecord !== null ||
    queuedGenericEventRecords.length !== 0 ||
    pendingFinanceAuction !== null ||
    bankruptcyPromptArmed ||
    pendingBankruptcySource !== null
  )
    return false;
  const pending = pendingMonthBoundary;
  pendingMonthBoundary = null;
  const blocked = finishMonthBoundary(pending.priorDisplay, pending);
  if (blocked && pending.afterSimulationDay && pendingMonthBoundary) {
    pendingMonthBoundary.afterSimulationDay = pending.afterSimulationDay;
  } else if (!blocked && pending.afterSimulationDay) {
    applyDailyWeather();
    const growthTemperature =
      pending.afterSimulationDay.currentTemperature === undefined
        ? currentWeatherTemperature()
        : pending.afterSimulationDay.currentTemperature;
    advanceCropGrowthPhase(state.week, growthTemperature);
  }
  return !blocked;
}

function continueAdvanceWeek(priorDisplay) {
  // FUN_19ab_010e reaches the condition-score selector on every completed
  // week, before the week counter and June/September town-event dispatch.
  playFarmConditionMusic();
  const scheduleWeek = state.month * 4 + state.week + 1;
  dispatchScheduledFieldOperations(scheduleWeek);
  const category = weatherRecordByte(
    state.weatherCategoryCycle ?? 0,
    state.month,
    state.week,
    saveData?.format?.weatherCategoryOffset ?? 0,
  );
  state.currentWindSpeed = (category ?? 5) + (state.windBoost ?? 0);
  decayWeeklyWindBoost();
  updateWindstormWeatherLifecycle(state.currentWindSpeed);
  updateTornadoWeatherLifecycle(state.currentWindSpeed);
  refreshFieldSoilMoisture();
  processWeeklyTownGrowth();
  advanceMachineWeek();
  advanceStructureWeek();
  advanceChemicalStorageWeek();
  advanceStorageLotWeek();
  playWeeklyBirdSound();
  state.week += 1;
  state.season = calendarSeasonForDate();
  if (triggerTownEventAtBoundary(priorDisplay)) {
    pendingTownEventBoundary = { kind: "month", priorDisplay };
    return true;
  }
  return finishMonthBoundary(priorDisplay);
}

function completePendingTownEventBoundary() {
  const pending = pendingTownEventBoundary;
  if (!pending) {
    townEventDisplaySnapshot = null;
    return false;
  }
  pendingTownEventBoundary = null;
  let blocked = false;
  if (pending.kind === "week")
    blocked = continueAdvanceWeek(pending.priorDisplay);
  else blocked = finishMonthBoundary(pending.priorDisplay);
  if (!blocked && pending.afterSimulationDay) {
    applyDailyWeather();
    const growthTemperature =
      pending.afterSimulationDay.currentTemperature === undefined
        ? currentWeatherTemperature()
        : pending.afterSimulationDay.currentTemperature;
    advanceCropGrowthPhase(state.week, growthTemperature);
  } else if (blocked && pending.afterSimulationDay) {
    if (pendingTownEventBoundary) {
      pendingTownEventBoundary.afterSimulationDay = pending.afterSimulationDay;
    } else if (pendingMonthBoundary) {
      pendingMonthBoundary.afterSimulationDay = pending.afterSimulationDay;
    }
  }
  if (!blocked) townEventDisplaySnapshot = null;
  return blocked;
}

function advanceWeek() {
  // 09ab:0bde increments the week and dispatches before month
  // normalization. Thus the fourth-to-fifth-week boundary addresses the
  // next month's schedule word, and December's boundary uses slot 48.
  const priorDisplay = {
    week: state.week,
    month: state.month,
    year: state.year,
    funds: state.funds,
  };
  if (resolveTownEventPhase(priorDisplay)) {
    pendingTownEventBoundary = { kind: "week", priorDisplay };
    return true;
  }
  return continueAdvanceWeek(priorDisplay);
}

function advanceSimulationDay(currentTemperature) {
  state.day += 1;
  if ((state.day & 1) !== 0) {
    advanceFieldSoilDay();
    advanceLivestockNeeds(
      currentTemperature === undefined
        ? (state.currentTemperature ?? currentWeatherTemperature())
        : currentTemperature,
    );
  }
  // 19ab:14fe invokes the 19ab:06b4 Water Tower recharge pass after every
  // hidden calendar day, independently of the odd-day field/animal pass.
  advanceWaterTowerDay();
  if (state.day < 7) {
    applyDailyWeather();
    return false;
  }
  // Root 09ab:0bde queues empty QMESSAGE record 68 before its weekly
  // livestock pass. Later weekly messages intentionally replace it.
  setQuickMessage(0x44);
  advanceLivestockWeek();
  state.day = 0;
  if (advanceWeek()) {
    if (pendingTownEventBoundary) {
      pendingTownEventBoundary.afterSimulationDay = { currentTemperature };
    } else if (pendingMonthBoundary) {
      pendingMonthBoundary.afterSimulationDay = { currentTemperature };
    }
    return false;
  }
  applyDailyWeather();
  const growthTemperature =
    currentTemperature === undefined
      ? currentWeatherTemperature()
      : currentTemperature;
  return advanceCropGrowthPhase(state.week, growthTemperature);
}

function nativeInputOwnsMainLoop() {
  // Native input callbacks wait synchronously for release: top menus
  // (ovl18:0ade), tool popups (ovl11:0000), window drag (42e9:0000),
  // scrollbar tracking (1636:205c), help (5242:05b9), and Examine
  // (7e85:019e..0283). Their loops repaint/poll input without dispatching
  // the simulation. Browser pointer handlers supply those repaints while
  // preserving the native clocks until the callback logically returns.
  return (
    currentMenu !== null ||
    windowDragState !== null ||
    toolPopup !== null ||
    dragState !== null ||
    mapNavigationHeld ||
    heldEditHelp ||
    heldMapHelp ||
    heldBankHelp ||
    heldLivestockInfo !== null ||
    heldMachineInfo !== null ||
    heldStructureInfo !== null ||
    heldTerrainInfo !== null ||
    sellScrollbarHeld ||
    fieldScheduleScrollbarHeld
  );
}

function frame() {
  advanceMusicSequenceCompletion();
  if (synchronizePointerGeometry()) render();
  const now = Date.now();
  if (stage === "game" && nativeInputOwnsMainLoop()) {
    requestAnimationFrame(frame);
    return;
  }
  let routeExecutorDue = false;
  if (advanceStartupStageTick(now)) render();
  if (advanceAboutCredits(now)) render();
  if (stage === "game") {
    if (advanceAutoScroll()) render();
    if (activeWindow === null && !modalNotice && state.speed !== "Pause") {
      if (advanceMapTileAnimationTick(now)) render();
    } else if (activeWindow !== null || modalNotice) {
      // Native blocking windows freeze the visible ALLTILES phase instead
      // of accumulating elapsed ticks and jumping immediately on return.
      holdMapTileAnimationTimer(now);
    }
  }
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !modalNotice &&
    advanceWeatherVaneTick(now)
  )
    render();
  if (
    stage === "game" &&
    modalNotice === "homestead-upgrade" &&
    advanceHomesteadNoticeAnimation(now)
  )
    render();
  // 19ab:0008 decrements DS:21a2 once per unpaused, nonspecial root pass
  // and skips the complete calendar/actor section even on the1->0 pass.
  // Clocks retain elapsed time; Pause and synchronous callbacks do not
  // drain this counter. Rendering/audio above remain independent.
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice &&
    activityHoldoffPasses !== 0
  ) {
    activityHoldoffPasses -= 1;
    requestAnimationFrame(frame);
    return;
  }
  // FUN_19ab_0008 enters the calendar dispatcher first. This ordering is
  // observable when a day/week boundary and the continuous actor clocks are
  // due in the same main-loop callback because the boundary may consume RNG,
  // mutate fields, or block on a modal before those later dispatchers run.
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice &&
    advanceCalendarTimer(now)
  ) {
    render();
  }
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    dusterFlight &&
    now >= nextDusterFlightAt
  ) {
    nextDusterFlightAt = now + dusterFlightInterval;
    advanceCropDusterFlightTick();
    render();
  }
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice
  ) {
    // 2281:0012 compares each machine's 16-bit route timestamp with the
    // shared two-tick threshold for Fast/Normal/Slow. Ultra (speed index 0)
    // bypasses that comparison, so all three FUN_2281_0002 positions in the
    // root executor can move a machine. One browser frame represents one
    // complete root pass; the later two Ultra calls appear below in their
    // native positions around traffic and field work.
    routeExecutorDue = true;
    const routeChanged = advanceMachineRoutes(now);
    const irrigationChanged = advanceIrrigationTimer(now);
    if (routeChanged || irrigationChanged) render();
  }
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice &&
    advanceLivestockTimer(now)
  ) {
    render();
  }
  // The second native machine call follows livestock. The per-record
  // timestamp blocks a second ground-route step at non-Ultra speeds, while
  // implement collection states still observe every root position.
  if (
    routeExecutorDue &&
    !modalNotice &&
    !dusterFlight &&
    advanceMachineRoutes(now)
  )
    render();
  // FUN_225a_000c follows the second machine-route call. It is a root-pass
  // state machine rather than a 40 ms timer, but Pause and the game's
  // blocking modes prevent this executor from being reached.
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice &&
    advanceChemicalTransferStates()
  ) {
    render();
  }
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice &&
    advanceTownTrafficTimer(now)
  ) {
    render();
  }
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice &&
    advanceDisasterEvents(now)
  ) {
    render();
  }
  // FUN_25b3_000c is the field-operation dispatcher. Native calls it after
  // town traffic, not alongside the earlier machine-route/irrigation pair.
  if (
    routeExecutorDue &&
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice
  ) {
    if (advanceScheduledFieldSupplyStates()) render();
  }
  // FUN_19ab_0008 makes its third machine-route call after field work. The
  // Ultra bypass allows this pass to observe a route just started there.
  if (
    routeExecutorDue &&
    !modalNotice &&
    !dusterFlight &&
    advanceMachineRoutes(now)
  )
    render();
  // The native town-event animator is the final substantive call in
  // FUN_19ab_0008, after machinery, livestock, traffic, and field work.
  if (
    stage === "game" &&
    state.speed !== "Pause" &&
    !dusterFlight &&
    !modalNotice
  ) {
    if (advanceTownEventAnimationTick(now)) render();
  }
  requestAnimationFrame(frame);
}

globalThis.addEventListener?.("resize", () => {
  if (synchronizePointerGeometry()) render();
});
canvas.addEventListener("pointerenter", (event) => {
  pointer = canvasPoint(event);
  render();
});
canvas.addEventListener("pointerleave", (event) => {
  pointer = canvasPoint(event);
  pointerVisible = false;
  render();
});
canvas.addEventListener("pointermove", (event) => {
  pointer = canvasPoint(event);
  if (mapNavigationHeld) {
    // Native tracking ends as soon as the held pointer leaves the map.
    if (!navigateFromOverview(gameWindowPoint(pointer)))
      mapNavigationHeld = false;
    render();
    return;
  }
  if (windowDragState) {
    moveWindowDrag(pointer);
    render();
    return;
  }
  if (sellScrollbarHeld && activeWindow === "sell") {
    seekSellScrollbar(gameWindowPoint(pointer).y);
    render();
    return;
  }
  if (fieldScheduleScrollbarHeld && activeWindow === "field-status") {
    const fieldPoint = gameWindowPoint(pointer);
    if (
      fieldPoint.x > 248 &&
      fieldPoint.x < 408 &&
      fieldPoint.y > 184 &&
      fieldPoint.y < 200
    ) {
      seekFieldScheduleScrollbar(fieldPoint.x);
    }
    render();
    return;
  }
  if (activeWindow === "about") {
    closeActiveWindow();
    render();
    return;
  }
  if (dragState)
    placeSelectedToolAtPoint(gameWindowPoint(pointer, editWindowSentinel));
  updateMenuHover(pointer);
  render();
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.focus({ preventScroll: true });
  // Browsers can reject the automatic AMAIN start before the first user
  // gesture. Retry that same sequence without changing its native lifecycle.
  resumeMusicFromGesture();
  pointer = canvasPoint(event);
  canvas.setPointerCapture(event.pointerId);
  if (event.button === 2) {
    handleGameRightClick(pointer);
    render();
    event.preventDefault();
    return;
  }
  if (event.button !== undefined && event.button !== 0) {
    event.preventDefault();
    return;
  }
  // 1c43:01fd observes the native left-press event bit, before resolving
  // its target child. Release and ordinary pointer motion do not reset it.
  if (stage === "game" && !modalNotice) activityHoldoffPasses = 100;
  menuPointerHeld = false;
  const selectorButton = selectorReleaseButtonAtPoint(pointer);
  if (selectorButton) {
    // Native action buttons draw their depressed frame, then block until
    // release, even if the raw pointer leaves the button in the meantime.
    const soundOnPress =
      stage === "designer" || selectorButton.action === "play";
    selectorButtonHeld = {
      ...selectorButton,
      stage,
      point: { ...pointer },
      soundOnPress,
    };
    if (soundOnPress) play();
    render();
    event.preventDefault();
    return;
  }
  // A dropdown owns the pointer until it closes, including coordinates
  // where it covers an underlying child title or held-help control.
  if (stage === "game" && currentMenu !== null && !modalNotice) {
    click(pointer);
    menuPointerHeld = currentMenu !== null;
    event.preventDefault();
    return;
  }
  heldLivestockInfo = null;
  heldMachineInfo = null;
  heldStructureInfo = null;
  heldTerrainInfo = null;
  const activatedExposedWindow = activateExposedChildAtPoint(pointer);
  if (closeWindowFromTitleAtPoint(pointer)) {
    render();
    event.preventDefault();
    return;
  }
  if (beginWindowDrag(pointer)) {
    render();
    event.preventDefault();
    return;
  }
  if (activatedExposedWindow) {
    render();
    event.preventDefault();
    return;
  }
  const activePoint = activeWindow
    ? gameWindowPoint(pointer)
    : gameWindowPoint(pointer, editWindowSentinel);
  if (
    stage === "game" &&
    activeWindow === "sell" &&
    !modalNotice &&
    inside(activePoint, 144, 209, 17, 63)
  ) {
    sellScrollbarHeld = true;
  }
  if (
    stage === "game" &&
    activeWindow === "field-status" &&
    !modalNotice &&
    activePoint.x > 248 &&
    activePoint.x < 408 &&
    activePoint.y > 184 &&
    activePoint.y < 200
  ) {
    fieldScheduleScrollbarHeld = true;
    seekFieldScheduleScrollbar(activePoint.x);
  }
  if (
    stage === "game" &&
    activeWindow === "bank" &&
    !modalNotice &&
    inside(activePoint, 272, 280, 16, 16)
  ) {
    heldBankHelp = true;
    render();
    event.preventDefault();
    return;
  }
  if (
    stage === "game" &&
    activeWindow === "map" &&
    !modalNotice &&
    inside(activePoint, 108, 210, 30, 30)
  ) {
    heldMapHelp = true;
    render();
    event.preventDefault();
    return;
  }
  if (
    stage === "game" &&
    !activeWindow &&
    !modalNotice &&
    inside(activePoint, 16, 263, 48, 17)
  ) {
    heldEditHelp = true;
    render();
    event.preventDefault();
    return;
  }
  if (
    stage === "game" &&
    !activeWindow &&
    !modalNotice &&
    selectedTool === "Examine" &&
    activePoint.x >= 64 &&
    activePoint.y >= 80 &&
    activePoint.x < 608 &&
    activePoint.y < 448
  ) {
    const position = mapCellForPointer(activePoint);
    const field = position ? fieldAtPosition(position) : null;
    const structure = position && !field ? structureAtPosition(position) : null;
    const machine =
      position && !field && !structure ? machineAtPosition(position) : null;
    const livestock =
      position && !field && !structure && !machine
        ? livestockAtPosition(position)
        : null;
    if (structure) {
      heldStructureInfo = {
        slot: structure.slot,
        pointerX: pointer.x,
        pointerY: pointer.y,
      };
    } else if (machine && machine.id !== 8) {
      heldMachineInfo = {
        slot: machine.slot,
        pointerX: pointer.x,
        pointerY: pointer.y,
      };
    } else if (livestock) {
      heldLivestockInfo = {
        slot: livestock.slot,
        pointerX: pointer.x,
        pointerY: pointer.y,
      };
    } else if (!machine) {
      heldTerrainInfo = terrainExamineInfo(position, pointer.x, pointer.y);
    }
  }
  click(pointer);
  menuPointerHeld = stage === "game" && currentMenu !== null;
  event.preventDefault();
});
canvas.addEventListener("pointerup", (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  mapNavigationHeld = false;
  if (selectorButtonHeld) {
    const held = selectorButtonHeld;
    selectorButtonHeld = null;
    pointer = canvasPoint(event);
    if (stage === held.stage) click(held.point, !held.soundOnPress);
    else render();
    return;
  }
  if (menuPointerHeld) {
    menuPointerHeld = false;
    pointer = canvasPoint(event);
    if (currentMenu !== null) {
      updateMenuHover(pointer);
      if (menuHover >= 0) {
        const menu = menus[currentMenu];
        activateMenuItem(menu, menu.items[menuHover]);
      } else if (pointer.y >= 16) {
        currentMenu = null;
      }
      render();
    }
    return;
  }
  sellScrollbarHeld = false;
  fieldScheduleScrollbarHeld = false;
  if (windowDragState) {
    pointer = canvasPoint(event);
    finishWindowDrag();
    render();
    return;
  }
  if (heldEditHelp || heldMapHelp || heldBankHelp) {
    heldEditHelp = false;
    heldMapHelp = false;
    heldBankHelp = false;
    render();
    return;
  }
  if (
    heldLivestockInfo ||
    heldMachineInfo ||
    heldStructureInfo ||
    heldTerrainInfo
  ) {
    heldLivestockInfo = null;
    heldMachineInfo = null;
    heldStructureInfo = null;
    heldTerrainInfo = null;
    render();
  }
  if (toolPopup) {
    pointer = canvasPoint(event);
    selectToolPopup(gameWindowPoint(pointer, editWindowSentinel));
    render();
    return;
  }
  if (dragState) {
    pointer = canvasPoint(event);
    placeSelectedToolAtPoint(gameWindowPoint(pointer, editWindowSentinel));
    dragState = null;
    render();
  }
});
canvas.addEventListener("pointercancel", () => {
  mapNavigationHeld = false;
  selectorButtonHeld = null;
  if (menuPointerHeld) currentMenu = null;
  menuPointerHeld = false;
  windowDragState = null;
  dragState = null;
  sellScrollbarHeld = false;
  fieldScheduleScrollbarHeld = false;
  toolPopup = null;
  heldLivestockInfo = null;
  heldMachineInfo = null;
  heldStructureInfo = null;
  heldTerrainInfo = null;
  heldEditHelp = false;
  heldMapHelp = false;
  heldBankHelp = false;
  render();
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
saveFileInput?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    endNativeFileDialogPause();
    render();
    return;
  }
  try {
    importSfmBytes(await file.arrayBuffer(), file.name);
    finishNativeSfmFileLoad();
  } catch (error) {
    console.error(error);
    endNativeFileDialogPause();
    message = error.message || "Unable to load game.";
  }
  render();
});
saveFileInput?.addEventListener("cancel", () => {
  endNativeFileDialogPause();
  render();
});
canvas.addEventListener("keydown", (event) => {
  if (controlCropDusterFlight(event)) {
    event.preventDefault();
    return;
  }
  // The native root handler returns immediately for every Ctrl-modified
  // BIOS key, before dispatching to the active child. T/V post retail
  // QMESSAGE records, J/X retain their missing-file no-op, and the debug
  // bracket browser occupies the same branch. QMESSAGE only dirties the
  // editor, so this path deliberately does not force an immediate repaint.
  if (stage === "game" && !modalNotice && event.ctrlKey) {
    applyGlobalControlShortcut(event);
    const eventCardOpened = handleDebugEventScanKey(event);
    if (eventCardOpened) render();
    event.preventDefault();
    return;
  }
  if (event.key === "Escape") {
    // The activated hidden TOWN diagnostic consumes Escape without closing;
    // the original oracle leaves both it and the underlying Map unchanged.
    if (townDebugVisible) {
      event.preventDefault();
      return;
    }
    if (modalNotice) {
      if (
        modalNotice === "new-game-confirm" ||
        modalNotice === "town-vote" ||
        modalNotice === "bankruptcy-question" ||
        pendingTownEventPrompt?.question
      ) {
        event.preventDefault();
        return;
      }
      dismissModalNotice();
      render();
      event.preventDefault();
      return;
    }
    const menuWasOpen = currentMenu !== null;
    currentMenu = null;
    // Controlled native key probes show that ordinary Map/Evaluation and
    // Save Game children ignore Escape. Load Crop owns the one confirmed
    // child-window Escape close path.
    const closeLoadCrop = activeWindow === "load-crop";
    if (closeLoadCrop) closeActiveWindow();
    if (menuWasOpen || closeLoadCrop) render();
    event.preventDefault();
    return;
  }
  if (stage === "game" && activeWindow === "save-game" && !modalNotice) {
    if (event.key === "Backspace") saveDialogName = saveDialogName.slice(0, -1);
    else if (event.key === "Enter") commitSaveGameDialog();
    else if (/^[a-z0-9_-]$/i.test(event.key) && saveDialogName.length < 8) {
      saveDialogName += event.key;
    } else return;
    render();
    event.preventDefault();
    return;
  }
  if (stage === "game" && activeWindow === "bank" && !modalNotice) {
    if (/^[0-9]$/.test(event.key)) appendBankDigit(Number(event.key));
    else if (event.key === ".") clearBankLoanInput();
    else if (event.key === "Enter") commitBankLoan();
    else return;
    render();
    event.preventDefault();
    return;
  }
  if (
    stage === "game" &&
    !modalNotice &&
    debugMode &&
    (event.key === "Enter" ||
      (event.key.length === 1 && event.key.charCodeAt(0) <= 0x7f))
  ) {
    // The direct uppercase-A branch precedes the same handler's 16-byte
    // word buffer, so an eligible Close Encounter is requested first.
    const directChanged = executeDebugSingleKey(event.key);
    const eventChanged = event.key === "A" && requestCloseEncounterEvent();
    const commandMatched = handleDebugCommandKey(event.key);
    // CORN changes the live balance without invalidating the DOS window;
    // retain that quirk. TOWN always refreshes itself; uppercase C sends the
    // native invalidation only to an open Balance Sheet window.
    if (
      eventChanged ||
      (commandMatched && modalNotice) ||
      (directChanged &&
        (event.key === "*" ||
          (event.key === "C" && activeWindow === "balance")))
    )
      render();
    event.preventDefault();
    return;
  }
});

load();
requestAnimationFrame(frame);
