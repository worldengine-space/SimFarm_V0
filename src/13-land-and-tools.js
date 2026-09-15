// Map selection, parcel transactions, bulldozing, and terrain tools.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function mapCellForPointer(point) {
  // Native Edit's client starts at(64,80); camera.x is the next column
  // retained by our authored startup fixtures. Native terrain callbacks read
  // raw DS:171b/171d, which are also the software cursor's image origin.
  const screenX = Math.floor((point.x - 80) / 16);
  const screenY = Math.floor((point.y - 80) / 16);
  if (screenX < -1 || screenX >= 33 || screenY < 0 || screenY >= 23)
    return null;
  const x = camera.x + screenX;
  const y = camera.y + screenY;
  if (x < 0 || x >= 96 || y < 0 || y >= 96) return null;
  return { x, y };
}

function handleGameRightClick(point) {
  if (
    stage !== "game" ||
    modalNotice ||
    toolPopup ||
    activeWindow ||
    !editVisible
  )
    return false;
  // Native outside-menu presses dismiss the dropdown and still reach Edit:
  // the raw cursor probe opens a shed roof with Options previously open.
  if (currentMenu !== null) {
    const menu = menus[currentMenu];
    if (inside(point, menu.dropX, 16, menu.dropWidth, menu.items.length * 12))
      return false;
    currentMenu = null;
  }
  const editPoint = gameWindowPoint(point, editWindowSentinel);
  if (
    editPoint.x < 64 ||
    editPoint.y < 80 ||
    editPoint.x >= 608 ||
    editPoint.y >= 448
  )
    return false;
  const position = mapCellForPointer(editPoint);
  if (!position || selectedTool === "Move Object") return false;
  if (toggleStructureRoofAtPosition(position)) return true;
  if (selectedTool === "Fence Gate")
    return togglePlacedFenceGateAtPoint(editPoint);
  if (selectedTool === "Irrigation Ditch Valve") {
    return togglePlacedDitchValveAtPoint(editPoint);
  }
  return false;
}

function playToolPlacementSound() {
  // 31c2:0cec..0d0d keeps a byte local to one press-drag-release handler.
  // The first successful placement plays PLPTOOL; later cells in that same
  // drag are silent. Discrete catalog placements each have their own call.
  if (dragState?.soundPlayed) return false;
  if (dragState) dragState.soundPlayed = true;
  play("ploptool");
  return true;
}

function placeLinearTerrainAtPoint(point) {
  const rule = linearTerrainTools[selectedTool];
  if (!dragState || !rule || !farmStateBytes) return;
  const position = mapCellForPointer(point);
  if (!position) return;
  const key = `${position.x},${position.y}`;
  if (dragState.placed.has(key)) return;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tileIndex = words.base & 0x07ff;
  if (isLinearToolTile(tileIndex, rule)) return;
  const roadTool =
    selectedTool === "Paved Road" || selectedTool === "Dirt Road";
  const ditchTool = selectedTool === "Irrigation Ditch";
  const bridgeTarget =
    (roadTool &&
      ((tileIndex >= 0x27 && tileIndex <= 0x45) ||
        (tileIndex >= 0x57 && tileIndex <= 0x6d))) ||
    (ditchTool &&
      ((tileIndex >= 0x96 && tileIndex < 0xa1) ||
        (tileIndex >= 0xa1 && tileIndex < 0xac)));
  const networkRules = linearNetworkRules(rule);
  if (bridgeTarget) {
    // The outer construction callback has already applied the selected
    // tool's strict price gate. Its shared charge helper then accepts an
    // exact $40 bridge balance and posts record 42 on a smaller balance.
    if (state.funds < bridgeConstructionCost) {
      setQuickMessage(0x2a);
      return;
    }
    const nextWord = (words.base & 0xf800) | bridgeConnectionRule.straightTile;
    cell[0] = nextWord & 0xff;
    cell[1] = nextWord >> 8;
    reconnectLinearNetworkNeighbors(position.x, position.y, networkRules);
    dragState.placed.add(key);
    state.funds -= bridgeConstructionCost;
    mapDirty = true;
    playToolPlacementSound();
    return;
  }
  // The recovered group-zero bounds use an inclusive upper comparison.
  if (tileIndex < 0x0f || tileIndex > 0x1f) return;
  if (rule.requiresOverlay && (words.overlay & 0x0800) === 0) return;
  writeLinearToolTile(position.x, position.y, rule, networkRules);
  reconnectLinearNetworkNeighbors(position.x, position.y, networkRules);
  dragState.placed.add(key);
  state.funds -= rule.cost;
  mapDirty = true;
  playToolPlacementSound();
}

