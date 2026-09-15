// Field schedules, crop status, gauges, and field rendering.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function cutFieldScheduleAt(week) {
  if (selectedFieldSlot === null) return;
  const currentWeek = state.month * 4 + state.week;
  if (week <= currentWeek) return;
  // Exact perennial-orchard CUT edit recovered from 73ac:11da: the chosen
  // future week and every later schedule word are replaced with 0x00d1.
  for (let targetWeek = week; targetWeek < 240; targetWeek += 1) {
    setFieldScheduleTile(selectedFieldSlot, targetWeek, 0x00d1);
  }
  mapDirty = true;
}

function scheduleCropAt(week, cropSlot) {
  const definition = cropSimulationDefinitionForSlot(cropSlot);
  if (!definition || selectedFieldSlot === null) return;
  const cropTileBase = 0x02b0 + cropSlot * 8;
  const cropStartTile = 0x0340 + cropSlot;
  const stagesPerTile = Math.max(
    1,
    Math.floor(
      (definition.stageCount + definition.stageDivisor - 2) /
        definition.stageDivisor,
    ),
  );
  const stageTiles = [];
  for (let stage = 0; stage < definition.stageCount; stage += 1) {
    stageTiles.push(
      cropTileBase + definition.stageOffset + Math.floor(stage / stagesPerTile),
    );
  }
  if (definition.fixedHarvestWeek === 0) stageTiles.push(0x01b8);

  let targetWeek = week;
  if (definition.fixedHarvestWeek !== 0) {
    setFieldScheduleTile(selectedFieldSlot, targetWeek, cropStartTile);
    targetWeek += 1;
  }
  let stage = 0;
  for (; targetWeek < 240; targetWeek += 1) {
    if (stage >= definition.stageCount + 2) {
      stage = (definition.perennialFlags & 1) === 0 ? 0 : 2;
    }
    let tile = stage === 0 ? cropStartTile : stageTiles[stage - 1];
    if (definition.fixedHarvestWeek !== 0) {
      const weekOfYear = targetWeek % 48;
      if (weekOfYear === definition.fixedHarvestWeek) {
        tile = 0x01b8;
      } else {
        const weeksAfterHarvest =
          weekOfYear > definition.fixedHarvestWeek
            ? weekOfYear - definition.fixedHarvestWeek
            : weekOfYear - definition.fixedHarvestWeek + 48;
        tile = cropTileBase + Math.floor(weeksAfterHarvest / 6);
      }
    }
    setFieldScheduleTile(selectedFieldSlot, targetWeek, tile);
    stage += 1;
  }
  mapDirty = true;
}

function applyFieldScheduleAction(week) {
  if (selectedFieldSlot === null) return;
  const currentWeek = state.month * 4 + state.week;
  if (fieldScheduleSelection === 21) {
    // 3a77:11da accepts CONTRACT only on the current calendar week. It
    // captures the live commodity quote in field word 48, increments the
    // crop's outstanding-futures count, and replaces the current schedule
    // cell with the 0x00c6 contract sentinel.
    if (week !== currentWeek) return;
    const field = fieldRecord(selectedFieldSlot);
    if (!field || field[2] !== 4) return;
    const fieldView = fieldRecordView(field);
    if (fieldView.getUint16(48, true) !== 0) return;
    const commodity = itemDefinitionForKeyAndId("commodity", 0x80 + field[14]);
    if (!commodity) return;
    fieldView.setUint16(48, commodity.price, true);
    const commodityView = stateView(commodity.record);
    commodityView.setUint16(4, (commodity.own + 1) & 0xffff, true);
    setFieldScheduleTile(selectedFieldSlot, week, 0x00c6);
    mapDirty = true;
    return;
  }
  if (week <= currentWeek) return;
  if (fieldScheduleSelection === 18) {
    cutFieldScheduleAt(week);
    return;
  }
  if (fieldScheduleSelection >= 0 && fieldScheduleSelection < 16) {
    scheduleCropAt(week, fieldScheduleSelection);
    return;
  }
  const scheduleTiles = new Map([
    [22, 0x0393],
    [23, 0x0392],
    [24, 0x0391],
    [25, 0x0390],
  ]);
  if (fieldScheduleSelection === 20) {
    const field = fieldRecord(selectedFieldSlot);
    const definition = field
      ? cropSimulationDefinitionForSlot(field[14])
      : null;
    if (!field || !definition || definition.fixedHarvestWeek !== 0) return;
    setFieldScheduleTile(selectedFieldSlot, week, 0x01b8);
    for (let targetWeek = week + 1; targetWeek < 240; targetWeek += 1) {
      const existing = fieldScheduleTile(selectedFieldSlot, targetWeek);
      if (existing >= 0x0340 && existing <= 0x034f) break;
      setFieldScheduleTile(selectedFieldSlot, targetWeek, 0x00d1);
    }
    mapDirty = true;
    return;
  }
  const tile = scheduleTiles.get(fieldScheduleSelection);
  if (tile === undefined) return;
  const existing = fieldScheduleTile(selectedFieldSlot, week);
  // DOS preserves crop-start, contract, and harvest sentinels when a
  // chemical is painted over the schedule strip.
  if (
    fieldScheduleSelection >= 22 &&
    ((existing >= 0x0340 && existing <= 0x034f) ||
      existing === 0x00c6 ||
      existing === 0x01b8)
  )
    return;
  setFieldScheduleTile(selectedFieldSlot, week, tile);
  mapDirty = true;
}

