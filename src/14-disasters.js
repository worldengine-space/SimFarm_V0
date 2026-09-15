// Tile animation, weather disasters, event state, and town development.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function animatedMaskedTileIndex(tileIndex) {
  if (mapTileAnimationPhase === 0) return tileIndex;
  if (tileIndex === 0x40c) return 0x40d;
  if (tileIndex === 0x40d) return 0x40c;
  return tileIndex;
}

const floodedTerrainTiles = [
  0x37, 0x33, 0x2f, 0x31, 0x2b, 0x39, 0x2d, 0x41, 0x27, 0x35, 0x3b, 0x43, 0x29,
  0x3d, 0x3f, -1,
];

function droughtProtectedTile(tile) {
  // Runtime tile-table ranges recovered from both case-2 passes: irrigation
  // valves 0x78..79 and the 0xac..ad dirt-road tail remain intact.
  return (tile >= 0x78 && tile < 0x7a) || (tile >= 0xac && tile < 0xae);
}

function writeMapBaseWord(cell, word) {
  cell[0] = word & 0xff;
  cell[1] = (word >> 8) & 0xff;
}

function droughtUnflaggedNeighborCount(x, y) {
  let count = 0;
  for (let neighborX = x - 1; neighborX <= x + 1; neighborX += 1) {
    for (let neighborY = y - 1; neighborY <= y + 1; neighborY += 1) {
      // 1000:8054 clamps each coordinate independently. Boundary cells are
      // consequently sampled more than once, just as in the DOS routine.
      const clampedX = Math.max(0, Math.min(95, neighborX));
      const clampedY = Math.max(0, Math.min(95, neighborY));
      if ((tileWords(mapCell(clampedX, clampedY)).base & 0x3000) === 0)
        count += 1;
    }
  }
  return count;
}

function floodedNeighborMask(x, y) {
  let mask = 0x0f;
  if (y === 0 || (tileWords(mapCell(x, y - 1)).base & 0x2000) !== 0)
    mask &= 0x07;
  if (x === 95 || (tileWords(mapCell(x + 1, y)).base & 0x2000) !== 0)
    mask &= 0x0b;
  if (y === 95 || (tileWords(mapCell(x, y + 1)).base & 0x2000) !== 0)
    mask &= 0x0d;
  if (x === 0 || (tileWords(mapCell(x - 1, y)).base & 0x2000) !== 0)
    mask &= 0x0e;
  return mask;
}

function updateFloodedTerrainCell(x, y, mask) {
  const cell = mapCell(x, y);
  const word = tileWords(cell).base;
  const tile = word & 0x07ff;
  const connectedTile = floodedTerrainTiles[mask];
  if (connectedTile < 0) {
    // Mask 15 is the sole -1 table entry. The original converts an eligible
    // isolated center to the dry base-soil member, then marks it flooded.
    if (!droughtProtectedTile(tile))
      writeMapBaseWord(cell, (word & 0xf800) | 0x19);
    cell[1] |= 0x20;
    return;
  }
  if (!droughtProtectedTile(tile)) {
    writeMapBaseWord(
      cell,
      (word & 0xf800) | (connectedTile + (nextSimRandom() & 1)),
    );
  }
  cell[1] |= 0x20;
}

function refreshFloodedTerrainTiles() {
  // Exact 2000:4df8 scan. A lone flooded cell (mask 15) expands through a
  // clamped 3x3 pass; all other masks index the 16-word table recovered from
  // the executable and consume one main-LFSR call per eligible cell.
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      if ((tileWords(mapCell(x, y)).base & 0x2000) === 0) continue;
      const mask = floodedNeighborMask(x, y);
      if (floodedTerrainTiles[mask] >= 0) {
        updateFloodedTerrainCell(x, y, mask);
        continue;
      }
      for (let neighborX = x - 1; neighborX <= x + 1; neighborX += 1) {
        for (let neighborY = y - 1; neighborY <= y + 1; neighborY += 1) {
          const clampedX = Math.max(0, Math.min(95, neighborX));
          const clampedY = Math.max(0, Math.min(95, neighborY));
          updateFloodedTerrainCell(
            clampedX,
            clampedY,
            floodedNeighborMask(clampedX, clampedY),
          );
        }
      }
    }
  }
}

function applyDroughtStartMap() {
  if (!farmStateBytes) return false;
  let changed = false;
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const cell = mapCell(x, y);
      const word = tileWords(cell).base;
      if ((word & 0x3000) === 0 || droughtUnflaggedNeighborCount(x, y) < 3)
        continue;
      if (droughtProtectedTile(word & 0x07ff)) continue;
      writeMapBaseWord(cell, ((word & 0xf800) | 0x1c) & ~0x2000);
      changed = true;
    }
  }
  refreshFloodedTerrainTiles();
  mapDirty = true;
  return changed;
}

function applyDroughtCleanupMap() {
  if (!farmStateBytes) return false;
  let changed = false;
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const cell = mapCell(x, y);
      let word = tileWords(cell).base;
      if ((word & 0x1000) === 0 || (word & 0x2000) !== 0) continue;
      if (!droughtProtectedTile(word & 0x07ff)) word = (word & 0xf800) | 0x27;
      writeMapBaseWord(cell, word | 0x2000);
      changed = true;
    }
  }
  refreshFloodedTerrainTiles();
  mapDirty = true;
  return changed;
}

function startDroughtEvent() {
  if (!droughtEvent?.active || droughtEvent.started) return false;
  droughtEvent.started = true;
  applyDroughtStartMap();
  return true;
}

function requestDroughtEvent() {
  // Dispatcher case 2 raises its active bit before loading EVENTS record 53.
  // The map pass follows the optional blocking dialog, with no sound call.
  applyDisasterMarketEffect(2);
  if (droughtEvent?.active || modalNotice === "drought-warning") return false;
  droughtEvent = { active: true, started: false };
  message = "";
  if (state.options.Messages) modalNotice = "drought-warning";
  else startDroughtEvent();
  return true;
}

function endDroughtEvent() {
  if (!droughtEvent?.active) return false;
  droughtEvent.active = false;
  applyDroughtCleanupMap();
  message = "";
  if (state.options.Messages) modalNotice = "drought-ended";
  return true;
}

function updateDroughtWeatherLifecycle(
  accumulator = state.weatherMoistureAccumulator,
) {
  let changed = false;
  if (accumulator < 0 && !state.disastersDisabled)
    changed = requestDroughtEvent() || changed;
  if (droughtEvent?.active && accumulator > 2)
    changed = endDroughtEvent() || changed;
  return changed;
}

function floodSpreadProtectedTile(tile) {
  // The propagation loop has a narrower exclusion than the start/end map
  // passes: only the 0xac..0xad dirt-road tail refuses the 0x2000 flag.
  return tile >= 0xac && tile < 0xae;
}

function detachFloodedFieldMachinery(record) {
  const view = fieldRecordView(record);
  for (const offset of [42, 44, 46]) {
    const slot = view.getUint16(offset, true);
    if (slot === 0) continue;
    const machine = machineRecord(slot);
    if (machine) {
      const machineView = stateView(machine);
      machineView.setUint16(2, machineView.getUint16(2, true) & ~0x1001, true);
      machineView.setUint16(44, 0, true);
      machineView.setUint16(46, 0, true);
    }
    view.setUint16(offset, 0, true);
  }
}

function removeFloodedField(field) {
  const record = field?.record;
  if (!record || (record[7] & 1) === 0 || record[2] === 0 || record[2] === 4)
    return false;
  return removeFieldRecord(field, true);
}

function destroyFloodedWaterStructure(structure) {
  if (!structure || (structure.id !== 0x46 && structure.id !== 0x47))
    return false;
  const { record, definition } = structure;
  for (let x = record[4]; x < record[4] + definition.width; x += 1) {
    for (let y = record[5]; y < record[5] + definition.height; y += 1) {
      const cell = mapCell(x, y);
      if (!cell) continue;
      const word = tileWords(cell).base;
      const terrainTile = 0x0f + state.soilMoisture + (cell[4] >> 2);
      writeMapBaseWord(cell, ((word & 0xf800) | terrainTile) & ~0x0800);
    }
  }
  const view = stateView(record);
  view.setUint16(2, view.getUint16(2, true) & ~0x20, true);
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.structureCountOffset,
    Math.max(
      0,
      saveView.getUint16(saveData.format.structureCountOffset, true) - 1,
    ),
    true,
  );
  const definitionView = stateView(definition.record);
  definitionView.setUint16(
    4,
    Math.max(0, definitionView.getUint16(4, true) - 1),
    true,
  );
  if (structure.id === 0x46) resetIrrigationRuntime();
  return true;
}

function applyFloodSpreadAt(x, y) {
  const field = fieldAtPosition({ x, y });
  if (
    field &&
    field.record[2] !== 0 &&
    field.record[2] !== 4 &&
    removeFloodedField(field)
  )
    play("explode");
  const structure = structureAtPosition({ x, y });
  if (structure && (structure.id === 0x46 || structure.id === 0x47)) {
    if (destroyFloodedWaterStructure(structure)) play("explode");
  }
  const cell = mapCell(x, y);
  const word = tileWords(cell).base;
  if (!floodSpreadProtectedTile(word & 0x07ff))
    writeMapBaseWord(cell, word | 0x2000);
}