function linearNetworkRules(rule) {
  if (
    rule === linearTerrainTools["Paved Road"] ||
    rule === linearTerrainTools["Dirt Road"]
  ) {
    // Native descriptor 5696: paved, immutable bridge, dirt.
    return [
      linearTerrainTools["Paved Road"],
      bridgeConnectionRule,
      linearTerrainTools["Dirt Road"],
    ];
  }
  if (rule === linearTerrainTools["Irrigation Ditch"]) {
    // Native descriptor 56ae: wet ditch, dry ditch, immutable bridge and
    // immutable valve families.
    return [
      linearTerrainTools["Irrigation Ditch"],
      dryDitchConnectionRule,
      bridgeConnectionRule,
      ditchValveConnectionRule,
    ];
  }
  if (rule === linearTerrainTools.Fence) {
    // Native descriptor 56c6 lets gates connect the surrounding fence but
    // never rewrites the gate tile itself.
    return [linearTerrainTools.Fence, fenceGateConnectionRule];
  }
  return [rule];
}

function linearNetworkRuleForTile(tileIndex, networkRules) {
  return (
    networkRules.find((candidate) => isLinearToolTile(tileIndex, candidate)) ||
    null
  );
}

function reconnectLinearNetworkNeighbors(x, y, networkRules) {
  for (const neighbor of cardinalNeighbors) {
    const neighborX = x + neighbor.dx;
    const neighborY = y + neighbor.dy;
    if (neighborX < 0 || neighborX >= 96 || neighborY < 0 || neighborY >= 96)
      continue;
    const neighborTile = tileWords(mapCell(neighborX, neighborY)).base & 0x07ff;
    const neighborRule = linearNetworkRuleForTile(neighborTile, networkRules);
    if (neighborRule && !neighborRule.suppressReconnect) {
      writeLinearToolTile(neighborX, neighborY, neighborRule, networkRules);
    }
  }
}

function isLinearToolTile(tileIndex, rule) {
  return (
    tileIndex >= rule.straightTile &&
    tileIndex < rule.straightTile + (rule.tileCount || 11)
  );
}

function linearConnectionMask(x, y, rule, connectionRules = [rule]) {
  let mask = 0;
  for (const neighbor of cardinalNeighbors) {
    const neighborX = x + neighbor.dx;
    const neighborY = y + neighbor.dy;
    if (neighborX < 0 || neighborX >= 96 || neighborY < 0 || neighborY >= 96)
      continue;
    const tileIndex = tileWords(mapCell(neighborX, neighborY)).base & 0x07ff;
    if (
      connectionRules.some((candidate) =>
        isLinearToolTile(tileIndex, candidate),
      )
    ) {
      mask |= neighbor.bit;
    }
  }
  return mask;
}

function writeLinearToolTile(x, y, rule, connectionRules = [rule]) {
  const cell = mapCell(x, y);
  const words = tileWords(cell);
  const mask = linearConnectionMask(x, y, rule, connectionRules);
  const nextTile = rule.straightTile + connectionTileOffsets[mask];
  const nextWord = (words.base & 0xf800) | nextTile;
  cell[0] = nextWord & 0xff;
  cell[1] = nextWord >> 8;
}

function propertyFenceCellIsEligible(x, y) {
  const tileIndex = tileWords(mapCell(x, y)).base & 0x07ff;
  const terrainFamily = tileIndex >= 0x11 && tileIndex <= 0x20;
  const treeFamily = tileIndex >= 0x83 && tileIndex <= 0x92;
  return (
    (terrainFamily || treeFamily) &&
    !isLinearToolTile(tileIndex, linearTerrainTools.Fence)
  );
}