function drawFieldGauge(index, x, y) {
  const bounded = Math.max(0, Math.min(19, index));
  context.drawImage(images.fieldGauges, bounded * 48, 0, 48, 24, x, y, 48, 24);
}

function fieldWaterGauge(record) {
  const definition = cropSimulationDefinitionForSlot(record[14]);
  const water = fieldRecordView(record).getUint16(24, true);
  if (!definition) return 7;
  const signedByte = (value) => (value & 0x80 ? value - 0x100 : value);
  let lower = signedByte(definition.waterMin) - signedByte(record[51]) * 2;
  if (lower < 0) lower = 0;
  const upper =
    (signedByte(definition.waterMax) + signedByte(record[52]) * 2) & 0xffff;
  const midpoint = ((((upper - lower) & 0xffff) >>> 1) + lower) & 0xffff;
  if (water < lower) return 5;
  if (water < midpoint) return 6;
  // 73ac:0922 leaves class 2 in place for both the exact midpoint and the
  // open interval below the upper threshold. The source game's fourth
  // yellow-band tile is therefore intentionally unreachable here.
  if (water < upper) return 7;
  return 9;
}

function refreshFieldIrrigationState() {
  // FUN_148c_0850 drains the transient full-ditch plane, floods it again
  // from valid pumps/windmills, and then FUN_15b3_0fe6 scans the field
  // perimeter. The transient plane is not part of an SFM display cell, so
  // retain reachability separately and update only the two saved counters.
  refreshFieldSoilMoisture();
  const flooded = new Set();
  const queue = [];
  const enqueue = (x, y, amount) => {
    if (x < 0 || x >= 96 || y < 0 || y >= 96) return;
    const key = `${x},${y}`;
    if (flooded.has(key)) return;
    flooded.add(key);
    queue.push({ x, y, amount });
  };
  const pumpHasGroundwater = (x, y) => {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const cell = mapCell(x + dx, y + dy);
        if (cell && (stateView(cell).getUint16(0, true) & 0x2000) !== 0)
          return true;
      }
    }
    return false;
  };
  for (let slot = 1; slot < saveData.format.structureRecordCount; slot += 1) {
    const structure = structureRecord(slot);
    const view = stateView(structure);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    const id = view.getUint16(0, true);
    if (id === 0x46 && pumpHasGroundwater(structure[4], structure[5])) {
      // FUN_1a66_02e2 registers pumps with 0x40 units.
      enqueue(structure[4], structure[5], 0x40);
    } else if (id === 0x47) {
      // Windmills enter one cell below their origin with 0x30 units.
      enqueue(structure[4], structure[5] + 1, 0x30);
    }
  }
  const carriesWater = (tile) =>
    (tile >= 0x57 && tile <= 0x78) ||
    tile === 0x79 ||
    tile === 0x7a ||
    tile === 0x7c ||
    tile === 0xac ||
    tile === 0xad;
  for (let index = 0; index < queue.length; index += 1) {
    const { x, y, amount } = queue[index];
    if (amount === 0) continue;
    const branches = [];
    for (const { dx, dy } of cardinalNeighbors) {
      const nextX = x + dx;
      const nextY = y + dy;
      const cell = mapCell(nextX, nextY);
      if (!cell || !carriesWater(stateView(cell).getUint16(0, true) & 0x07ff))
        continue;
      if (!flooded.has(`${nextX},${nextY}`))
        branches.push({ x: nextX, y: nextY });
    }
    if (branches.length === 1) {
      if (amount > 1) enqueue(branches[0].x, branches[0].y, amount - 1);
    } else if (branches.length > 1) {
      const share = Math.floor(amount / branches.length);
      if (share === 0) continue;
      for (const branch of branches) enqueue(branch.x, branch.y, share);
    }
  }
  for (const { record } of activeFieldRecords()) {
    let fullDitches = 0;
    let emptyDitches = 0;
    const inspect = (x, y) => {
      const cell = mapCell(x, y);
      if (!cell) return;
      const tile = stateView(cell).getUint16(0, true) & 0x07ff;
      if (tile < 0x57 || tile > 0x6c) return;
      if (flooded.has(`${x},${y}`)) fullDitches += 1;
      else emptyDitches += 1;
    };
    for (let x = record[10]; x <= record[10] + record[12]; x += 1) {
      inspect(x, record[11] + record[13]);
      inspect(x, record[11] - 1);
    }
    for (let y = record[11]; y < record[11] + record[13]; y += 1) {
      inspect(record[10] + record[12], y);
      inspect(record[10] - 1, y);
    }
    record[51] = Math.min(0xff, fullDitches);
    record[52] = Math.min(0xff, emptyDitches);
  }
}