function startFloodEvent() {
  if (!floodEvent?.active || floodEvent.started) return false;
  floodEvent.started = true;
  floodEvent.scanX = 0;
  floodEvent.scanY = 0;
  floodEvent.phase = 4;
  floodEvent.propagating = true;
  mapDirty = true;
  return true;
}

function requestFloodEvent() {
  // Dispatcher case 3 resets the signed duration byte and raises bit 0x04
  // before playing FLOOD.VOC and optionally showing EVENTS record 54.
  applyDisasterMarketEffect(3);
  if (floodEvent?.active || modalNotice === "flood-warning") return false;
  floodDuration = 0;
  floodEvent = {
    active: true,
    started: false,
    scanX: 0,
    scanY: 0,
    phase: 0,
    propagating: false,
  };
  message = "";
  play("flood");
  if (state.options.Messages) modalNotice = "flood-warning";
  else startFloodEvent();
  return true;
}

function applyFloodCleanupMap() {
  if (!farmStateBytes) return false;
  let changed = false;
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const cell = mapCell(x, y);
      let word = tileWords(cell).base;
      if ((word & 0x1000) === 0 || (word & 0x2000) === 0) continue;
      if (droughtProtectedTile(word & 0x07ff)) word &= ~0x2000;
      else word = 0x001c;
      writeMapBaseWord(cell, word);
      changed = true;
    }
  }
  refreshFloodedTerrainTiles();
  mapDirty = true;
  return changed;
}

function endFloodEvent() {
  if (!floodEvent?.active) return false;
  floodEvent.active = false;
  applyFloodCleanupMap();
  floodDuration = -8;
  floodEvent.phase = 0;
  message = "";
  if (state.options.Messages) modalNotice = "flood-ended";
  return true;
}

function advanceFloodEvent() {
  if (!floodEvent?.active || !floodEvent.started) return false;
  // The common event updater performs its signed >8 lifetime check before
  // the 64-cell propagation slice.
  if (floodDuration > 8) return endFloodEvent();
  for (
    let iteration = 0;
    iteration < 64 && floodEvent.propagating;
    iteration += 1
  ) {
    const center = mapCell(floodEvent.scanX, floodEvent.scanY);
    if ((tileWords(center).base & 0x1000) !== 0) {
      for (let x = floodEvent.scanX - 2; x <= floodEvent.scanX; x += 1) {
        for (let y = floodEvent.scanY - 1; y <= floodEvent.scanY + 1; y += 1) {
          applyFloodSpreadAt(
            Math.max(0, Math.min(95, x)),
            Math.max(0, Math.min(95, y)),
          );
        }
      }
    }
    floodEvent.scanY += 1;
    if (floodEvent.scanY > 93) {
      floodEvent.scanY = 0;
      floodEvent.scanX += 1;
      if (floodEvent.scanX > 93) floodEvent.propagating = false;
    }
  }
  refreshFloodedTerrainTiles();
  mapDirty = true;
  return true;
}

function incrementFloodWeekAge() {
  if (!floodEvent?.active) return false;
  floodDuration = (floodDuration + 1) & 0xff;
  if ((floodDuration & 0x80) !== 0) floodDuration -= 0x100;
  return true;
}

function updateFloodWeatherLifecycle(
  accumulator = state.weatherMoistureAccumulator,
) {
  let changed = false;
  if (accumulator > 13 && floodDuration === 0 && !state.disastersDisabled) {
    changed = requestFloodEvent() || changed;
  }
  if (floodEvent?.active && accumulator < 10 && floodDuration > 3) {
    changed = endFloodEvent() || changed;
  }
  return changed;
}

function updateWeatherDisasterLifecycle(
  accumulator = state.weatherMoistureAccumulator,
) {
  incrementFloodWeekAge();
  let changed = updateFloodWeatherLifecycle(accumulator);
  if (accumulator < 0 && !state.disastersDisabled)
    changed = requestDroughtEvent() || changed;
  if (droughtEvent?.active && accumulator > 2)
    changed = endDroughtEvent() || changed;
  return changed;
}

function frostTemperatureAtStart() {
  return Number.isFinite(state.currentTemperature)
    ? Math.trunc(state.currentTemperature)
    : currentWeatherTemperature();
}

function startFrostEvent() {
  if (!frostEvent?.active || frostEvent.started) return false;
  frostEvent.started = true;
  const temperature = frostTemperatureAtStart();
  frostCountdown = temperature > 28 ? ((temperature & 0xff) - 28) & 0xff : 0;

  // Dispatcher case 5 calls 1957:0056 with 0xff for every active field
  // whose CRP definition is loaded. That routine adds to field word 18 and
  // saturates at 0xffff rather than wrapping.
  let affectedFields = 0;
  for (const { record } of activeFieldRecords()) {
    if (!cropSimulationDefinitionForSlot(record[14])) continue;
    const view = fieldRecordView(record);
    view.setUint16(18, Math.min(0xffff, view.getUint16(18, true) + 0xff), true);
    affectedFields += 1;
  }
  frostEvent.affectedFields = affectedFields;
  frostEvent.lastTemperaturePenalty = 0;
  mapDirty = true;
  return true;
}

function requestFrostEvent() {
  // Native case 5 refuses a duplicate, clears an active Locust event, then
  // raises bit 0x10 before optionally showing EVENTS.DAT record 49.
  applyDisasterMarketEffect(5);
  if (frostEvent?.active || modalNotice === "frost-warning") return false;
  if (locustEvent?.active) locustEvent.active = false;
  frostCountdown = 0;
  frostEvent = {
    active: true,
    started: false,
    affectedFields: 0,
    lastTemperaturePenalty: 0,
  };
  message = "";
  // Case 5 shares WIND.VOC with Windstorm; it has no separate Frost sample.
  play("windstorm");
  if (state.options.Messages) modalNotice = "frost-warning";
  else startFrostEvent();
  return true;
}

function endFrostEvent() {
  if (!frostEvent?.active) return false;
  frostEvent.active = false;
  frostEvent.lastTemperaturePenalty = 0;
  message = "";
  return true;
}

function advanceFrostEvent(currentTemperature = frostTemperatureAtStart()) {
  if (!frostEvent?.active || !frostEvent.started) return false;
  // 1c78:033e runs on the odd-day field-maintenance pass. A countdown of
  // two or more is subtracted from the signed current temperature and then
  // reduced by two. Values below two end case 5 silently on that pass.
  if (frostCountdown < 2) {
    frostCountdown = 0;
    endFrostEvent();
    return false;
  }
  frostEvent.lastTemperaturePenalty = frostCountdown;
  state.currentTemperature = Math.trunc(currentTemperature) - frostCountdown;
  frostCountdown = (frostCountdown - 2) & 0xff;
  return true;
}

function signedByte(value) {
  const byte = value & 0xff;
  return (byte & 0x80) !== 0 ? byte - 0x100 : byte;
}

function signedWord(value) {
  const word = value & 0xffff;
  return (word & 0x8000) !== 0 ? word - 0x10000 : word;
}

function startWindstormEvent() {
  if (!windstormEvent?.active || windstormEvent.started) return false;
  windstormEvent.started = true;
  windstormEvent.startedTick = biosClockTick();
  const wind = signedByte(state.currentWindSpeed ?? 0);
  // Case 6 only writes the boost byte below 30; an existing boost survives
  // the other branch and continues to decay in the weekly wind routine.
  if (wind < 30) state.windBoost = (40 - wind) & 0xff;
  return true;
}

function requestWindstormEvent() {
  // Case 6 rejects either Windstorm bit 0x08 or Tornado bit 0x01 before it
  // considers Locust cleanup. It then raises 0x08 ahead of record 48.
  applyDisasterMarketEffect(6);
  if (
    windstormEvent?.active ||
    modalNotice === "windstorm-warning" ||
    tornadoEvent?.active ||
    modalNotice === "tornado-warning"
  )
    return false;
  if (locustEvent?.active) locustEvent.active = false;
  windstormEvent = {
    active: true,
    started: false,
    startedTick: null,
    updateCount: 0,
  };
  message = "";
  play("windstorm");
  if (state.options.Messages) modalNotice = "windstorm-warning";
  else startWindstormEvent();
  return true;
}

function endWindstormEvent() {
  if (!windstormEvent?.active) return false;
  windstormEvent.active = false;
  message = "";
  if (state.options.Messages) modalNotice = "windstorm-ended";
  return true;
}

function windbreakTileAt(x, y, bytes = farmStateBytes) {
  if (!bytes || !saveData || x < 0 || x >= 96 || y < 0 || y >= 96) return false;
  const format = saveData.format;
  const offset =
    format.displayCellMapOffset +
    (x * format.mapHeight + y) * format.mapCellSize;
  const tile =
    tileWords(bytes.subarray(offset, offset + format.mapCellSize)).base &
    0x07ff;
  return tile >= 0x83 && tile < 0x93;
}