function buildParcelPerimeterFence(parcelX, parcelY) {
  const cells = new Map();
  const addBoundaryCell = (x, y) => {
    if (propertyFenceCellIsEligible(x, y)) cells.set(`${x},${y}`, { x, y });
  };
  const startX = parcelX * 8;
  const startY = parcelY * 8;
  const lastX = startX + 7;
  const lastY = startY + 7;

  if (parcelY === 0 || parcelStatus(parcelX, parcelY - 1) !== 1) {
    for (let x = startX; x <= lastX; x += 1) addBoundaryCell(x, startY);
  }
  if (
    parcelY === saveData.format.parcelGridHeight - 1 ||
    parcelStatus(parcelX, parcelY + 1) !== 1
  ) {
    for (let x = startX; x <= lastX; x += 1) addBoundaryCell(x, lastY);
  }
  if (parcelX === 0 || parcelStatus(parcelX - 1, parcelY) !== 1) {
    for (let y = startY; y <= lastY; y += 1) addBoundaryCell(startX, y);
  }
  if (
    parcelX === saveData.format.parcelGridWidth - 1 ||
    parcelStatus(parcelX + 1, parcelY) !== 1
  ) {
    for (let y = startY; y <= lastY; y += 1) addBoundaryCell(lastX, y);
  }

  const fence = linearTerrainTools.Fence;
  for (const { x, y } of cells.values()) {
    const cell = mapCell(x, y);
    const words = tileWords(cell);
    const nextWord = (words.base & 0xf800) | fence.straightTile;
    cell[0] = nextWord & 0xff;
    cell[1] = nextWord >> 8;
  }

  const reconnect = new Map(cells);
  for (const { x, y } of cells.values()) {
    for (const neighbor of cardinalNeighbors) {
      const neighborX = x + neighbor.dx;
      const neighborY = y + neighbor.dy;
      if (neighborX < 0 || neighborX >= 96 || neighborY < 0 || neighborY >= 96)
        continue;
      const tileIndex = tileWords(mapCell(neighborX, neighborY)).base & 0x07ff;
      if (isLinearToolTile(tileIndex, fence)) {
        reconnect.set(`${neighborX},${neighborY}`, {
          x: neighborX,
          y: neighborY,
        });
      }
    }
  }
  for (const { x, y } of reconnect.values()) writeLinearToolTile(x, y, fence);
}

function purchaseSelectedParcel() {
  if (!selectedParcel || !farmStateBytes) return;
  const { x: parcelX, y: parcelY } = selectedParcel;
  const record = parcelRecord(parcelX, parcelY);
  if (!record || parcelStatus(parcelX, parcelY) !== 0) return;
  const value = parcelLandValue(parcelX, parcelY);
  if (state.funds < value) {
    setQuickMessage(0x2a);
    return;
  }

  record[saveData.format.parcelStatusOffset] = 1;
  for (let x = parcelX * 8; x < parcelX * 8 + 8; x += 1) {
    for (let y = parcelY * 8; y < parcelY * 8 + 8; y += 1) {
      mapCell(x, y)[3] |= 0x08;
    }
  }
  buildParcelPerimeterFence(parcelX, parcelY);

  const view = stateView(farmStateBytes);
  for (const offset of [
    saveData.format.landPurchaseExpenseOffset1,
    saveData.format.landPurchaseExpenseOffset2,
  ]) {
    view.setUint32(offset, view.getUint32(offset, true) + value, true);
  }
  state.funds -= value;
  mapDirty = true;
}

function salePreservesBaseTile(tileIndex) {
  // The protected natural-water family immediately precedes the recovered
  // ditch family. Original sale probes preserve 0x2a/0x2e members while
  // reverting soil, trees, and parcel fences to their terrain band.
  return tileIndex >= 0x29 && tileIndex <= 0x56;
}

function decrementItemDefinitionOwn(definition) {
  if (!definition) return;
  const definitionView = stateView(definition.record);
  definitionView.setUint16(
    4,
    Math.max(0, definitionView.getUint16(4, true) - 1),
    true,
  );
}

function destroyStoredStructureItem(id, slot) {
  const saveView = stateView(farmStateBytes);
  const machineDefinition = itemDefinitionForKeyAndId("machine", id);
  if (machineDefinition) {
    const record = machineRecord(slot);
    if (!record) return false;
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) return false;
    view.setUint16(2, view.getUint16(2, true) & ~0x20, true);
    saveView.setUint16(
      saveData.format.machineCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.machineCountOffset, true) - 1,
      ),
      true,
    );
    const expenseOffset = saveData.format.machinePurchaseExpenseOffset1;
    saveView.setUint32(
      expenseOffset,
      Math.max(
        0,
        saveView.getUint32(expenseOffset, true) - machineDefinition.price,
      ),
      true,
    );
    decrementItemDefinitionOwn(machineDefinition);
    storedMachineDirections.delete(slot);
    return "machine";
  }

  const livestockDefinition = itemDefinitionForKeyAndId("livestock", id);
  if (livestockDefinition) {
    const record = objectRecord(slot);
    if (!record) return false;
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) return false;
    livestockAssetValue =
      ((livestockAssetValue >>> 0) -
        (livestockCurrentValue(record, livestockDefinition) >>> 0)) >>>
      0;
    view.setUint16(2, view.getUint16(2, true) & ~0x20, true);
    saveView.setUint16(
      saveData.format.objectCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.objectCountOffset, true) - 1,
      ),
      true,
    );
    decrementItemDefinitionOwn(livestockDefinition);
    return "livestock";
  }

  const chemicalDefinition = itemDefinitionForKeyAndId("chemical", id);
  if (chemicalDefinition) {
    const record = chemicalStorageRecord(slot);
    if (!record) return false;
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) return false;
    view.setUint16(2, view.getUint16(2, true) & ~0x20, true);
    saveView.setUint16(
      saveData.format.chemicalStorageCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.chemicalStorageCountOffset, true) -
          1,
      ),
      true,
    );
    decrementItemDefinitionOwn(chemicalDefinition);
    return "chemical";
  }

  const lotDefinition =
    itemDefinitionForKeyAndId("stored-crop", id) ||
    itemDefinitionForKeyAndId("seed", id);
  if (!lotDefinition) return false;
  const record = storageLotRecord(slot);
  if (!record || (record[10] & 0x20) === 0) return false;
  record[10] &= ~0x20;
  saveView.setUint16(
    saveData.format.storageLotCountOffset,
    Math.max(
      0,
      saveView.getUint16(saveData.format.storageLotCountOffset, true) - 1,
    ),
    true,
  );
  decrementItemDefinitionOwn(lotDefinition);
  return "lot";
}