function resetIrrigationRuntime(saved = null) {
  const queue = new Array(128).fill(null);
  if (Array.isArray(saved?.queue)) {
    for (let index = 0; index < Math.min(128, saved.queue.length); index += 1) {
      const entry = saved.queue[index];
      if (!entry) continue;
      queue[index] = {
        x: entry.x & 0xff,
        y: entry.y & 0xff,
        amount: entry.amount & 0xff,
      };
    }
  }
  irrigationRuntime = {
    phase: saved?.phase === 1 ? 1 : 0,
    busy: Boolean(saved?.busy),
    head: (saved?.head ?? 0) & 0x7f,
    tail: (saved?.tail ?? 0) & 0x7f,
    queue,
  };
}

function irrigationPumpHasGroundwater(x, y) {
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const cell = mapCell(x + dx, y + dy);
      if (cell && (stateView(cell).getUint16(0, true) & 0x2000) !== 0)
        return true;
    }
  }
  return false;
}

function irrigationTileCarriesWater(tile, phase) {
  if (tile >= 0x57 && tile <= 0x79) return true;
  if (tile === 0x7a || tile === 0x7c || tile === 0xac || tile === 0xad)
    return true;
  return phase === 0 && (tile === 0x7b || tile === 0x7d);
}

function markIrrigationCell(x, y) {
  const cell = mapCell(x, y);
  if (!cell) return false;
  const view = stateView(cell);
  let word = view.getUint16(0, true);
  const beforeTile = word & 0x07ff;
  if (irrigationRuntime.phase === 0) {
    word &= 0x7fff;
    if (beforeTile >= 0x62 && beforeTile <= 0x6c) word -= 0x0b;
  } else {
    word |= 0x8000;
    if (beforeTile >= 0x57 && beforeTile <= 0x61) word += 0x0b;
  }
  view.setUint16(0, word, true);
  const changed = (word & 0x07ff) !== beforeTile;
  if (changed) mapDirty = true;
  return changed;
}

function enqueueIrrigationCell(x, y, amount) {
  if (x < 0 || x >= 96 || y < 0 || y >= 96) return false;
  const changed = markIrrigationCell(x, y);
  irrigationRuntime.queue[irrigationRuntime.tail] = {
    x: x & 0xff,
    y: y & 0xff,
    amount: amount & 0xff,
  };
  irrigationRuntime.tail = (irrigationRuntime.tail + 1) & 0x7f;
  return changed;
}

function dequeueIrrigationCell() {
  if (irrigationRuntime.head === irrigationRuntime.tail) return null;
  const entry = irrigationRuntime.queue[irrigationRuntime.head];
  irrigationRuntime.head = (irrigationRuntime.head + 1) & 0x7f;
  return entry;
}

function irrigationBranches(x, y) {
  const branches = [];
  for (const neighbor of cardinalNeighbors) {
    const nextX = x + neighbor.dx;
    const nextY = y + neighbor.dy;
    const cell = mapCell(nextX, nextY);
    if (!cell) continue;
    const word = stateView(cell).getUint16(0, true);
    const tile = word & 0x07ff;
    if (!irrigationTileCarriesWater(tile, irrigationRuntime.phase)) continue;
    const visited = (word & 0x8000) !== 0;
    if (
      (irrigationRuntime.phase === 0 && visited) ||
      (irrigationRuntime.phase === 1 && !visited)
    ) {
      branches.push({ x: nextX, y: nextY });
    }
  }
  return branches;
}

function refreshFieldIrrigationCounters() {
  refreshFieldSoilMoisture();
  for (const { record } of activeFieldRecords()) {
    let fullDitches = 0;
    let emptyDitches = 0;
    const inspect = (x, y) => {
      const cell = mapCell(x, y);
      if (!cell) return;
      const tile = stateView(cell).getUint16(0, true) & 0x07ff;
      if (tile >= 0x62 && tile <= 0x6c) fullDitches += 1;
      else if (tile >= 0x57 && tile <= 0x61) emptyDitches += 1;
    };
    for (let x = record[10]; x <= record[10] + record[12]; x += 1) {
      inspect(x, record[11] + record[13]);
      inspect(x, record[11] - 1);
    }
    for (let y = record[11]; y < record[11] + record[13]; y += 1) {
      inspect(record[10] + record[12], y);
      inspect(record[10] - 1, y);
    }
    record[51] = Math.min(0xff, fullDitches);
    record[52] = Math.min(0xff, emptyDitches);
  }
}