function rawWindbreakCountForField(record, bytes = farmStateBytes) {
  // 1b98:06d0 scans a two-cell perimeter using the original asymmetric end
  // coordinates and deliberately counts corner cells more than once. The
  // signed-byte clamp helper limits all four endpoints to 0..95.
  const clampEndpoint = (value) => Math.max(0, Math.min(95, signedByte(value)));
  const xStart = clampEndpoint(record[10] - 2);
  const xEnd = clampEndpoint(record[10] - 2 + record[12] + 4);
  const yStart = clampEndpoint(record[11] - 2);
  const yEnd = clampEndpoint(record[11] - 2 + record[13] + 4);
  let count = 0;
  for (let x = xStart; x < xEnd; x += 1) {
    if (windbreakTileAt(x, yStart, bytes)) count += 1;
    if (windbreakTileAt(x, yStart + 1, bytes)) count += 1;
    if (windbreakTileAt(x, yEnd, bytes)) count += 1;
    if (windbreakTileAt(x, yEnd - 1, bytes)) count += 1;
  }
  for (let y = yStart; y < yEnd; y += 1) {
    if (windbreakTileAt(xStart, y, bytes)) count += 1;
    if (windbreakTileAt(xStart + 1, y, bytes)) count += 1;
    if (windbreakTileAt(xEnd, y, bytes)) count += 1;
    if (windbreakTileAt(xEnd - 1, y, bytes)) count += 1;
  }
  return count;
}

function windbreakCountForField(slot, record) {
  const currentCount = rawWindbreakCountForField(record);
  const nativeBaseline = nativeWindbreakScenarioCounts[markerIndex]?.[slot - 1];
  if (nativeBaseline === undefined || !authoredWindbreakBytes)
    return currentCount;
  const format = saveData.format;
  const offset = format.fieldRecordOffset + slot * format.fieldRecordSize;
  const authoredRecord = authoredWindbreakBytes.subarray(
    offset,
    offset + format.fieldRecordSize,
  );
  // Keep the calibration only while this is still the authored field. A
  // deleted/re-created or reshaped field falls back to a direct perimeter
  // count, while placed/bulldozed trees remain an exact signed delta.
  if (
    (authoredRecord[7] & 1) === 0 ||
    authoredRecord[10] !== record[10] ||
    authoredRecord[11] !== record[11] ||
    authoredRecord[12] !== record[12] ||
    authoredRecord[13] !== record[13]
  ) {
    return currentCount;
  }
  const authoredCount = rawWindbreakCountForField(
    authoredRecord,
    authoredWindbreakBytes,
  );
  return Math.max(0, nativeBaseline + currentCount - authoredCount);
}

function advanceWindstormEvent(now = Date.now()) {
  if (!windstormEvent?.active || !windstormEvent.started) return false;
  // ovl10:0bee compares against DS:6aa8, an initialized-zero word with no
  // writer. It never refreshes that timestamp, including after damage.
  // Preserve the strict calendar threshold and its brief wraparound gap.
  if (biosClockTick(now) <= calendarIntervalTicks) return false;
  for (const { slot, record } of activeFieldRecords()) {
    const windbreakCount = windbreakCountForField(slot, record);
    record[57] = windbreakCount & 0xff;
    if (windbreakCount < 8) subtractFieldCondition(record, 29, 6, 1);
  }
  windstormEvent.updateCount += 1;
  return true;
}

function updateWindstormWeatherLifecycle(
  windSpeed = state.currentWindSpeed ?? 0,
) {
  const wind = signedByte(windSpeed);
  let changed = false;
  if (wind >= 35 && !state.disastersDisabled) {
    changed = requestWindstormEvent() || changed;
  }
  if (windstormEvent?.active && wind < 35) {
    changed = endWindstormEvent() || changed;
  }
  return changed;
}

function selectBiasedDisasterField() {
  const fields = activeFieldRecords();
  if (fields.length === 0) return null;
  // 2957:0092 asks the bounded 05fd:00a3 generator for 0..count-1, then
  // changes zero to one before counting active field records. This doubles
  // the first field's chance and leaves the last unreachable when count>1.
  let target = nextSimSmallRandom(fields.length);
  if (target === 0) target = 1;
  return fields[target - 1] ?? null;
}

function breakFirstIrrigationPipe() {
  // Generic event 6 scans the column-major 96x96 base-word array for the
  // first ditch tile (0x57..0x6c), then restores its terrain tile from the
  // cell-state byte while preserving the five high map flags.
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const cell = mapCell(x, y);
      const word = tileWords(cell).base;
      const tile = word & 0x07ff;
      if (tile < 0x57 || tile >= 0x57 + 0x16) continue;
      writeMapBaseWord(cell, (word & 0xf800) | ((cell[4] + 0x0f) & 0x07ff));
      mapDirty = true;
      return true;
    }
  }
  return false;
}

function requestGenericEvent(input, now = Date.now()) {
  // FUN_3da3_0000 treats 0x80 as a force bit: forced records bypass both the
  // Messages option and the per-record 0x3c0 game-tick repeat throttle.
  let record = input;
  const forced = record >= 0x80;
  if (!state.options.Messages && !forced) return false;
  if (forced) record -= 0x80;
  if (record < 0 || record >= 63) return false;
  const tick = biosClockTick(now);
  if (!forced) {
    const elapsed = (tick - genericEventLastTicks[record]) & 0xffff;
    if (elapsed < 0x3c0) return false;
  }
  if (record === 6) breakFirstIrrigationPipe();
  // Native callers are synchronous because the DOS card owns a modal input
  // loop. A browser cannot block the JavaScript stack, so calls later in the
  // same weekly/monthly boundary are retained in request order and revealed
  // one OK at a time.
  if (modalNotice !== null || genericEventRecord !== null) {
    queuedGenericEventRecords.push(record);
  } else {
    genericEventRecord = record;
    modalNotice = "event-card";
  }
  genericEventLastTicks[record] = tick;
  return true;
}

function handleDebugEventScanKey(event) {
  // The bracket scans live inside the root callback's Ctrl branch.  Plain
  // brackets are ordinary characters and may continue into a child/editor.
  if (!debugMode || stage !== "game" || !event.ctrlKey) return null;
  const right = event.code === "BracketRight" || event.key === "]";
  const left = event.code === "BracketLeft" || event.key === "[";
  if (!right && !left) return null;
  if (right) debugEventIndex = Math.min(42, debugEventIndex + 1);
  else debugEventIndex = Math.max(0, debugEventIndex - 1);
  return requestGenericEvent(debugEventIndex);
}

function setQuickMessage(record) {
  const normalized = Number(record) & 0xff;
  if (quickMessageRing[quickMessageRingIndex] === normalized) return false;
  quickMessageRingIndex = (quickMessageRingIndex + 1) % quickMessageRing.length;
  quickMessageRing[quickMessageRingIndex] = normalized;
  quickMessageDirty = true;
  message = originalText?.qmessage?.[normalized] || "";
  return true;
}

function applyGlobalControlShortcut(event) {
  // Main keyboard callback 1d054 reads a BIOS key and then tests shift-flag
  // bit 2.  The recognized physical scans are T (14h), V (2fh), J (24h),
  // and X (2dh).  The retail bundle has no EDITCROP.EEA, so J/X consume the
  // chord after their failed r+b open and have no observable side effect.
  const code =
    event.code ||
    (typeof event.key === "string" && event.key.length === 1
      ? `Key${event.key.toUpperCase()}`
      : "");
  if (code === "KeyT") setQuickMessage(0x2b);
  else if (code === "KeyV") setQuickMessage(0x46);
}

function executeDebugWord(command) {
  // Main keyboard handler 1d054 keeps three case-sensitive hidden words.
  // LLAMA and FUND open the generic 256x192 card with ALLTILES art 0x19
  // and 0x4b; CORN silently credits cash. The arithmetic is the original
  // wrapping 32-bit ADD rather than the capped single-key money helper.
  if (command === "LLAMA") {
    modalNotice = "debug-llama";
    return true;
  }
  if (command === "FUND") {
    state.townReserve = ((state.townReserve ?? 0) + 10000) | 0;
    modalNotice = "debug-fund";
    return true;
  }
  if (command === "CORN") {
    state.funds = (state.funds + 10000) | 0;
    return true;
  }
  return false;
}

function roundDebugFunds(amount, increase) {
  // 0c43:02dc..03a6 uses the runtime's unsigned divide/multiply helpers:
  // add/subtract first, then round down to an exact denomination. Only the
  // two increase keys apply the 9,999,999 ceiling.
  let value = increase
    ? ((state.funds >>> 0) + amount) >>> 0
    : ((state.funds >>> 0) - amount) >>> 0;
  value = (Math.floor(value / amount) * amount) >>> 0;
  if (increase) value = Math.min(9999999, value);
  state.funds = value | 0;
}

function resetDebugFieldStress() {
  // Lowercase c walks active field records, clears the three crop-pressure
  // bytes and their cached status byte, then restores water to the midpoint
  // of the loaded CRP record's two water words.
  for (const { record } of activeFieldRecords()) {
    record[20] = 0;
    record[21] = 0;
    record[22] = 0;
    record[28] = 0;
    const definition = cropSimulationDefinitionForSlot(record[14]);
    if (!definition) continue;
    const lower = definition.waterMin & 0xffff;
    const upper = definition.waterMax & 0xffff;
    fieldRecordView(record).setUint16(
      24,
      (lower + (((upper - lower) & 0xffff) >>> 1)) & 0xffff,
      true,
    );
  }
}