function clearStructureContents(record, definition) {
  const view = stateView(record);
  for (let relativeX = 0; relativeX < definition.width; relativeX += 1) {
    for (let relativeY = 0; relativeY < definition.height; relativeY += 1) {
      const storageSlot = relativeX * 3 + relativeY;
      const id = view.getUint16(34 + storageSlot * 2, true);
      if (id === 0xffff) continue;
      const destroyedCategory = destroyStoredStructureItem(
        id,
        record[58 + storageSlot],
      );
      // The original livestock deletion path also empties all three
      // parallel building references. Machine, seed/crop, and chemical
      // deletion leaves those bytes stale in the now-inactive structure.
      if (destroyedCategory === "livestock") {
        view.setUint16(10 + storageSlot * 2, 0x00d9, true);
        view.setUint16(34 + storageSlot * 2, 0xffff, true);
        record[58 + storageSlot] = 0;
      }
    }
  }
}

function restoreDestroyedFootprint(record, definition) {
  for (let x = record[4]; x < record[4] + definition.width; x += 1) {
    for (let y = record[5]; y < record[5] + definition.height; y += 1) {
      const cell = mapCell(x, y);
      if (!cell) continue;
      // FUN_34e6_10aa restores the low eleven bits to the native cleared
      // object tile while leaving the cell's high flags and overlay intact.
      writeMapBaseWord(cell, (tileWords(cell).base & 0xf800) | 0x02a0);
    }
  }
}

function removeBulldozedStructure(structure) {
  if (!structure) return false;
  const { record, definition, id } = structure;
  const view = stateView(record);
  if ((view.getUint16(2, true) & 0x20) === 0) return false;
  clearStructureContents(record, definition);
  restoreDestroyedFootprint(record, definition);
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
  decrementItemDefinitionOwn(definition);
  // Both irrigation structure IDs enter FUN_248c_0e84 before deletion.
  if (id === 0x46 || id === 0x47) resetIrrigationRuntime();
  return true;
}

function removeFieldRecord(field, detachMachinery = false) {
  const record = field?.record;
  if (!record || (record[7] & 1) === 0) return false;
  if (detachMachinery) detachFloodedFieldMachinery(record);
  for (let x = record[10]; x < record[10] + record[12]; x += 1) {
    for (let y = record[11]; y < record[11] + record[13]; y += 1) {
      const cell = mapCell(x, y);
      if (!cell) continue;
      const words = tileWords(cell);
      writeMapBaseWord(cell, (words.base & 0xf800) | 0x02a0);
      const overlay = words.overlay & ~0x1000;
      cell[2] = overlay & 0xff;
      cell[3] = overlay >> 8;
    }
  }
  record[7] &= 0xfe;
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.fieldCountOffset,
    Math.max(0, saveView.getUint16(saveData.format.fieldCountOffset, true) - 1),
    true,
  );
  return true;
}