function seedIrrigationSources() {
  let changed = false;
  for (let slot = 1; slot < saveData.format.structureRecordCount; slot += 1) {
    const structure = structureRecord(slot);
    const view = stateView(structure);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    const id = view.getUint16(0, true);
    if (
      id === 0x46 &&
      irrigationPumpHasGroundwater(structure[4], structure[5])
    ) {
      changed =
        enqueueIrrigationCell(structure[4], structure[5], 0x40) || changed;
    } else if (
      id === 0x47 &&
      ((state.currentWindSpeed ?? 5) > 8 || irrigationRuntime.phase === 0)
    ) {
      changed =
        enqueueIrrigationCell(structure[4], structure[5] + 1, 0x30) || changed;
    }
  }
  return changed;
}

function beginIrrigationPass() {
  let changed = false;
  if (irrigationRuntime.phase === 0) {
    for (let x = 0; x < 96; x += 1) {
      for (let y = 0; y < 96; y += 1) {
        const cell = mapCell(x, y);
        const view = stateView(cell);
        const word = view.getUint16(0, true);
        const tile = word & 0x07ff;
        if (tile < 0x62 || tile > 0x6c) continue;
        view.setUint16(0, word - 0x0b, true);
        changed = true;
      }
    }
    if (changed) mapDirty = true;
  }
  irrigationRuntime.phase = (irrigationRuntime.phase + 1) & 1;
  if (irrigationRuntime.phase === 0) refreshFieldIrrigationCounters();
  changed = seedIrrigationSources() || changed;
  irrigationRuntime.busy = irrigationRuntime.head !== irrigationRuntime.tail;
  return changed;
}

function advanceIrrigationFrontier(budget = 4) {
  let changed = false;
  let processed = 0;
  while (processed < budget) {
    const entry = dequeueIrrigationCell();
    if (!entry) return { complete: true, changed, processed };
    processed += 1;
    if (entry.amount === 0) {
      changed = enqueueIrrigationCell(entry.x, entry.y, 0) || changed;
      continue;
    }
    const branches = irrigationBranches(entry.x, entry.y);
    if (branches.length === 1) {
      const branch = branches[0];
      let amount = (entry.amount - 1) & 0xff;
      const tile = tileWords(mapCell(branch.x, branch.y)).base & 0x07ff;
      if (tile >= 0x78 && tile < 0x7a) amount = 0x40;
      if (amount !== 0) {
        changed = enqueueIrrigationCell(branch.x, branch.y, amount) || changed;
      }
    } else if (branches.length > 1) {
      const share = Math.floor(entry.amount / branches.length);
      for (const branch of branches) {
        changed = enqueueIrrigationCell(branch.x, branch.y, share) || changed;
      }
    } else {
      const next = dequeueIrrigationCell();
      if (next) {
        // The original 16-bit routine really adds the second frontier's
        // amount twice after saturating its first sum (148c:11ee..1210).
        const combined =
          (Math.min(0xff, next.amount + entry.amount) + next.amount) & 0xff;
        changed = enqueueIrrigationCell(next.x, next.y, combined) || changed;
      }
    }
  }
  return { complete: false, changed, processed };
}

function advanceIrrigationTick() {
  if (!farmStateBytes || !saveData) return false;
  let changed = false;
  if (!irrigationRuntime.busy) changed = beginIrrigationPass();
  else {
    // 148c:0850 changes DS:2402 only when continuing an already-busy
    // frontier. The saved word stays three even after the pass completes;
    // selecting a numeric Speed sets it back to two.
    stateView(farmStateBytes).setUint16(
      saveData.format.secondaryActorControlOffset ?? 0x21720,
      3,
      true,
    );
  }
  const result = advanceIrrigationFrontier(4);
  changed = result.changed || changed;
  if (result.complete) {
    if (irrigationRuntime.phase !== 0) refreshFieldIrrigationCounters();
    irrigationRuntime.busy = false;
    irrigationRuntime.head = 0;
    irrigationRuntime.tail = 0;
    irrigationRuntime.queue.fill(null);
  }
  return changed;
}

function advanceIrrigationTimer(now = Date.now()) {
  if (!farmStateBytes || !saveData) return false;
  const tick = biosClockTick(now);
  const threshold = stateView(farmStateBytes).getUint16(
    saveData.format.secondaryActorControlOffset ?? 0x21720,
    true,
  );
  if (((tick - irrigationLastTick) & 0xffff) < threshold) return false;
  const changed = advanceIrrigationTick();
  irrigationLastTick = tick;
  return changed;
}

function fieldCurrentValue(record) {
  if (record[2] === 0) return 0;
  const commodity = itemDefinitionForKeyAndId("commodity", 0x80 + record[14]);
  return commodity ? harvestValueAtPrice(record, commodity.price) : 0;
}

function seekFieldScheduleScrollbar(pointerX) {
  // 3a77:0157 converts the 160-pixel track to a month with a two-pixel
  // divisor and then clamps the otherwise-wide tail to month 57.
  const month = Math.max(0, Math.min(57, Math.floor((pointerX - 248) / 2)));
  fieldScheduleWeek = month * 4;
}