function executeDebugSingleKey(key) {
  // These branches precede the active-window callback in the recovered
  // 1d054 handler. Most mutate globals silently; C invalidates the Balance
  // Sheet and `*` creates or activates the hidden TOWN diagnostic window.
  if (key === "=") roundDebugFunds(1000, true);
  else if (key === "+") roundDebugFunds(10000, true);
  else if (key === "_") roundDebugFunds(10000, false);
  else if (key === "-") roundDebugFunds(1000, false);
  else if (key === "!") {
    state.townReserve = ((state.townReserve ?? 0) + 1000) | 0;
    writeTownBudget((readTownBudget() + 1000) | 0);
  } else if (key === "@") {
    state.townReserve = ((state.townReserve ?? 0) - 1000) | 0;
    writeTownBudget((readTownBudget() - 1000) | 0);
  } else if (key === "#") {
    state.propertyTaxDue = Math.min(
      9999999,
      ((state.propertyTaxDue ?? 0) + 100) >>> 0,
    );
  } else if (key === "$") {
    state.propertyTaxDue = ((state.propertyTaxDue ?? 0) - 100) >>> 0;
  } else if (key === "%") {
    state.taxableSaleIncome = Math.min(
      9999999,
      ((state.taxableSaleIncome ?? 0) + 100) >>> 0,
    );
  } else if (key === "^") {
    state.taxableSaleIncome = Math.max(0, (state.taxableSaleIncome ?? 0) - 100);
  } else if (key === "m") {
    state.month = (state.month + 1) & 0xffff;
  } else if (key === "M") {
    state.month = (state.month - 1) & 0xffff;
  } else if (key === "c") {
    resetDebugFieldStress();
  } else if (key === "C") {
    resetAnnualCashFlowLedgers();
  } else if (key === "*") {
    townDebugVisible = true;
  } else {
    return false;
  }
  return true;
}

function handleDebugCommandKey(key) {
  if (!debugMode || stage !== "game") return false;
  if (key === "Enter") {
    debugCommandBuffer[debugCommandIndex] = "\0";
    let command = "";
    for (const character of debugCommandBuffer) {
      if (character === "\0") break;
      command += character;
    }
    const matched = executeDebugWord(command);
    // The original clears only byte zero after comparing, then resets the
    // wrapping index; old tail bytes remain unreachable behind that NUL.
    debugCommandBuffer[0] = "\0";
    debugCommandIndex = 0;
    return matched;
  }
  if (key.length !== 1 || key.charCodeAt(0) > 0x7f) return false;
  debugCommandBuffer[debugCommandIndex] = key;
  debugCommandIndex = (debugCommandIndex + 1) & 0x0f;
  return false;
}

function startCloseEncounterEvent() {
  if (!closeEncounterEvent?.active || closeEncounterEvent.started) return false;
  const record = fieldRecord(closeEncounterEvent.fieldSlot);
  if (!record || (record[7] & 1) === 0) {
    closeEncounterEvent.active = false;
    return false;
  }
  closeEncounterEvent.started = true;
  const view = fieldRecordView(record);
  view.setUint16(18, Math.min(0xffff, view.getUint16(18, true) + 10), true);

  const originX = record[10];
  const originY = record[11];
  const cropCircle = [
    [4, 3, 0xd2],
    [2, 4, 0xd3],
    [3, 4, 0xd4],
    [4, 4, 0xd5],
    [5, 4, 0xd6],
    [6, 4, 0xd7],
    [4, 5, 0xd8],
  ];
  for (const [dx, dy, tile] of cropCircle) {
    const cell = mapCell(originX + dx, originY + dy);
    if (!cell) continue;
    writeMapBaseWord(cell, (tileWords(cell).base & 0xf800) | tile);
  }
  mapDirty = true;
  return true;
}

function requestCloseEncounterEvent() {
  // Case 7 is reached by uppercase A in the date-gated `eeadebug` keyboard
  // mode, not the visible Disasters menu. It uses the same biased field
  // selector as Locusts, then rejects
  // the selected crop unless CRP flag 0x02 marks it as a grain crop.
  if (closeEncounterEvent?.active || modalNotice === "close-encounter")
    return false;
  const field = selectBiasedDisasterField();
  const definition = field && cropSimulationDefinitionForSlot(field.record[14]);
  if (!field || !definition || (definition.perennialFlags & 2) === 0)
    return false;
  closeEncounterEvent = {
    active: true,
    started: false,
    fieldSlot: field.slot,
  };
  message = "";
  playMusic("alien");
  // Unlike the weather disasters, native case 7 does not consult the
  // Messages byte before showing record 50.
  modalNotice = "close-encounter";
  return true;
}

function advanceCloseEncounterEvent() {
  if (!closeEncounterEvent?.active || !closeEncounterEvent.started)
    return false;
  // The first common event update after the blocking dialog returns invokes
  // cleanup case 7. It clears only bit 0x40; the crop circles remain.
  closeEncounterEvent.active = false;
  return true;
}

function advanceDisasterEvents(now = Date.now()) {
  // ovl10:0bee runs once per root pass, after traffic and before fields.
  // Only locusts/tornadoes have the shared animation clock; the 64-cell
  // flood slice must not inherit a separate machinery/40ms throttle.
  let changed = false;
  if (frostEvent?.active && frostCountdown === 0) changed = endFrostEvent();
  changed = advanceCloseEncounterEvent() || changed;
  changed = advanceWindstormEvent(now) || changed;
  changed = advanceLocustEvent(now) || changed;
  if (modalNotice) return changed;
  changed = advanceTornadoEvent(now) || changed;
  changed = advanceFloodEvent() || changed;
  return changed;
}

function requestToxicityWarning() {
  // Dispatcher case 8 is a one-shot record-51 warning: it raises runtime
  // bit 0x80, ignores the EVENTS-notice option, and has no cleanup case or
  // data mutation. No executable call site reaches it in this release, so
  // this recovered branch intentionally has no automatic gameplay caller.
  if (toxicityWarningShown || modalNotice === "toxicity-warning") return false;
  toxicityWarningShown = true;
  message = "";
  modalNotice = "toxicity-warning";
  return true;
}

function startLocustEvent() {
  if (!locustEvent?.active || locustEvent.startedTick !== null) return false;
  const tick = biosClockTick();
  locustEvent.startedTick = tick;
  locustEvent.lastUpdateTick = tick;
  // Case 4 performs this move only after its blocking warning returns and
  // follows the native AutoGoto byte.
  if (state.options.AutoGoto) {
    camera.x = Math.max(0, Math.min(63, locustEvent.x - 16));
    camera.y = Math.max(0, Math.min(73, locustEvent.y - 11));
  }
  return true;
}

function requestLocustEvent() {
  // Dispatcher case 4 refuses to coexist with Tornado and returns without
  // a warning when there is no active field for its biased selector.
  if (
    tornadoEvent?.active ||
    modalNotice === "tornado-warning" ||
    locustEvent?.active ||
    modalNotice === "locust-warning"
  )
    return false;
  const field = selectBiasedDisasterField();
  if (!field) return false;
  locustEvent = {
    active: true,
    fieldSlot: field.slot,
    fieldX: field.record[10],
    fieldY: field.record[11],
    x: field.record[10],
    y: field.record[11],
    frame: 0,
    startedTick: null,
    lastUpdateTick: null,
  };
  message = "";
  play("locusts");
  // With Messages disabled the native blocking call is skipped and
  // execution falls straight through to the tick/camera initialization.
  if (state.options.Messages) modalNotice = "locust-warning";
  else startLocustEvent();
  return true;
}

function advanceLocustEvent(now = Date.now()) {
  if (!locustEvent?.active || locustEvent.startedTick === null) return false;
  const tick = biosClockTick(now);
  if (
    ((tick - locustEvent.lastUpdateTick) & 0xffff) <=
    disasterEventIntervalTicks
  ) {
    return false;
  }

  locustEvent.frame += 1;
  if (locustEvent.frame > 3) {
    locustEvent.frame = 0;
    locustEvent.x += (nextSimRandom() & 1) === 0 ? -1 : 1;
    locustEvent.y += (nextSimRandom() & 1) === 0 ? -1 : 1;
    // The original clamps to field origin..origin+5 even though the field
    // record carries dimensions; its selected scenario fields are 8x8.
    locustEvent.x = Math.max(
      locustEvent.fieldX,
      Math.min(locustEvent.fieldX + 5, locustEvent.x),
    );
    locustEvent.y = Math.max(
      locustEvent.fieldY,
      Math.min(locustEvent.fieldY + 5, locustEvent.y),
    );
  }
  locustEvent.lastUpdateTick = tick;

  // Case 4 has no crop/map mutation. Its apparent write at 4348:0f18 marks
  // the renderer's dirty-cell grid. Cleanup occurs only after age 0x200.
  if (((tick - locustEvent.startedTick) & 0xffff) > 0x200) {
    locustEvent.active = false;
  }
  return true;
}

function startTornadoEvent() {
  if (tornadoEvent?.active) return false;
  const x = (nextSimRandom() & 0x3f) + 0x10;
  const y = (nextSimRandom() & 0x3f) + 0x10;
  let dx = nextSimRandom() & 1;
  let dy = nextSimRandom() & 1;
  if ((nextSimRandom() & 1) !== 0) dx = -dx;
  if ((nextSimRandom() & 1) !== 0) dy = -dy;
  const tick = biosClockTick();
  tornadoEvent = {
    active: true,
    x,
    y,
    dx,
    dy,
    frame: 0,
    startedTick: tick,
    lastUpdateTick: tick,
  };
  // The native event handler autogotos the new tornado while the main farm
  // viewport is active, centering its world cell in the 33x23-cell view.
  // Native tornado case 1 keys this camera move from AutoGoto.
  if (state.options.AutoGoto) {
    camera.x = Math.max(0, Math.min(63, x - 16));
    camera.y = Math.max(0, Math.min(73, y - 11));
  }
  return true;
}