function clearParcelStructures(parcelX, parcelY) {
  const left = parcelX * 8;
  const top = parcelY * 8;
  const right = left + 8;
  const bottom = top + 8;
  const saveView = stateView(farmStateBytes);
  for (let slot = 1; slot < saveData.format.structureRecordCount; slot += 1) {
    const record = structureRecord(slot);
    const recordView = stateView(record);
    if ((recordView.getUint16(2, true) & 0x20) === 0) continue;
    const definition = itemDefinitionForKeyAndId(
      "structure",
      recordView.getUint16(0, true),
    );
    if (!definition) continue;
    const structureRight = record[4] + definition.width;
    const structureBottom = record[5] + definition.height;
    if (
      record[4] >= right ||
      structureRight <= left ||
      record[5] >= bottom ||
      structureBottom <= top
    )
      continue;
    clearStructureContents(record, definition);
    // 4753:1f25 plays once for every intersecting active structure removed
    // during a parcel sale, before its active bit and count are cleared.
    play("explode");
    recordView.setUint16(2, recordView.getUint16(2, true) & ~0x20, true);
    saveView.setUint16(
      saveData.format.structureCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.structureCountOffset, true) - 1,
      ),
      true,
    );
    decrementItemDefinitionOwn(definition);
  }
}

function parcelHasActiveField(parcelX, parcelY) {
  const left = parcelX * 8;
  const top = parcelY * 8;
  const right = left + 8;
  const bottom = top + 8;
  return activeFieldRecords().some(
    ({ record }) =>
      record[10] < right &&
      record[10] + record[12] > left &&
      record[11] < bottom &&
      record[11] + record[13] > top,
  );
}

function sellParcel(parcelX, parcelY, taxable = true) {
  if (!farmStateBytes) return false;
  const record = parcelRecord(parcelX, parcelY);
  if (!record || parcelStatus(parcelX, parcelY) !== 1) return false;
  const value = parcelLandValue(parcelX, parcelY);

  // 4753:1e22 destroys every intersecting structure and its stored items
  // before restoring the sold parcel. Fields and roaming animals are not
  // deleted by this low-level path.
  clearParcelStructures(parcelX, parcelY);

  record[saveData.format.parcelStatusOffset] = 0;
  for (let x = parcelX * 8; x < parcelX * 8 + 8; x += 1) {
    for (let y = parcelY * 8; y < parcelY * 8 + 8; y += 1) {
      const cell = mapCell(x, y);
      const words = tileWords(cell);
      cell[3] &= 0xb7;
      const tileIndex = words.base & 0x07ff;
      if (!salePreservesBaseTile(tileIndex)) {
        const nextWord = (words.base & 0xf800) | (0x17 + (cell[4] >> 2));
        cell[0] = nextWord & 0xff;
        cell[1] = nextWord >> 8;
      }
    }
  }

  const view = stateView(farmStateBytes);
  const incomeOffset = saveData.format.landSaleIncomeOffset;
  view.setUint32(
    incomeOffset,
    view.getUint32(incomeOffset, true) + value,
    true,
  );
  if (taxable) addTaxableSaleIncome(value);
  state.funds += value;
  mapDirty = true;
  return true;
}

function sellSelectedParcel() {
  if (!selectedParcel) return false;
  const view = stateView(farmStateBytes);
  const homesteadX = view.getUint16(
    saveData.format.startupCoordinateReducedXOffset,
    true,
  );
  const homesteadY = view.getUint16(
    saveData.format.startupCoordinateReducedYOffset,
    true,
  );
  if (selectedParcel.x === homesteadX && selectedParcel.y === homesteadY) {
    setQuickMessage(0x1a);
    modalNotice = "property-sale-homestead";
    return false;
  }
  if (parcelHasActiveField(selectedParcel.x, selectedParcel.y)) {
    message = "";
    modalNotice = "property-sale-field";
    return false;
  }
  return sellParcel(selectedParcel.x, selectedParcel.y);
}

function transactSelectedParcel() {
  if (!selectedParcel) return;
  const status = parcelStatus(selectedParcel.x, selectedParcel.y);
  if (status === 0) purchaseSelectedParcel();
  else if (status === 1) sellSelectedParcel();
}