function drawFieldStatusWindow() {
  const field =
    selectedFieldSlot === null ? null : fieldRecord(selectedFieldSlot);
  if (!field || (field[7] & 1) === 0) {
    removeGameWindow("field-status");
    selectedFieldSlot = null;
    return;
  }

  const windowX = 160;
  const windowY = 80;
  drawTitleBar(windowX, windowY, 336, "SCHEDULE");
  context.drawImage(images.fieldStatus, windowX, windowY + 16);

  const cropSlot = field[14];
  drawFieldCropIcon(cropSlot, windowX + 32, windowY + 24);

  // These IDs come directly from the Field Schedule globals at
  // 2be7:08f2. The top pair are ordinary map tiles; the lower four are
  // the exact masked fertilizer/pesticide/herbicide/fungicide artwork.
  drawMapTile(0x01b8, windowX + 24, windowY + 80);
  drawMapTile(0x00c6, windowX + 40, windowY + 80);
  drawMaskedMapTile(0x0393, windowX + 24, windowY + 96);
  drawMaskedMapTile(0x0392, windowX + 40, windowY + 96);
  drawMaskedMapTile(0x0391, windowX + 24, windowY + 112);
  drawMaskedMapTile(0x0390, windowX + 40, windowY + 112);

  for (let crop = 0; crop < 16; crop += 1) {
    drawCropCatalogIcon(
      crop,
      windowX + 104 + (crop & 7) * 16,
      windowY + 24 + (crop >> 3) * 16,
    );
  }
  const chosenCrop =
    fieldScheduleSelection >= 0 && fieldScheduleSelection < 16
      ? fieldScheduleSelection
      : cropSlot;
  drawFieldCropIcon(chosenCrop, windowX + 272, windowY + 24);

  context.strokeStyle = "#fff304";
  if (fieldScheduleSelection >= 0 && fieldScheduleSelection < 16) {
    context.strokeRect(
      windowX + 104 + (fieldScheduleSelection & 7) * 16 + 0.5,
      windowY + 24 + (fieldScheduleSelection >> 3) * 16 + 0.5,
      15,
      15,
    );
  } else if (fieldScheduleSelection >= 20 && fieldScheduleSelection <= 25) {
    const actionIndex = fieldScheduleSelection - 20;
    context.strokeRect(
      windowX + 24 + (actionIndex & 1) * 16 + 0.5,
      windowY + 80 + (actionIndex >> 1) * 16 + 0.5,
      15,
      15,
    );
  }

  for (let visibleWeek = 0; visibleWeek < 12; visibleWeek += 1) {
    drawMapTile(
      fieldScheduleTile(selectedFieldSlot, fieldScheduleWeek + visibleWeek),
      windowX + 72 + visibleWeek * 16,
      windowY + 88,
    );
  }

  const visibleMonth = Math.floor(fieldScheduleWeek / 4);
  for (let column = 0; column < 3; column += 1) {
    const absoluteMonth = visibleMonth + column;
    const label = months[((absoluteMonth % 12) + 12) % 12];
    // 3a77:0472..04b7 advances the destination by exactly 0x40 for each
    // of three month strings; their first glyph is not centered again.
    drawText(label, windowX + 96 + column * 64, windowY + 66);
  }

  // 3a77:0d68 paints ten native scrollbar-track tiles and positions the
  // 0xc2 thumb in one of ten 16-pixel bins across the 60-month horizon.
  for (let cell = 0; cell < 10; cell += 1) {
    drawMapTile(0x0009, windowX + 88 + cell * 16, windowY + 104);
  }
  const scrollbarMonth = Math.max(0, Math.min(57, visibleMonth));
  drawMapTile(
    0x00c2,
    windowX + 88 + Math.floor((scrollbarMonth * 10) / 60) * 16,
    windowY + 104,
  );

  // The DOS painter marks the live week with three adjacent vertical
  // color-1 runs (3a77:023c..02a4), rather than a rectangle around a tile.
  const currentWeek = state.month * 4 + state.week;
  if (visibleMonth <= state.month && state.month < visibleMonth + 3) {
    const markerX = windowX + 78 + (currentWeek - fieldScheduleWeek) * 16;
    context.fillStyle = "#fff304";
    context.fillRect(markerX, windowY + 88, 3, 16);
  }

  const seasonNames = ["Winter", "Spring", "Summer", "Harvest"];
  // The native arrow sweep retains the farm's current season while the
  // schedule viewport moves through future years (for example Oct 1997 is
  // still headed "Summer 1997" when the farm date is Jul 1993).
  const currentSeasonMonth = ((state.month % 12) + 12) % 12;
  const season = seasonNames[Math.min(3, Math.floor(currentSeasonMonth / 3))];
  const visibleYear =
    state.year + Math.floor(visibleMonth / 12) - Math.floor(state.month / 12);
  drawText(`${season} ${visibleYear}`, windowX + 104, windowY + 124);

  drawText(`$${fieldCurrentValue(field)}`, windowX + 120, windowY + 148);

  drawFieldGauge(Math.floor(field[22] / 52), windowX + 24, windowY + 192);
  drawFieldGauge(Math.floor(field[20] / 52), windowX + 80, windowY + 192);
  drawFieldGauge(Math.floor(field[21] / 52), windowX + 136, windowY + 192);
  drawFieldGauge(fieldWaterGauge(field), windowX + 216, windowY + 192);
  drawFieldGauge(10 + Math.floor(field[28] / 52), windowX + 272, windowY + 192);

  // Crop-quality emblems are four adjacent 16x16 EGA tiles. The original
  // maps the saved quality class to emblem IDs 24..27.
  const qualityWord = (fieldRecordView(field).getUint16(18, true) - 1) & 0xffff;
  const qualityClass = (qualityWord & 0xff) >> 6;
  drawFieldCropIcon(24 + qualityClass, windowX + 272, windowY + 144);

  // Window-manager child controls add this lower/right gray bevel over
  // the three labels embedded in FDSTATUS. It is deliberately asymmetric.
  context.fillStyle = "#828282";
  for (const buttonY of [79, 95, 119]) {
    context.fillRect(windowX + 318, windowY + buttonY, 1, 1);
    context.fillRect(windowX + 317, windowY + buttonY + 1, 1, 11);
    context.fillRect(windowX + 275, windowY + buttonY + 11, 42, 1);
    context.fillRect(windowX + 274, windowY + buttonY + 12, 1, 1);
  }
}