function requestTornadoEvent() {
  // Native disaster case 1 sets its active bit before showing EVENTS.DAT
  // record 52, then seeds position and direction only after that synchronous
  // warning returns. Unlike the weather cases, this warning is unconditional;
  // the modal therefore consumes no tornado RNG calls.
  if (tornadoEvent?.active || modalNotice === "tornado-warning") return false;
  // Case 1 explicitly invokes case-4 cleanup when a locust swarm is active.
  if (locustEvent?.active) locustEvent.active = false;
  message = "";
  modalNotice = "tornado-warning";
  play("tornado");
  return true;
}

function updateTornadoWeatherLifecycle(windSpeed, now = Date.now()) {
  // 1b98:0661 dispatches tornado case 1 only above 70 mph. Exactly 70 does
  // neither operation. Below 70, the cleanup helper clears an active
  // tornado only after its wrapping game-tick age reaches 0x780.
  if (signedByte(windSpeed) > 70) {
    if (!state.disastersDisabled) return requestTornadoEvent();
    return false;
  }
  if (signedByte(windSpeed) >= 70 || !tornadoEvent?.active) return false;
  const elapsed = (biosClockTick(now) - tornadoEvent.startedTick) & 0xffff;
  if (elapsed < 0x780) return false;
  tornadoEvent.active = false;
  return true;
}

function advanceTornadoEvent(now = Date.now()) {
  if (!tornadoEvent?.active) return false;
  const tick = biosClockTick(now);
  if (
    ((tick - tornadoEvent.lastUpdateTick) & 0xffff) <=
    disasterEventIntervalTicks
  )
    return false;
  tornadoEvent.lastUpdateTick = tick;
  tornadoEvent.frame += 1;
  if (tornadoEvent.frame <= 3) return true;
  tornadoEvent.frame = 0;
  tornadoEvent.x += tornadoEvent.dx;
  tornadoEvent.y += tornadoEvent.dy;
  if (tornadoEvent.y > 0x56) tornadoEvent.dy = -1;
  else if (tornadoEvent.y < 10) tornadoEvent.dy = 1;
  if ((nextSimRandom() & 0x0f) === 6) {
    tornadoEvent.dx = nextSimRandom() & 1;
    tornadoEvent.dy = nextSimRandom() & 1;
    if ((nextSimRandom() & 1) !== 0) tornadoEvent.dx = -tornadoEvent.dx;
    if ((nextSimRandom() & 1) !== 0) tornadoEvent.dy = -tornadoEvent.dy;
  }
  return true;
}

function nextSimSecondaryRandom() {
  // Exact 15fd:00d0 companion generator used by object allocation.
  const lowBit = simSecondaryRandomState & 1;
  simSecondaryRandomState >>>= 1;
  if (lowBit) simSecondaryRandomState ^= 0x3500;
  simSecondaryRandomState &= 0xffff;
  return simSecondaryRandomState;
}

function advanceAutoScroll() {
  // 19ab:09f0 moves the farm viewport two cells per idle callback whenever
  // the DOS mouse rests on an outer screen edge. The right/bottom tests
  // reserve the native 16-pixel scrollbar strip.
  if (
    stage !== "game" ||
    !editVisible ||
    modalNotice ||
    activeWindow === "about" ||
    !state.options.AutoScroll
  )
    return false;
  const previousX = camera.x;
  const previousY = camera.y;
  if (pointer.x === 0) camera.x = Math.max(1, camera.x - 2);
  if (pointer.x > WIDTH - 17) camera.x = Math.min(63, camera.x + 2);
  if (pointer.y > HEIGHT - 17) camera.y = Math.min(73, camera.y + 2);
  if (pointer.y === 0) camera.y = Math.max(0, camera.y - 2);
  const changed = camera.x !== previousX || camera.y !== previousY;
  if (changed) activityHoldoffPasses = 100;
  return changed;
}

function nextSimSmallRandom(limit) {
  // Exact FUN_05fd_00a3 rejection loop.  Its eight-bit polynomial state is
  // independent from both 05fd:007d and 05fd:00d0.
  let value = simSmallRandomState >>> 1;
  if ((simSmallRandomState & 1) !== 0) value ^= 0x00b8;
  simSmallRandomState = value & 0xffff;
  if (value >= limit) {
    if (value > limit) {
      do {
        const lowBit = value & 1;
        value >>>= 1;
        if (lowBit !== 0) value ^= 0x00b8;
      } while (value > limit);
      if (value >= limit) value = 0;
    } else {
      value = 0;
    }
  }
  return value;
}

function placeTreesAtPoint(point) {
  if (!dragState || selectedTool !== "Trees - Windbreaks" || !farmStateBytes)
    return;
  const position = mapCellForPointer(point);
  if (!position) return;
  const key = `${position.x},${position.y}`;
  if (dragState.placed.has(key)) return;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tileIndex = words.base & 0x07ff;
  if (tileIndex < 0x17 || tileIndex > 0x1b || (words.overlay & 0x0800) === 0)
    return;
  const nextTile = 0x83 + (nextSimRandom() & 0x0f);
  const nextWord = (words.base & 0xf800) | nextTile;
  cell[0] = nextWord & 0xff;
  cell[1] = nextWord >> 8;
  dragState.placed.add(key);
  state.funds -= 10;
  mapDirty = true;
  playToolPlacementSound();
}

function fieldAtPosition(position) {
  for (const field of activeFieldRecords()) {
    const record = field.record;
    if (
      position.x >= record[10] &&
      position.x < record[10] + record[12] &&
      position.y >= record[11] &&
      position.y < record[11] + record[13]
    ) {
      return field;
    }
  }
  return null;
}

function fieldFootprintIsValid(x, y, width, height) {
  if (!farmStateBytes || x < 0 || y < 0 || x + width > 96 || y + height > 96)
    return false;
  for (let fieldX = x; fieldX < x + width; fieldX += 1) {
    for (let fieldY = y; fieldY < y + height; fieldY += 1) {
      const words = tileWords(mapCell(fieldX, fieldY));
      const tile = words.base & 0x07ff;
      // Recovered footprint tests: ordinary terrain, no base object, and
      // the ownership bit in every overlay word.
      if (
        tile < 0x15 ||
        tile > 0x1b ||
        (words.base & 0x0800) !== 0 ||
        (words.overlay & 0x0800) === 0
      )
        return false;
    }
  }
  for (let fieldX = x - 1; fieldX <= x + width; fieldX += 1) {
    for (let fieldY = y - 1; fieldY <= y + height; fieldY += 1) {
      if (fieldX < 0 || fieldX >= 96 || fieldY < 0 || fieldY >= 96) continue;
      if ((tileWords(mapCell(fieldX, fieldY)).overlay & 0x1000) !== 0)
        return false;
    }
  }
  return true;
}

function initializeFieldRecord(
  record,
  sequence,
  x,
  y,
  width,
  height,
  cropSlot,
) {
  record.fill(0);
  const view = fieldRecordView(record);
  view.setUint16(0, sequence, true);
  record[2] = 3;
  // A newly accepted crop reaches planting substate 3 before the original
  // click loop repaints and serializes the result.
  record[3] = 3;
  record[7] = 1;
  view.setUint16(8, 0x0180, true);
  record[10] = x;
  record[11] = y;
  record[12] = width;
  record[13] = height;
  record[14] = cropSlot;

  const environmentalCell = ((x + 4) >> 3) * 12 + ((y + 4) >> 3);
  const environmentalOffset =
    saveData.format.environmentalGridOffset +
    environmentalCell * saveData.format.environmentalGridCellSize;
  record[20] = farmStateBytes[environmentalOffset + 2];
  record[21] = farmStateBytes[environmentalOffset + 4];
  record[22] = farmStateBytes[environmentalOffset + 3];
  record[28] = farmStateBytes[environmentalOffset + 6];
  record[29] = record[28];
  record[30] = 0x41;
  record[31] = 0x50;
  view.setUint16(58, 500, true);
  record[66] = 0xff;
  record[67] = 0xff;
}

function writeFieldFootprint(x, y, width, height, cropSlot) {
  for (let fieldX = x; fieldX < x + width; fieldX += 1) {
    for (let fieldY = y; fieldY < y + height; fieldY += 1) {
      const cell = mapCell(fieldX, fieldY);
      const words = tileWords(cell);
      const base = (words.base & 0xf800) | 0x24;
      const overlay = words.overlay | 0x1000;
      cell[0] = base & 0xff;
      cell[1] = base >> 8;
      cell[2] = overlay & 0xff;
      cell[3] = overlay >> 8;
    }
  }
  const markerBase = 0x21b + cropSlot * 4;
  for (let markerY = 0; markerY < 2; markerY += 1) {
    for (let markerX = 0; markerX < 2; markerX += 1) {
      const cell = mapCell(x + markerX, y + markerY);
      const words = tileWords(cell);
      const tile = markerBase + markerY * 2 + markerX;
      const base = (words.base & 0xf800) | tile;
      cell[0] = base & 0xff;
      cell[1] = base >> 8;
    }
  }
}