function placeBulldozeAtPoint(point) {
  if (
    !dragState ||
    selectedTool !== "Bulldoze" ||
    !farmStateBytes ||
    pendingBulldozeAction
  )
    return;
  const position = mapCellForPointer(point);
  if (!position) return;
  const key = `${position.x},${position.y}`;
  if (dragState.placed.has(key)) return;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  // Native skips cells carrying the overlay's protected 0x4000 bit before
  // both the cost check and the bulldozer sound.
  if ((words.overlay & 0x4000) !== 0) return;
  if (state.funds < 25) {
    play("uhoh");
    setQuickMessage(0x2a);
    return;
  }
  play("bulldoze");

  // Structure lookup precedes field lookup in 333c:035c. Both branches are
  // blocking native confirmations and only charge after an affirmative
  // record deletion.
  const structure = structureAtPosition(position);
  if (structure) {
    pendingBulldozeAction = { kind: "structure", slot: structure.slot };
    modalNotice = "bulldoze-structure-question";
    return;
  }
  const field = fieldAtPosition(position);
  if (field) {
    if (field.record[2] !== 0 && field.record[2] !== 4) {
      play("uhoh");
      modalNotice = "bulldoze-field-busy";
      return;
    }
    pendingBulldozeAction = { kind: "field", slot: field.slot };
    modalNotice = "bulldoze-field-question";
    return;
  }

  const tileIndex = words.base & 0x07ff;
  const provenTree = tileIndex >= 0x83 && tileIndex <= 0x92;
  const provenPavedRoad = tileIndex >= 0x96 && tileIndex <= 0xa0;
  const provenDirtRoad = tileIndex >= 0xa1 && tileIndex <= 0xab;
  const provenDitch = tileIndex >= 0x57 && tileIndex <= 0x61;
  const provenFence = tileIndex >= 0xb1 && tileIndex <= 0xbf;
  const provenTrough = tileIndex === 0xaf || tileIndex === 0xb0;
  const overlayTileIndex = words.overlay & 0x07ff;
  const provenFeed = overlayTileIndex >= 0x3fc && overlayTileIndex <= 0x400;
  const provenValve = tileIndex === 0x7a || tileIndex === 0x7c;
  // Neighboring road tiles deliberately retain their existing variants;
  // the original bulldozer does not reconnect them after a removal.
  if (
    !provenTree &&
    !provenPavedRoad &&
    !provenDirtRoad &&
    !provenDitch &&
    !provenFence &&
    !provenTrough &&
    !provenFeed &&
    !provenValve
  )
    return;
  // Record-backed livestock supplies enter the object cleanup branches,
  // whose cleared base is 0x2a0. Ordinary terrain uses the separate fifth-
  // byte terrain band restoration path.
  const nextWord = provenFeed
    ? (words.base & 0xf000) | 0x02a0
    : provenTrough
      ? (words.base & 0xf800) | 0x02a0
      : (words.base & 0xf800) | (0x17 + (cell[4] >> 2));
  cell[0] = nextWord & 0xff;
  cell[1] = nextWord >> 8;
  if (provenFeed) {
    const overlay = (words.overlay & 0xf800) | (0x0f + (cell[4] & 0x0f));
    cell[2] = overlay & 0xff;
    cell[3] = overlay >> 8;
  }
  if (provenFeed || provenTrough) {
    removeLivestockSupplyRecord(
      storageLotAtPosition(position.x, position.y, provenFeed ? 300 : 299),
    );
    play("explode");
  }
  dragState.placed.add(key);
  state.funds -= 25;
  mapDirty = true;
}

function answerBulldozePrompt(accepted) {
  const pending = pendingBulldozeAction;
  pendingBulldozeAction = null;
  modalNotice = null;
  if (!accepted || !pending || !farmStateBytes) return false;
  let removed = false;
  if (pending.kind === "structure") {
    const record = structureRecord(pending.slot);
    if (record) {
      const id = stateView(record).getUint16(0, true);
      const definition = itemDefinitionForKeyAndId("structure", id);
      if (definition) {
        removed = removeBulldozedStructure({
          slot: pending.slot,
          record,
          id,
          definition,
        });
      }
    }
  } else if (pending.kind === "field") {
    removed = removeFieldRecord({
      slot: pending.slot,
      record: fieldRecord(pending.slot),
    });
  }
  if (!removed) return false;
  play("explode");
  state.funds -= 25;
  mapDirty = true;
  return true;
}

function placeDitchValveAtPoint(point) {
  if (
    !dragState ||
    selectedTool !== "Irrigation Ditch Valve" ||
    !farmStateBytes
  )
    return;
  const position = mapCellForPointer(point);
  if (!position) return;
  const key = `${position.x},${position.y}`;
  if (dragState.placed.has(key)) return;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tileIndex = words.base & 0x07ff;
  let nextTile;
  let cost = 0;
  if (tileIndex === 0x57) {
    nextTile = 0x7c;
    cost = 35;
  } else if (tileIndex === 0x58) {
    nextTile = 0x7a;
    cost = 35;
  } else if (tileIndex === 0x7a) nextTile = 0x7b;
  else if (tileIndex === 0x7b) nextTile = 0x7a;
  else if (tileIndex === 0x7c) nextTile = 0x7d;
  else if (tileIndex === 0x7d) nextTile = 0x7c;
  else return;
  const nextWord = (words.base & 0xf800) | nextTile;
  cell[0] = nextWord & 0xff;
  cell[1] = nextWord >> 8;
  dragState.placed.add(key);
  state.funds -= cost;
  mapDirty = true;
  playToolPlacementSound();
}