function dusterChemicalUnitCost(chemicalId) {
  const definition = itemDefinitionForKeyAndId("chemical", chemicalId);
  return definition ? Math.floor(definition.price / 10) : 0;
}

function selectedDusterRecord() {
  if (selectedMachineSlot === null) return null;
  const record = machineRecord(selectedMachineSlot);
  if (
    !record ||
    stateView(record).getUint16(0, true) !== 8 ||
    (stateView(record).getUint16(2, true) & 0x20) === 0
  )
    return null;
  return record;
}

function drawAirplaneWindow() {
  const record = selectedDusterRecord();
  if (!record) {
    removeGameWindow("airplane");
    selectedMachineSlot = null;
    return;
  }
  const view = stateView(record);
  const windowX = 193;
  const windowY = 161;
  drawTitleBar(windowX, windowY, 256, "AIRPLANE");
  context.drawImage(weatherAirplaneWindow(), windowX, windowY + 16);

  // ovl05:0000 uses the same 48x24 field-gauge atlas as the Schedule
  // window. Fuel and spray rise through tiles 0x212..0x216; damage runs
  // through that range in reverse.
  drawFieldGauge(
    10 + Math.floor(view.getUint16(20, true) / 52),
    windowX + 104,
    windowY + 32,
  );
  drawFieldGauge(
    10 + Math.floor(view.getUint16(32, true) / 52),
    windowX + 104,
    windowY + 80,
  );
  drawFieldGauge(
    14 - Math.floor(record[17] / 52),
    windowX + 104,
    windowY + 128,
  );

  const fuelCost = 255 - view.getUint16(20, true);
  const sprayCost =
    (255 - view.getUint16(32, true)) *
    dusterChemicalUnitCost(selectedDusterChemical);
  const repairCost = record[17] * 10;
  drawText(String(fuelCost), windowX + 24, windowY + 60);
  drawText(String(sprayCost), windowX + 24, windowY + 115);
  drawText(String(repairCost), windowX + 24, windowY + 170);
}

function drawMapCell(cell, x, y, width = 16, height = 16) {
  const words = tileWords(cell);
  drawMapTile(animatedMapTileIndex(words.base & 0x07ff), x, y, width, height);
  if ((words.base & 0x0800) === 0) return;
  const overlayIndex = animatedMaskedTileIndex(words.overlay & 0x07ff) - 0x350;
  const columns = Math.floor(images.maskedTiles.width / 16);
  const rows = Math.floor(images.maskedTiles.height / 16);
  if (overlayIndex < 0 || overlayIndex >= columns * rows) return;
  context.drawImage(
    weatherMaskedTileSheet(),
    (overlayIndex % columns) * 16,
    Math.floor(overlayIndex / columns) * 16,
    16,
    16,
    x,
    y,
    width,
    height,
  );
}

function drawDecodedViewport() {
  for (let screenY = 0; screenY < 23; screenY += 1) {
    for (let screenX = -1; screenX < 33; screenX += 1) {
      const x = camera.x + screenX;
      const y = Math.min(95, camera.y + screenY);
      drawMapCell(mapCell(x, y), 80 + screenX * 16, 80 + screenY * 16);
    }
  }
}