function placeFieldAtPoint(point) {
  if (selectedCropSlot === null || !farmStateBytes) return;
  const position = mapCellForPointer(point);
  if (!position || !fieldFootprintIsValid(position.x, position.y, 8, 8)) {
    setQuickMessage(0x33);
    return;
  }
  let freeSlot = -1;
  for (let slot = 1; slot < saveData.format.fieldRecordCount; slot += 1) {
    if ((fieldRecord(slot)[7] & 1) === 0) {
      freeSlot = slot;
      break;
    }
  }
  if (freeSlot < 0) {
    setQuickMessage(0x33);
    return;
  }
  const view = stateView(farmStateBytes);
  const count = view.getUint16(saveData.format.fieldCountOffset, true) + 1;
  view.setUint16(saveData.format.fieldCountOffset, count, true);
  initializeFieldRecord(
    fieldRecord(freeSlot),
    count,
    position.x,
    position.y,
    8,
    8,
    selectedCropSlot,
  );
  applyCropProductionMarketEffect(selectedCropSlot);
  writeFieldFootprint(position.x, position.y, 8, 8, selectedCropSlot);
  state.funds -= 120;
  mapDirty = true;
  playToolPlacementSound();
}

function sprayFieldAtPoint(point) {
  if (!selectedSprayAction || !farmStateBytes) return;
  const position = mapCellForPointer(point);
  if (!position) return;
  const field = fieldAtPosition(position);
  if (!field) {
    // 233c:16a4 returns without posting a new QMESSAGE when no field was
    // hit, leaving the existing tool-selection instruction in place.
    return;
  }
  const record = field.record;
  const view = fieldRecordView(record);
  if (
    (record[2] !== 0 && record[2] !== 4) ||
    view.getUint16(42, true) !== 0 ||
    view.getUint16(44, true) !== 0
  ) {
    setQuickMessage(0x15);
    return;
  }
  // Exact 233c:16a4 direct-operation path: unlike a future scheduled
  // operation, a click consumes the supply before the field machinery
  // state is entered.  Substate 1 begins tractor allocation; substate 0 is
  // reserved for the weekly dispatcher, whose state machine consumes it.
  if (!consumeStoredChemical(selectedSprayAction.chemicalId)) {
    setQuickMessage(0x4b);
    return;
  }
  record[4] = record[2];
  record[5] = record[3];
  record[2] = selectedSprayAction.state;
  record[3] = 1;
  setFieldScheduleTile(
    field.slot,
    state.month * 4 + state.week,
    selectedSprayAction.code,
  );
  mapDirty = true;
  setQuickMessage(0x44);
}

function machineFootprintIsValid(item, x, y) {
  if (
    !item ||
    item.width < 1 ||
    item.height < 1 ||
    x < 0 ||
    y < 0 ||
    x + item.width > 96 ||
    y + item.height > 96
  )
    return false;
  const originWords = tileWords(mapCell(x, y));
  const originTile = originWords.base & 0x07ff;
  if (originTile < 0x19 || originTile > 0x1b) return false;
  for (let machineX = x; machineX < x + item.width; machineX += 1) {
    for (let machineY = y; machineY < y + item.height; machineY += 1) {
      const words = tileWords(mapCell(machineX, machineY));
      if (
        (words.base & 0x0800) !== 0 ||
        (words.overlay & 0x0800) === 0 ||
        (words.overlay & 0x07ff) !== 0
      )
        return false;
    }
  }
  return true;
}

function allocateMachineSlotRecord(item, x, y, preserveRouteScratch = false) {
  let slot = -1;
  for (
    let candidate = 1;
    candidate < saveData.format.machineRecordCount;
    candidate += 1
  ) {
    const record = machineRecord(candidate);
    if ((stateView(record).getUint16(2, true) & 0x20) === 0) {
      slot = candidate;
      break;
    }
  }
  if (slot < 0) return null;

  const record = machineRecord(slot);
  const routeScratch = preserveRouteScratch ? record.slice(7, 15) : null;
  record.fill(0);
  if (routeScratch) record.set(routeScratch, 7);
  const view = stateView(record);
  view.setUint16(0, item.id, true);
  view.setUint16(2, 0xa0, true);
  record[5] = x;
  record[6] = y;
  // This field is the DOS runtime clock and is intentionally volatile in
  // controlled oracle saves. The native 20 ms tick retains its 16-bit form.
  view.setUint16(30, biosClockTick(), true);
  record[49] = 1;
  record[50] = x;
  record[51] = y;
  record[52] = 0;
  record[53] = item.width;
  record[54] = item.height;
  record[55] = 0;
  return { slot, record };
}

function purchaseCropDusterAtAirport(item) {
  if (!farmStateBytes || !item || item.id !== 8) return false;
  let airportFound = false;
  let parking = null;
  for (let x = 0; x < 12 && !parking; x += 1) {
    for (let y = 0; y < 12; y += 1) {
      const at =
        saveData.format.environmentalGridOffset +
        (x * 12 + y) * saveData.format.environmentalGridCellSize;
      const cell = farmStateBytes[at];
      if ((cell & 0x0f) !== 5) continue;
      airportFound = true;
      if ((cell & 0x20) === 0)
        parking = { x: x * 8 + 3, y: y * 8 + 6, at, flag: 0x20 };
      else if ((cell & 0x40) === 0)
        parking = { x: x * 8 + 5, y: y * 8 + 6, at, flag: 0x40 };
      if (parking) break;
    }
  }
  if (!airportFound || !parking) {
    // 3d9f:0a5a distinguishes a town with no airport (forced record 26)
    // from airports whose two parking bits are both occupied (record 19).
    requestGenericEvent(airportFound ? 0x93 : 0x9a);
    return false;
  }
  if (state.funds < item.price) {
    setQuickMessage(0x2a);
    return false;
  }
  const allocated = allocateMachineSlotRecord(item, parking.x, parking.y, true);
  if (!allocated) return false;

  const parkedTiles = [
    [0, 0, 0x47],
    [0, 1, 0x6f],
    [1, 0, 0x48],
    [1, 1, 0x70],
  ];
  for (const [dx, dy, tile] of parkedTiles) {
    const cell = mapCell(parking.x + dx, parking.y + dy);
    stateView(cell).setUint16(0, tile, true);
  }
  farmStateBytes[parking.at] |= parking.flag;

  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.machineCountOffset,
    saveView.getUint16(saveData.format.machineCountOffset, true) + 1,
    true,
  );
  const definitionView = stateView(item.record);
  definitionView.setUint16(4, definitionView.getUint16(4, true) + 1, true);
  for (const offset of [
    saveData.format.machinePurchaseExpenseOffset1,
    saveData.format.machinePurchaseExpenseOffset2,
  ]) {
    saveView.setUint32(
      offset,
      saveView.getUint32(offset, true) + item.price,
      true,
    );
  }
  state.funds -= item.price;
  mapDirty = true;
  requestGenericEvent(0x9d);
  message = "";
  return true;
}

function adjustMachineOperatingExpense(amount) {
  if (!farmStateBytes || amount === 0) return;
  const saveView = stateView(farmStateBytes);
  const offset = saveData.format.machineOperatingExpenseOffset ?? 0x216cc;
  const current = saveView.getUint32(offset, true);
  saveView.setUint32(
    offset,
    amount > 0 ? (current + amount) >>> 0 : Math.max(0, current + amount),
    true,
  );
}

function chargeCropDusterService(amount) {
  if (amount === 0) return true;
  if (state.funds < amount) {
    setQuickMessage(0x2a);
    return false;
  }
  state.funds -= amount;
  adjustMachineOperatingExpense(amount);
  message = "";
  return true;
}

function serviceCropDusterFuel() {
  const record = selectedDusterRecord();
  if (!record) return false;
  const view = stateView(record);
  const cost = 255 - view.getUint16(20, true);
  if (!chargeCropDusterService(cost)) return false;
  view.setUint16(20, 255, true);
  return true;
}

function selectCropDusterChemical(chemicalId) {
  const record = selectedDusterRecord();
  if (!record || chemicalId === selectedDusterChemical) return false;
  const view = stateView(record);
  const remaining = view.getUint16(32, true);
  const refund = remaining * dusterChemicalUnitCost(selectedDusterChemical);
  if (refund > 0) {
    state.funds += refund;
    adjustMachineOperatingExpense(-refund);
  }
  view.setUint16(32, 0, true);
  selectedDusterChemical = chemicalId;
  message = "";
  return true;
}

function serviceCropDusterSpray() {
  const record = selectedDusterRecord();
  if (!record) return false;
  const view = stateView(record);
  const cost =
    (255 - view.getUint16(32, true)) *
    dusterChemicalUnitCost(selectedDusterChemical);
  if (!chargeCropDusterService(cost)) return false;
  view.setUint16(32, 255, true);
  view.setUint16(34, selectedDusterChemical, true);
  return true;
}

function serviceCropDusterRepair() {
  const record = selectedDusterRecord();
  if (!record) return false;
  const cost = record[17] * 10;
  if (!chargeCropDusterService(cost)) return false;
  record[17] = 0;
  return true;
}

function writeAirportGroundTile(x, y) {
  const cell = mapCell(x, y);
  if (!cell) return;
  const view = stateView(cell);
  view.setUint16(0, (view.getUint16(0, true) & 0xf800) | 0x17, true);
}