function togglePlacedDitchValveAtPoint(point) {
  if (!farmStateBytes) return false;
  const position = mapCellForPointer(point);
  if (!position) return false;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tileIndex = words.base & 0x07ff;
  const nextTile = new Map([
    [0x7a, 0x7b],
    [0x7b, 0x7a],
    [0x7c, 0x7d],
    [0x7d, 0x7c],
  ]).get(tileIndex);
  if (nextTile === undefined) return false;
  writeMapBaseWord(cell, (words.base & 0xf800) | nextTile);
  mapDirty = true;
  play("ploptool");
  return true;
}

function placeFenceGateAtPoint(point) {
  if (!dragState || selectedTool !== "Fence Gate" || !farmStateBytes) return;
  const position = mapCellForPointer(point);
  if (!position) return;
  const key = `${position.x},${position.y}`;
  if (dragState.placed.has(key)) return;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tileIndex = words.base & 0x07ff;
  let nextTile;
  let cost = 0;
  if (tileIndex === 0xb1) {
    nextTile = 0xbc;
    cost = 75;
  } else if (tileIndex === 0xb2) {
    nextTile = 0xbe;
    cost = 75;
  } else if (tileIndex === 0xbc) nextTile = 0xbd;
  else if (tileIndex === 0xbd) nextTile = 0xbc;
  else if (tileIndex === 0xbe) nextTile = 0xbf;
  else if (tileIndex === 0xbf) nextTile = 0xbe;
  else return;
  const nextWord = (words.base & 0xf800) | nextTile;
  cell[0] = nextWord & 0xff;
  cell[1] = nextWord >> 8;
  dragState.placed.add(key);
  state.funds -= cost;
  mapDirty = true;
  playToolPlacementSound();
}

function togglePlacedFenceGateAtPoint(point) {
  if (!farmStateBytes) return false;
  const position = mapCellForPointer(point);
  if (!position) return false;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tileIndex = words.base & 0x07ff;
  const nextTile = new Map([
    [0xbc, 0xbd],
    [0xbd, 0xbc],
    [0xbe, 0xbf],
    [0xbf, 0xbe],
  ]).get(tileIndex);
  if (nextTile === undefined) return false;
  writeMapBaseWord(cell, (words.base & 0xf800) | nextTile);
  mapDirty = true;
  play("ploptool");
  return true;
}

function placeLivestockFeedAtPoint(point) {
  if (!dragState || selectedTool !== "Livestock Feed" || !farmStateBytes)
    return;
  const position = mapCellForPointer(point);
  if (!position) return;
  const key = `${position.x},${position.y}`;
  if (dragState.placed.has(key)) return;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tileIndex = words.base & 0x07ff;
  if (tileIndex < 0x19 || tileIndex > 0x1b || (words.overlay & 0x0800) === 0)
    return;
  if (!allocateLivestockSupplyRecord(300, 0x0200, position)) return;
  const nextBase = words.base | 0x0800;
  const nextOverlay = (words.overlay & 0xf800) | 0x03fc;
  cell[0] = nextBase & 0xff;
  cell[1] = nextBase >> 8;
  cell[2] = nextOverlay & 0xff;
  cell[3] = nextOverlay >> 8;
  dragState.placed.add(key);
  state.funds -= 100;
  mapDirty = true;
  playToolPlacementSound();
}

function placeWaterTroughAtPoint(point) {
  if (!dragState || selectedTool !== "Water Trough" || !farmStateBytes) return;
  const position = mapCellForPointer(point);
  if (!position) return;
  const key = `${position.x},${position.y}`;
  if (dragState.placed.has(key)) return;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tileIndex = words.base & 0x07ff;
  if (tileIndex < 0x19 || tileIndex > 0x1b || (words.overlay & 0x0800) === 0)
    return;
  if (!allocateLivestockSupplyRecord(299, 0x0100, position)) return;
  const nextWord = (words.base & 0xf800) | 0xb0;
  cell[0] = nextWord & 0xff;
  cell[1] = nextWord >> 8;
  dragState.placed.add(key);
  state.funds -= 15;
  mapDirty = true;
  playToolPlacementSound();
}

function seedSimRandom() {
  // Initial DAT_6190_1b79 word in the executable's data image.
  return 0x001b;
}