function drawCropDusterFlight() {
  if (!dusterFlight) return;
  const flight = dusterFlight;
  const displayDirection = (flight.direction + flight.turbulencePhase) & 7;
  const frameX = displayDirection * 33;
  // The native client anchors the airplane itself to the flight position.
  // Altitude displaces only its ground shadow southwest: the two 0x9740
  // sprite calls land at (320,264) and (300,284) in the launch oracle.
  const planeX = 80 + (flight.x - camera.x) * 16 - 16;
  const planeY = 80 + (flight.y - camera.y) * 16 - 8;
  if (flight.spraying) {
    const dustX = [0, -24, -24, -24, 0, 24, 24, 24][displayDirection];
    const dustY = [24, 0, -24, -24, -24, 0, 24, 24][displayDirection];
    context.drawImage(
      images.cropDustSprite,
      (flight.sprayAnimation & 1) * 33,
      0,
      32,
      32,
      planeX + dustX,
      planeY + dustY,
      32,
      32,
    );
  }
  context.drawImage(
    images.airplaneShadow,
    frameX,
    0,
    32,
    32,
    planeX - flight.altitude * 2,
    planeY + flight.altitude * 2,
    32,
    32,
  );
  context.drawImage(
    images.airplaneSprite,
    frameX,
    0,
    32,
    32,
    planeX,
    planeY,
    32,
    32,
  );
}

function drawTornadoEvent() {
  if (!tornadoEvent?.active) return;
  context.drawImage(
    images.tornadoSprite,
    tornadoEvent.frame * 49,
    0,
    48,
    48,
    80 + (tornadoEvent.x - camera.x) * 16,
    80 + (tornadoEvent.y - camera.y) * 16,
    48,
    48,
  );
}

function drawLocustEvent() {
  if (!locustEvent?.active || locustEvent.startedTick === null) return;
  context.drawImage(
    images.locustSprite,
    locustEvent.frame * 65,
    0,
    64,
    40,
    80 + (locustEvent.x - camera.x) * 16,
    80 + (locustEvent.y - camera.y) * 16,
    64,
    40,
  );
}

function overviewHasLiveTileChanges() {
  if (!farmStateBytes || !authoredWindbreakBytes) return true;
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const current = mapCellFromBytes(farmStateBytes, x, y);
      const authored = mapCellFromBytes(authoredWindbreakBytes, x, y);
      if (!current || !authored) return true;
      if (
        current[0] !== authored[0] ||
        current[1] !== authored[1] ||
        current[2] !== authored[2] ||
        current[3] !== authored[3]
      )
        return true;
    }
  }
  return false;
}

function setOverviewPixel(pixels, indexes, x, y, paletteIndex) {
  if (x < 0 || x >= 192 || y < 0 || y >= 192) return;
  const position = y * 192 + x;
  const color = farMapPaletteColor(paletteIndex);
  const offset = position * 4;
  indexes[position] = paletteIndex & 15;
  pixels.data[offset] = color[0];
  pixels.data[offset + 1] = color[1];
  pixels.data[offset + 2] = color[2];
  pixels.data[offset + 3] = 255;
}

function xorOverviewPixel(pixels, indexes, x, y) {
  if (x < 0 || x >= 192 || y < 0 || y >= 192) return;
  const position = y * 192 + x;
  setOverviewPixel(pixels, indexes, x, y, indexes[position] ^ 15);
}

function drawOverviewLandmarks(pixels, indexes) {
  if (!farmStateBytes || !saveData) return;
  const format = saveData.format;
  const view = stateView(farmStateBytes);

  const townX = view.getUint16(format.townCenterXOffset, true) * 16;
  const townY = view.getUint16(format.townCenterYOffset, true) * 16;
  if (townX >= 0 && townX < 192 && townY >= 0 && townY < 192) {
    for (let x = 9; x <= 14; x += 1)
      setOverviewPixel(pixels, indexes, townX + x, townY + 8, 0);
    for (let y = 9; y <= 14; y += 1) {
      setOverviewPixel(pixels, indexes, townX + 11, townY + y, 0);
      setOverviewPixel(pixels, indexes, townX + 12, townY + y, 0);
    }
  }

  const homesteadX = view.getUint16(format.startupCoordinateXOffset, true) * 2;
  const homesteadY = view.getUint16(format.startupCoordinateYOffset, true) * 2;
  for (let y = 0; y < overviewHomesteadGlyph.length; y += 1) {
    for (let x = 0; x < overviewHomesteadGlyph[y].length; x += 1) {
      const key = overviewHomesteadGlyph[y][x];
      if (key !== ".")
        setOverviewPixel(
          pixels,
          indexes,
          homesteadX + x,
          homesteadY + y,
          Number.parseInt(key, 16),
        );
    }
  }
}