function writeCropDusterFootprint(x, y, crashed = false) {
  const tiles = crashed
    ? [
        [0, 0, 0x49],
        [1, 0, 0x4a],
        [0, 1, 0x71],
        [1, 1, 0x72],
      ]
    : [
        [0, 0, 0x47],
        [1, 0, 0x48],
        [0, 1, 0x6f],
        [1, 1, 0x70],
      ];
  for (const [dx, dy, tile] of tiles) {
    const cell = mapCell(x + dx, y + dy);
    if (!cell) continue;
    const view = stateView(cell);
    view.setUint16(0, (view.getUint16(0, true) & 0xf800) | tile, true);
  }
}

function cropDusterAirportCell(x, y) {
  const parcelX = x >> 3;
  const parcelY = y >> 3;
  if (parcelX < 0 || parcelX >= 12 || parcelY < 0 || parcelY >= 12) return null;
  const at =
    saveData.format.environmentalGridOffset +
    (parcelX * 12 + parcelY) * saveData.format.environmentalGridCellSize;
  return { at, value: farmStateBytes[at] };
}

function setCropDusterAirportOccupied(record, occupied) {
  const airport = cropDusterAirportCell(record[50], record[51]);
  if (!airport) return;
  const localX = record[50] & 7;
  const flag = localX === 3 ? 0x20 : localX === 5 ? 0x40 : 0;
  if (flag === 0) return;
  if (occupied) farmStateBytes[airport.at] |= flag;
  else farmStateBytes[airport.at] &= ~flag;
}

function startCropDusterFlight() {
  const record = selectedDusterRecord();
  if (!record || dusterFlight) return false;
  const homeX = record[50];
  const homeY = record[51];
  for (let dx = 0; dx < 2; dx += 1) {
    for (let dy = 0; dy < 2; dy += 1)
      writeAirportGroundTile(homeX + dx, homeY + dy);
  }
  // FUN_2000:0378 autogotos the parking position first. The airplane then
  // enters at the viewport center (width/32, height/32); near a map edge
  // the clamped camera makes this distinct from the parking coordinates.
  camera.x = Math.max(0, Math.min(63, homeX - 17));
  camera.y = Math.max(0, Math.min(73, homeY - 12));
  dusterFlight = {
    machineSlot: selectedMachineSlot,
    x: camera.x + 17,
    y: camera.y + 12,
    direction: 6,
    altitude: 10,
    spraying: false,
    fuelTicks: 0,
    damageTicks: 0,
    sprayTicks: 0,
    sprayAnimation: 0,
    turbulenceActive: false,
    turbulencePhase: 0,
    turbulenceStartedTick: 0,
    endRequested: false,
    soundStarted: false,
  };
  nextDusterFlightAt = Date.now() + dusterFlightInterval;
  clearGameWindows();
  selectedMachineSlot = null;
  currentMenu = null;
  message = "";
  mapDirty = true;
  return true;
}

function removeCrashedCropDuster(record) {
  const view = stateView(record);
  view.setUint16(2, view.getUint16(2, true) & ~0x20, true);
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.machineCountOffset,
    Math.max(
      0,
      saveView.getUint16(saveData.format.machineCountOffset, true) - 1,
    ),
    true,
  );
  const definition = itemDefinitionForKeyAndId("machine", 8);
  if (definition) {
    const definitionView = stateView(definition.record);
    definitionView.setUint16(
      4,
      Math.max(0, definitionView.getUint16(4, true) - 1),
      true,
    );
  }
  setCropDusterAirportOccupied(record, false);
}

function finishCropDusterFlight() {
  if (!dusterFlight) return false;
  const flight = dusterFlight;
  const record = machineRecord(flight.machineSlot);
  dusterFlight = null;
  if (!record) return false;
  const airport = cropDusterAirportCell(flight.x, flight.y);
  if (airport && (airport.value & 0x0f) === 5) {
    writeCropDusterFootprint(record[50], record[51]);
    setCropDusterAirportOccupied(record, true);
  } else {
    play("explode");
    writeCropDusterFootprint(
      Math.max(0, Math.min(94, flight.x)),
      Math.max(0, Math.min(94, flight.y)),
      true,
    );
    for (let dx = 0; dx < 2; dx += 1) {
      for (let dy = 0; dy < 2; dy += 1)
        writeAirportGroundTile(record[50] + dx, record[51] + dy);
    }
    removeCrashedCropDuster(record);
  }
  message = "";
  mapDirty = true;
  return true;
}

function applyCropDusterChemical(flight, record) {
  const field = fieldAtPosition({ x: flight.x, y: flight.y });
  if (!field) return;
  const fieldRecord = field.record;
  addFieldCondition(fieldRecord, 32, 5, 2);
  const chemical = stateView(record).getUint16(34, true);
  if (chemical === 0xdd) {
    subtractFieldCondition(fieldRecord, 20, 2, fieldRecord[20]);
    fieldRecord[60] >>= 1;
  } else if (chemical === 0xde) {
    subtractFieldCondition(fieldRecord, 21, 4, fieldRecord[21]);
    fieldRecord[61] >>= 1;
  } else if (chemical === 0xdf) {
    subtractFieldCondition(fieldRecord, 22, 3, fieldRecord[22]);
    fieldRecord[62] >>= 1;
  }
}

const dusterDirectionVectors = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function advanceCropDusterFlightTick() {
  if (!dusterFlight) return false;
  const flight = dusterFlight;
  const record = machineRecord(flight.machineSlot);
  if (!record || (stateView(record).getUint16(2, true) & 0x20) === 0) {
    dusterFlight = null;
    return false;
  }
  // 3dd2:0a12 occurs on the first accepted flight-loop timing iteration,
  // rather than when the AIRPLANE window's Fly control is pressed.
  if (!flight.soundStarted) {
    flight.soundStarted = true;
    play("plane");
  }

  if (flight.turbulenceActive) {
    const elapsed = (biosClockTick() - flight.turbulenceStartedTick) & 0xffff;
    if (elapsed < 0x80) flight.turbulencePhase += 1;
    else {
      flight.turbulenceActive = false;
      flight.turbulencePhase = 0;
    }
  }

  flight.damageTicks += 2;
  if (flight.damageTicks > 0x20) {
    flight.damageTicks = 0;
    record[17] = Math.min(0xff, record[17] + 1);
    if (record[17] > 0xfa) flight.endRequested = true;
  }

  flight.fuelTicks += 2;
  if (flight.fuelTicks > 0x20) {
    flight.fuelTicks = 0;
    const view = stateView(record);
    const fuel = view.getUint16(20, true);
    view.setUint16(20, fuel > 0 ? fuel - 1 : 0, true);
    if (fuel <= 1) flight.endRequested = true;
  }

  if (flight.spraying) {
    flight.sprayTicks += 2;
    if (flight.sprayTicks > 8) {
      flight.sprayTicks = 0;
      const view = stateView(record);
      const remaining = view.getUint16(32, true);
      if (remaining > 0) view.setUint16(32, remaining - 1, true);
      else flight.spraying = false;
    }
  }

  const [dx, dy] = dusterDirectionVectors[flight.direction];
  let nextX = flight.x + dx;
  let nextY = flight.y + dy;
  if (nextX < 0 || nextX > 95) {
    flight.direction = (8 - flight.direction) & 7;
    nextX = flight.x + dusterDirectionVectors[flight.direction][0];
  }
  if (nextY < 0 || nextY > 95) {
    flight.direction = (4 - flight.direction) & 7;
    nextY = flight.y + dusterDirectionVectors[flight.direction][1];
  }
  flight.x = Math.max(0, Math.min(95, nextX));
  flight.y = Math.max(0, Math.min(95, nextY));

  if (flight.spraying) {
    flight.sprayAnimation = (flight.sprayAnimation + 1) & 3;
    if (flight.sprayAnimation === 0) applyCropDusterChemical(flight, record);
  }

  if (tornadoEvent?.active) {
    const tornadoDx = flight.x - tornadoEvent.x;
    const tornadoDy = flight.y - tornadoEvent.y;
    const squaredDistance = tornadoDx * tornadoDx + tornadoDy * tornadoDy;
    if (squaredDistance < 0x32) {
      if (squaredDistance < 5) {
        flight.altitude = 0;
        flight.endRequested = true;
      }
      flight.turbulenceActive = true;
      flight.turbulenceStartedTick = biosClockTick();
    }
    // ovl05 calls the common disaster updater after every tornado distance
    // sample, including the tick that forces a crash.
    // The native flight loop calls only the common event animator. Tornado
    // lifetime cleanup runs in the normal farm loop and is suspended while
    // the Crop Duster flight owns execution.
  }
  advanceDisasterEvents();

  if (flight.x - camera.x < 3) camera.x = Math.max(0, flight.x - 3);
  else if (flight.x - camera.x > 31) camera.x = Math.min(63, flight.x - 31);
  if (flight.y - camera.y < 3) camera.y = Math.max(0, flight.y - 3);
  else if (flight.y - camera.y > 21) camera.y = Math.min(73, flight.y - 21);
  if (flight.endRequested) return finishCropDusterFlight();
  return true;
}