function seedSimSecondaryRandom() {
  // Root startup replaces the data-image0x2345 with Borland time()'s low
  // word, before adding that same seed's low bits to the terrain history.
  return initialProcessRandomSeed;
}

function seedSimSmallRandom() {
  // Initial DAT_6190_1b98 state used by FUN_05fd_00a3.
  return 0x0033;
}

function decayWeeklyWindBoost() {
  // 19ab:1390..13a0 clamps values below two to zero and otherwise
  // subtracts two on each completed week.
  state.windBoost = state.windBoost < 2 ? 0 : state.windBoost - 2;
}

function nextSimRandom() {
  // Exact 15fd:007d routine: eight right shifts, feeding bit 15 with the
  // exclusive-or of the prior bits 1 and 2.
  for (let round = 0; round < 8; round += 1) {
    const feedback = ((simRandomState >> 1) ^ (simRandomState >> 2)) & 1;
    simRandomState = ((simRandomState >>> 1) | (feedback << 15)) & 0xffff;
  }
  return simRandomState;
}

function biosClockTick(now = Date.now()) {
  // Despite older notes calling this a BIOS tick, DS:13a0 is the game's
  // custom 50 Hz timer. It continues while calendar speed is Pause.
  return Math.floor(now / nativeClockTickMilliseconds) & 0xffff;
}

function resetCalendarTimer(now = Date.now()) {
  calendarLastTick = biosClockTick(now);
}

function advanceCalendarTimer(now = Date.now()) {
  if (state.speed === "Pause") return false;
  const tick = biosClockTick(now);
  const elapsed = (tick - calendarLastTick) & 0xffff;
  if (elapsed <= calendarIntervalTicks) return false;
  // 19ab:0bde accepts at most one day per callback and stores the current
  // tick after the complete synchronous daily update; it never catches up.
  advanceSimulationDay();
  calendarLastTick = tick;
  return true;
}

function resetLivestockTimer(now = Date.now()) {
  if (livestockTickThresholds[state.speed] !== undefined) {
    livestockIntervalTicks = livestockTickThresholds[state.speed];
  }
  livestockLastTick = biosClockTick(now);
}

function advanceLivestockTimer(now = Date.now()) {
  const tick = biosClockTick(now);
  if (((tick - livestockLastTick) & 0xffff) < livestockIntervalTicks)
    return false;
  livestockLastTick = tick;
  return advanceLivestockTick(now);
}

function resetTownTrafficTimer(now = Date.now()) {
  townTrafficLastTick = biosClockTick(now);
}

function advanceTownTrafficTimer(now = Date.now()) {
  const tick = biosClockTick(now);
  const elapsed = (tick - townTrafficLastTick) & 0xffff;
  if (livestockIntervalTicks !== 1 && elapsed < livestockIntervalTicks)
    return false;
  townTrafficLastTick = tick;
  return advanceTownTrafficTick();
}

function resetStartupStageTimer(now = Date.now()) {
  startupStageStartedAt = now;
}

function advanceStartupStageTick(now = Date.now()) {
  if (stage !== "presents" && stage !== "title") return false;
  if (now - startupStageStartedAt < startupStageTimeoutMs) return false;
  stage = stage === "presents" ? "title" : "region";
  startupStageStartedAt = now;
  return true;
}

function resetMapTileAnimationTimer(now = Date.now()) {
  mapTileAnimationPhase = 0;
  mapTileAnimationLastTick = biosClockTick(now);
}

function holdMapTileAnimationTimer(now = Date.now()) {
  mapTileAnimationLastTick = biosClockTick(now);
}

function advanceMapTileAnimationTick(now = Date.now()) {
  const tick = biosClockTick(now);
  const elapsed = (tick - mapTileAnimationLastTick) & 0xffff;
  if (elapsed <= mapTileAnimationIntervalTicks) return false;
  mapTileAnimationLastTick = tick;
  mapTileAnimationPhase ^= 1;
  return true;
}

function animatedMapTileIndex(tileIndex) {
  if (mapTileAnimationPhase === 0) return tileIndex;
  // A complete 0..758 controlled atlas leaves every other base ID static.
  // These three two-frame families are substituted by the tile renderer;
  // their words in the 96x96 farm map are never rewritten or serialized.
  if (tileIndex === 0x37 || tileIndex === 0x73 || tileIndex === 0x78)
    return tileIndex + 1;
  if (tileIndex === 0x38 || tileIndex === 0x74 || tileIndex === 0x79)
    return tileIndex - 1;
  return tileIndex;
}