function drawOverviewFrame(pixels, indexes) {
  const left = Math.max(0, (camera.x - 1) * 2);
  const top = Math.max(0, camera.y * 2);
  const right = left + 67;
  const bottom = top + 45;

  // The native two-pixel viewport outline has driver-specific endpoint
  // omissions, so it is an asymmetric mask rather than two canvas strokes.
  const frameMask = new Uint8Array(192 * 192);
  const markFrame = (x, y) => {
    if (x >= 0 && x < 192 && y >= 0 && y < 192) frameMask[y * 192 + x] = 1;
  };
  for (let x = left + 1; x <= right; x += 1) {
    markFrame(x, top);
    markFrame(x, bottom);
  }
  for (let y = top + 1; y < bottom; y += 1) {
    markFrame(left, y);
    markFrame(right, y);
  }
  markFrame(right, top);
  markFrame(right, bottom);
  for (let x = left + 2; x <= right - 3; x += 1) markFrame(x, top + 1);
  for (let x = left + 1; x <= right - 3; x += 1) markFrame(x, bottom - 1);
  for (let y = top + 2; y <= bottom - 2; y += 1) markFrame(left + 1, y);
  for (let y = top + 1; y <= bottom - 2; y += 1) markFrame(right - 1, y);
  for (let position = 0; position < frameMask.length; position += 1) {
    if (frameMask[position] !== 0) {
      xorOverviewPixel(
        pixels,
        indexes,
        position % 192,
        Math.floor(position / 192),
      );
    }
  }
}

function drawOverviewAnnotations(pixels, indexes) {
  drawOverviewLandmarks(pixels, indexes);
  drawOverviewFrame(pixels, indexes);
}

function drawDecodedOverview() {
  if (
    !farmStateBytes ||
    typeof context.getImageData !== "function" ||
    typeof context.putImageData !== "function"
  )
    return;
  // The captured authored frame is already exact only while its palette is
  // still active. DOS palette writes recolor an otherwise unchanged map.
  if (
    markerIndex !== null &&
    !cameraMoved() &&
    !overviewHasLiveTileChanges() &&
    !weatherPaletteDiffersFromCapturedScenario()
  )
    return;

  const pixels = readMapWindowPixels(152, 80, 192, 192);
  if (!pixels?.data) return;
  const indexes = new Uint8Array(192 * 192);

  for (let y = 0; y < 96; y += 1) {
    for (let x = 0; x < 96; x += 1) {
      const pattern = farMapPatternForCell(farmStateBytes, x, y);
      for (let pixel = 0; pixel < 4; pixel += 1) {
        const pixelX = x * 2 + (pixel & 1);
        const pixelY = y * 2 + (pixel >> 1);
        setOverviewPixel(pixels, indexes, pixelX, pixelY, pattern[pixel]);
      }
    }
  }
  drawOverviewAnnotations(pixels, indexes);
  writeMapWindowPixels(pixels, 152, 80);
}

function paletteIndexForCanvasPixel(red, green, blue) {
  let match = -1;
  // Ascending traversal deliberately retains the later duplicate. In the
  // normal game palette, the visually identical brown indices 7 and 11 are
  // authored terrain at index 11 in the cursor-outline oracle.
  for (let index = 0; index < 16; index += 1) {
    const color = farMapPaletteColor(index);
    if (color[0] === red && color[1] === green && color[2] === blue)
      match = index;
  }
  return match;
}

function indexedSheetPixel(name, x, y) {
  const sheet = mapPaletteIndexSheets.get(name);
  if (!sheet || x < 0 || y < 0 || x >= sheet.width || y >= sheet.height)
    return -1;
  const index = sheet.indexes[y * sheet.width + x];
  return index <= 15 ? index : -1;
}

function indexedBaseMapTilePixel(tileIndex, pixelX, pixelY) {
  const eventMode = townEventMode();
  if (
    eventMode >= 1 &&
    eventMode <= 2 &&
    tileIndex >= townEventTileBase &&
    tileIndex < townEventTileBase + 35
  ) {
    const eventTile = tileIndex - townEventTileBase + eventMode * 35;
    return indexedSheetPixel(
      "townEventTileIndexes",
      (eventTile % 20) * 16 + pixelX,
      Math.floor(eventTile / 20) * 16 + pixelY,
    );
  }
  let cropSlot = -1;
  let cropTile = -1;
  if (tileIndex >= 688 && tileIndex < 688 + 16 * 8) {
    cropSlot = Math.floor((tileIndex - 688) / 8);
    cropTile = (tileIndex - 688) % 8;
  } else if (tileIndex >= 539 && tileIndex < 539 + 16 * 4) {
    cropSlot = Math.floor((tileIndex - 539) / 4);
    cropTile = 36 + ((tileIndex - 539) % 4);
  }
  if (cropSlot >= 0) {
    const cropName = cropSlotName(cropSlot);
    if (cropName) {
      const index = indexedSheetPixel(
        `crop-${cropName}-indexes`,
        (cropTile % 7) * 16 + pixelX,
        Math.floor(cropTile / 7) * 16 + pixelY,
      );
      if (index >= 0) return index;
    }
  }
  const columns = Math.floor(images.tileSheet.width / 16);
  const rows = Math.floor(images.tileSheet.height / 16);
  const bounded = Math.max(0, Math.min(columns * rows - 1, tileIndex));
  return indexedSheetPixel(
    "tileSheetIndexes",
    (bounded % columns) * 16 + pixelX,
    Math.floor(bounded / columns) * 16 + pixelY,
  );
}