function controlCropDusterFlight(event) {
  if (!dusterFlight) return false;
  const code = event.code;
  const key = event.key;
  if (code === "Numpad4" || key === "ArrowLeft") {
    dusterFlight.direction = (dusterFlight.direction + 7) & 7;
  } else if (code === "Numpad6" || key === "ArrowRight") {
    dusterFlight.direction = (dusterFlight.direction + 1) & 7;
  } else if (code === "Numpad9" || key === "PageUp") {
    dusterFlight.altitude = Math.min(100, dusterFlight.altitude + 1);
  } else if (code === "Numpad3" || key === "PageDown") {
    dusterFlight.altitude -= 1;
    if (dusterFlight.altitude < 1) {
      dusterFlight.altitude = 0;
      dusterFlight.endRequested = true;
    }
  } else if (code === "NumpadAdd" || key === "+") {
    const record = machineRecord(dusterFlight.machineSlot);
    if (record && stateView(record).getUint16(32, true) > 0)
      dusterFlight.spraying = true;
  } else if (code === "NumpadSubtract" || key === "-") {
    dusterFlight.spraying = false;
  } else if (code === "Numpad7" || key === "Home") {
    if (dusterFlight.spraying) dusterFlight.spraying = false;
    else {
      const record = machineRecord(dusterFlight.machineSlot);
      if (record && stateView(record).getUint16(32, true) > 0)
        dusterFlight.spraying = true;
    }
  } else if (
    code === "Numpad5" ||
    code === "Numpad1" ||
    key === "Clear" ||
    key === "End"
  ) {
    dusterFlight.endRequested = true;
  } else if (
    code !== "Numpad8" &&
    code !== "Numpad2" &&
    key !== "ArrowUp" &&
    key !== "ArrowDown"
  ) {
    return false;
  }
  render();
  return true;
}

function allocateMachineRecord(item, x, y) {
  return allocateMachineSlotRecord(item, x, y)?.record ?? null;
}

function placePurchasedMachineAtPoint(item, point) {
  const overlayStart = machineOverlayStarts.get(item.id);
  if (overlayStart === undefined) return false;
  const position = mapCellForPointer(point);
  if (!position || !machineFootprintIsValid(item, position.x, position.y))
    return false;
  if (state.funds < item.price) {
    setQuickMessage(0x2a);
    return false;
  }
  if (!allocateMachineRecord(item, position.x, position.y)) return false;

  for (let machineX = 0; machineX < item.width; machineX += 1) {
    for (let machineY = 0; machineY < item.height; machineY += 1) {
      const cell = mapCell(position.x + machineX, position.y + machineY);
      const words = tileWords(cell);
      const nextBase = words.base | 0x0800;
      const nextOverlay =
        (words.overlay & 0xf800) |
        (overlayStart + machineX * item.height + machineY);
      cell[0] = nextBase & 0xff;
      cell[1] = nextBase >> 8;
      cell[2] = nextOverlay & 0xff;
      cell[3] = nextOverlay >> 8;
    }
  }

  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.machineCountOffset,
    saveView.getUint16(saveData.format.machineCountOffset, true) + 1,
    true,
  );
  const definitionView = stateView(item.record);
  definitionView.setUint16(4, definitionView.getUint16(4, true) + 1, true);
  for (const offset of [
    saveData.format.machinePurchaseExpenseOffset1,
    saveData.format.machinePurchaseExpenseOffset2,
  ]) {
    saveView.setUint32(
      offset,
      saveView.getUint32(offset, true) + item.price,
      true,
    );
  }
  state.funds -= item.price;
  mapDirty = true;
  message = "";
  playToolPlacementSound();
  return true;
}

function structureFootprintIsValid(item, x, y) {
  if (
    !item ||
    item.width < 1 ||
    item.height < 1 ||
    x < 0 ||
    y < 0 ||
    x + item.width > 96 ||
    y + item.height > 96
  )
    return false;
  for (let structureX = x; structureX < x + item.width; structureX += 1) {
    for (let structureY = y; structureY < y + item.height; structureY += 1) {
      const words = tileWords(mapCell(structureX, structureY));
      const tile = words.base & 0x07ff;
      const pristineTerrain = tile >= 0x0f && tile <= 0x1e;
      // 2957:04f8 reads these exact start/count entries from the native
      // 160-entry tile-family tables. Together with pristine group zero,
      // these preserve all nine native checks and their surprising gaps.
      const autoDozeTerrain =
        (tile >= 0x0217 && tile <= 0x021a) || // group 145
        (tile >= 0x00b1 && tile <= 0x00bb) || // group 78
        (tile >= 0x00a1 && tile <= 0x00ab) || // group 5
        (tile >= 0x0096 && tile <= 0x00a0) || // group 4
        (tile >= 0x0057 && tile <= 0x0061) || // group 83
        (tile >= 0x0062 && tile <= 0x006c) || // group 84
        (tile >= 0x007a && tile <= 0x007d) || // group 56
        (tile >= 0x0083 && tile <= 0x0092); // group 62
      if (
        (!pristineTerrain && !(state.options.AutoDoze && autoDozeTerrain)) ||
        (words.base & 0x0800) !== 0 ||
        (words.overlay & 0x0800) === 0
      )
        return false;
    }
  }
  for (let structureX = x - 1; structureX <= x + item.width; structureX += 1) {
    // The native loop initializes y-1 and increments before its first test,
    // so this asymmetric border is y..y+height (not y-1..y+height).
    for (let structureY = y; structureY <= y + item.height; structureY += 1) {
      if (
        structureX < 0 ||
        structureX >= 96 ||
        structureY < 0 ||
        structureY >= 96
      )
        continue;
      if ((tileWords(mapCell(structureX, structureY)).overlay & 0x1000) !== 0)
        return false;
    }
  }
  return true;
}

function structureWriterFootprintIsValid(item, x, y) {
  // The final writer at 2a66:048a performs a second, narrower terrain pass
  // after AutoDoze. It accepts pristine terrain and the two road families;
  // ditch, valve, and fence groups admitted by 2957:04f8 still fail here.
  for (let structureX = x; structureX < x + item.width; structureX += 1) {
    for (let structureY = y; structureY < y + item.height; structureY += 1) {
      const words = tileWords(mapCell(structureX, structureY));
      const tile = words.base & 0x07ff;
      if (
        (words.base & 0x0800) !== 0 ||
        !(
          (tile >= 0x000f && tile <= 0x001e) ||
          (tile >= 0x0096 && tile <= 0x00a0) ||
          (tile >= 0x00a1 && tile <= 0x00ab)
        )
      )
        return false;
    }
  }
  return true;
}

function autoDozeStructureFootprint(item, x, y) {
  if (!state.options.AutoDoze) return false;
  let changed = false;
  for (let structureX = x; structureX < x + item.width; structureX += 1) {
    for (let structureY = y; structureY < y + item.height; structureY += 1) {
      const cell = mapCell(structureX, structureY);
      const words = tileWords(cell);
      const tile = words.base & 0x07ff;
      const tree = tile >= 0x0083 && tile <= 0x0092;
      const paidClear = tile >= 0x0217 && tile <= 0x021a;
      if (!tree && !paidClear) continue;
      // 333c:19ea ignores a failed per-cell $25 availability check. Trees
      // use the same clear path without that debit; group 145 pays it. The
      // wrapper has already reserved the pending structure price, so only
      // cash above that amount is available to this nested transaction.
      if (paidClear) {
        if (state.funds - item.price < 25) continue;
        state.funds -= 25;
      }
      const nextBase = (words.base & 0xf800) | (0x17 + (cell[4] >> 2));
      cell[0] = nextBase & 0xff;
      cell[1] = nextBase >> 8;
      changed = true;
    }
  }
  if (changed) mapDirty = true;
  return changed;
}

function allocateStructureRecord(item, x, y) {
  let slot = -1;
  for (
    let candidate = 1;
    candidate < saveData.format.structureRecordCount;
    candidate += 1
  ) {
    const record = structureRecord(candidate);
    if ((stateView(record).getUint16(2, true) & 0x20) === 0) {
      slot = candidate;
      break;
    }
  }
  if (slot < 0) return null;

  const record = structureRecord(slot);
  const view = stateView(record);
  view.setUint16(0, item.id, true);
  view.setUint16(2, 0, true);
  record[4] = x;
  record[5] = y;
  record[6] = 0;
  view.setUint16(8, 0, true);
  for (let structureX = 0; structureX < 4; structureX += 1) {
    for (let structureY = 0; structureY < 3; structureY += 1) {
      const index = structureX * 3 + structureY;
      view.setUint16(10 + index * 2, 0x00d9, true);
      view.setUint16(34 + index * 2, 0xffff, true);
      record[58 + index] = 0;
    }
  }
  view.setUint16(2, view.getUint16(2, true) | 0x20, true);
  return record;
}

function writeStructureFootprint(item, x, y) {
  const baseTileStart = structureBaseTileStarts.get(item.id);
  for (let structureY = 0; structureY < item.height; structureY += 1) {
    for (let structureX = 0; structureX < item.width; structureX += 1) {
      const cell = mapCell(x + structureX, y + structureY);
      if (item.id === 0x47) {
        const words = tileWords(cell);
        const base = words.base | 0x0800;
        const overlay =
          (words.overlay & 0xf800) |
          (0x03f2 + structureY * item.width + structureX);
        cell[0] = base & 0xff;
        cell[1] = base >> 8;
        cell[2] = overlay & 0xff;
        cell[3] = overlay >> 8;
      } else {
        const tile =
          item.id === 0x46
            ? 0x8078
            : baseTileStart + structureY * item.width + structureX;
        cell[0] = tile & 0xff;
        cell[1] = tile >> 8;
      }
    }
  }
}
