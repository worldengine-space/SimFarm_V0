// Structures, livestock behavior, feeding, and item placement.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function placePurchasedStructureAtPoint(item, point) {
  if (
    item.id !== 0x46 &&
    item.id !== 0x47 &&
    !structureBaseTileStarts.has(item.id)
  ) {
    return false;
  }
  const pointerPosition = mapCellForPointer(point);
  const offset = structurePlacementOffsets.get(item.id);
  if (!pointerPosition || !offset) return false;
  const x = pointerPosition.x + offset[0];
  const y = pointerPosition.y + offset[1];
  if (!structureFootprintIsValid(item, x, y)) return false;
  if (state.funds < item.price) {
    setQuickMessage(0x2a);
    return false;
  }
  autoDozeStructureFootprint(item, x, y);
  if (!structureWriterFootprintIsValid(item, x, y)) return false;
  if (!allocateStructureRecord(item, x, y)) return false;

  writeStructureFootprint(item, x, y);
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.structureCountOffset,
    saveView.getUint16(saveData.format.structureCountOffset, true) + 1,
    true,
  );
  const definitionView = stateView(item.record);
  definitionView.setUint16(4, definitionView.getUint16(4, true) + 1, true);
  state.funds -= item.price;
  state.bankStructureCollateral += item.price;
  mapDirty = true;
  message = "";
  playToolPlacementSound();
  return true;
}

function writeStructureStorageItem(
  structure,
  storageSlot,
  item,
  displayTile,
  ownerSlot,
) {
  const view = stateView(structure.record);
  view.setUint16(10 + storageSlot * 2, displayTile, true);
  view.setUint16(34 + storageSlot * 2, item.id, true);
  structure.record[58 + storageSlot] = ownerSlot;
  // Masked stored items also write their logical tile into the display
  // cell's overlay word. The building base flag remains untouched: this
  // word is serialized occupancy metadata unless the specific livestock
  // storage path explicitly enables masked rendering.
  if (displayTile >= 0x0350) {
    const position = structureStoragePosition(structure, storageSlot);
    const cell = mapCell(position.x, position.y);
    if (cell) {
      const overlay = (tileWords(cell).overlay & 0xf800) | displayTile;
      cell[2] = overlay & 0xff;
      cell[3] = overlay >> 8;
    }
  }
  refreshOpenStructureStorageCell(structure, storageSlot);
}

function structureStoragePosition(structure, storageSlot) {
  return {
    x: structure.record[4] + Math.floor(storageSlot / 3),
    y: structure.record[5] + (storageSlot % 3),
  };
}

function firstFreeStorageLotSlot() {
  for (let slot = 1; slot < saveData.format.storageLotRecordCount; slot += 1) {
    if ((storageLotRecord(slot)[10] & 0x20) === 0) return slot;
  }
  return -1;
}

function initializeStorageLot(record, item, position, active) {
  const view = stateView(record);
  view.setUint16(0, item.id, true);
  view.setUint16(2, 10, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  record[8] = position.x;
  record[9] = position.y;
  record[10] = active ? 0x20 : 0;
}

function firstFreeChemicalStorageSlot() {
  for (
    let slot = 1;
    slot < saveData.format.chemicalStorageRecordCount;
    slot += 1
  ) {
    if (
      (stateView(chemicalStorageRecord(slot)).getUint16(2, true) & 0x20) ===
      0
    )
      return slot;
  }
  return -1;
}

function initializeChemicalStorageRecord(
  record,
  item,
  position,
  storedInStructure,
) {
  const view = stateView(record);
  view.setUint16(0, item.id, true);
  view.setUint16(2, storedInStructure ? 0x24 : 0, true);
  record[4] = 0;
  record[5] = position.x;
  record[6] = position.y;
  view.setUint16(8, 0, true);
  view.setUint16(14, 0, true);
  view.setUint16(16, 0, true);
  view.setUint16(18, 0x18, true);
}

function chargeOperationSupply(categoryKey, amount) {
  if (!state.options.AutoBuy || !farmStateBytes || state.funds < amount)
    return false;
  const saveView = stateView(farmStateBytes);
  const expenseOffset =
    categoryKey === "seed"
      ? saveData.format.seedPurchaseExpenseOffset
      : saveData.format.chemicalPurchaseExpenseOffset;
  saveView.setUint32(
    expenseOffset,
    saveView.getUint32(expenseOffset, true) + amount,
    true,
  );
  state.funds -= amount;
  return true;
}

function consumeStoredSeed(cropSlot) {
  if (
    !farmStateBytes ||
    cropSlot < 0 ||
    cropSlot >= saveData.format.seedItemDefinitionCount
  ) {
    return false;
  }
  const id = 0x00c0 + cropSlot;
  for (let slot = 1; slot < saveData.format.storageLotRecordCount; slot += 1) {
    const record = storageLotRecord(slot);
    if (
      (record[10] & 0x20) === 0 ||
      stateView(record).getUint16(0, true) !== id
    )
      continue;
    const x = record[8];
    const y = record[9];
    if (!clearStructureStorageCell(x, y)) clearRenderedOccupancy(x, y);
    record[10] &= ~0x20;
    const saveView = stateView(farmStateBytes);
    saveView.setUint16(
      saveData.format.storageLotCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.storageLotCountOffset, true) - 1,
      ),
      true,
    );
    const definition = itemDefinitionForKeyAndId("seed", id);
    if (definition) {
      const definitionView = stateView(definition.record);
      definitionView.setUint16(
        4,
        Math.max(0, definitionView.getUint16(4, true) - 1),
        true,
      );
    }
    mapDirty = true;
    return true;
  }
  const definition = itemDefinitionForKeyAndId("seed", id);
  return (
    Boolean(definition) && chargeOperationSupply("seed", definition.price + 20)
  );
}

function consumeStoredChemical(id) {
  if (!farmStateBytes || id < 0x00dc || id > 0x00df) return false;
  for (
    let slot = 1;
    slot < saveData.format.chemicalStorageRecordCount;
    slot += 1
  ) {
    const record = chemicalStorageRecord(slot);
    const view = stateView(record);
    if (
      (view.getUint16(2, true) & 0x20) === 0 ||
      view.getUint16(0, true) !== id
    )
      continue;
    const x = record[5];
    const y = record[6];
    if (!clearStructureStorageCell(x, y)) clearRenderedOccupancy(x, y);
    view.setUint16(2, view.getUint16(2, true) & ~0x20, true);
    const saveView = stateView(farmStateBytes);
    saveView.setUint16(
      saveData.format.chemicalStorageCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.chemicalStorageCountOffset, true) -
          1,
      ),
      true,
    );
    const definition = itemDefinitionForKeyAndId("chemical", id);
    if (definition) {
      const definitionView = stateView(definition.record);
      definitionView.setUint16(
        4,
        Math.max(0, definitionView.getUint16(4, true) - 1),
        true,
      );
    }
    mapDirty = true;
    return true;
  }
  return chargeOperationSupply("chemical", 275);
}

function placePurchasedSeedAtPoint(item, point) {
  const position = mapCellForPointer(point);
  if (!position) return false;
  if (state.funds < item.price) {
    setQuickMessage(0x2a);
    return false;
  }
  const lotSlot = firstFreeStorageLotSlot();
  if (lotSlot < 0) return false;
  const structure = structureAtPosition(position);
  const storageSlot = structure ? firstFreeStructureStorageSlot(structure) : -1;
  if (
    !structure ||
    (structure.id !== 0x40 && structure.id !== 0x41) ||
    storageSlot < 0
  ) {
    // The original allocator leaves these attempted fields behind after its
    // caller rejects a non-silo target and clears the active bit/count.
    initializeStorageLot(storageLotRecord(lotSlot), item, position, false);
    // FUN_1a66_048a posts record 65 when a storage insertion was attempted
    // against an existing incompatible or full structure. Bare-ground
    // rejection takes the separate direct-footprint path and retains the
    // prior quick message.
    if (structure) setQuickMessage(0x41);
    return false;
  }

  const storagePosition = structureStoragePosition(structure, storageSlot);
  initializeStorageLot(storageLotRecord(lotSlot), item, storagePosition, true);
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.storageLotCountOffset,
    saveView.getUint16(saveData.format.storageLotCountOffset, true) + 1,
    true,
  );
  writeStructureStorageItem(
    structure,
    storageSlot,
    item,
    0x0340 + (item.id - 0xc0),
    lotSlot,
  );
  const definitionView = stateView(item.record);
  definitionView.setUint16(4, definitionView.getUint16(4, true) + 1, true);
  saveView.setUint32(
    saveData.format.seedPurchaseExpenseOffset,
    saveView.getUint32(saveData.format.seedPurchaseExpenseOffset, true) +
      item.price,
    true,
  );
  state.funds -= item.price;
  mapDirty = true;
  message = "";
  // 2a66:0436 starts PLPITEM before the enclosing handler reaches its
  // generic PLPTOOL call. The native single VOC voice keeps the first
  // sample, so paid storage placement audibly emits PLPITEM only.
  play("plopitem");
  return true;
}

function placePurchasedChemicalAtPoint(item, point) {
  const position = mapCellForPointer(point);
  if (!position) return false;
  if (state.funds < item.price) {
    setQuickMessage(0x2a);
    return false;
  }
  const chemicalSlot = firstFreeChemicalStorageSlot();
  if (chemicalSlot < 0) return false;
  const structure = structureAtPosition(position);
  const storageSlot = structure ? firstFreeStructureStorageSlot(structure) : -1;
  if (
    !structure ||
    structure.id < 0x42 ||
    structure.id > 0x45 ||
    storageSlot < 0
  ) {
    initializeChemicalStorageRecord(
      chemicalStorageRecord(chemicalSlot),
      item,
      position,
      false,
    );
    if (structure) setQuickMessage(0x41);
    return false;
  }

  const storagePosition = structureStoragePosition(structure, storageSlot);
  initializeChemicalStorageRecord(
    chemicalStorageRecord(chemicalSlot),
    item,
    storagePosition,
    true,
  );
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.chemicalStorageCountOffset,
    saveView.getUint16(saveData.format.chemicalStorageCountOffset, true) + 1,
    true,
  );
  writeStructureStorageItem(
    structure,
    storageSlot,
    item,
    0x0393 - (item.id - 0xdc),
    chemicalSlot,
  );
  const definitionView = stateView(item.record);
  definitionView.setUint16(4, definitionView.getUint16(4, true) + 1, true);
  saveView.setUint32(
    saveData.format.chemicalPurchaseExpenseOffset,
    saveView.getUint32(saveData.format.chemicalPurchaseExpenseOffset, true) +
      item.price,
    true,
  );
  state.funds -= item.price;
  mapDirty = true;
  message = "";
  play("plopitem");
  return true;
}

function allocateLivestockRecord(item, position) {
  let slot = -1;
  for (
    let candidate = 1;
    candidate < saveData.format.objectRecordCount;
    candidate += 1
  ) {
    if ((stateView(objectRecord(candidate)).getUint16(2, true) & 0x20) === 0) {
      slot = candidate;
      break;
    }
  }
  if (slot < 0) return null;

  const record = objectRecord(slot);
  const view = stateView(record);
  record[0] = position.x;
  record[1] = position.y;
  view.setUint16(6, item.id, true);
  record[4] = nextSimRandom() & 7;
  record[5] = 1;
  record[8] = 0xff;
  view.setUint16(10, 0, true);
  record[12] = 1;
  record[13] = 0;
  record[14] = 0;
  view.setUint16(16, 0, true);
  record[18] = 0;
  view.setUint16(20, 0, true);
  view.setUint16(2, 0x20, true);
  view.setUint16(26, livestockRecordValues.get(item.id), true);
  record[28] = 0;
  if ((nextSimSecondaryRandom() & 1) !== 0) record[2] |= 2;
  return record;
}

function registerAllocatedLivestock(item, born = false) {
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.objectCountOffset,
    saveView.getUint16(saveData.format.objectCountOffset, true) + 1,
    true,
  );
  const definitionView = stateView(item.record);
  definitionView.setUint16(4, definitionView.getUint16(4, true) + 1, true);
  livestockAssetValue =
    ((livestockAssetValue >>> 0) + (item.price >>> 0)) >>> 0;
  if (born) {
    const offset = saveData.format.livestockPurchaseExpenseOffset1;
    saveView.setUint32(
      offset,
      saveView.getUint32(offset, true) + item.price,
      true,
    );
  }
}

function activeLivestockRecords() {
  const livestock = [];
  if (!farmStateBytes || !saveData) return livestock;
  for (let slot = 1; slot < saveData.format.objectRecordCount; slot += 1) {
    const record = objectRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    const definition = livestockSimulationDefinitions.get(
      view.getUint16(6, true),
    );
    if (definition) livestock.push({ slot, record, view, definition });
  }
  return livestock;
}

function livestockAtPosition(position) {
  if (!position) return null;
  return (
    activeLivestockRecords().find(
      ({ record }) => record[0] === position.x && record[1] === position.y,
    ) || null
  );
}

function clearLivestockMapOccupancy(record) {
  const cell = mapCell(record[0], record[1]);
  if (!cell) return;
  const view = stateView(cell);
  view.setUint16(0, view.getUint16(0, true) & ~0x0800, true);
}

function removeLivestockRecord(slot) {
  const record = objectRecord(slot);
  if (!record) return false;
  const view = stateView(record);
  if ((view.getUint16(2, true) & 0x20) === 0) return false;
  const item = itemDefinitionForKeyAndId("livestock", view.getUint16(6, true));
  if ((view.getUint16(2, true) & 4) !== 0)
    clearStructureStorageCell(record[0], record[1]);
  else clearLivestockMapOccupancy(record);
  if (item) {
    livestockAssetValue =
      ((livestockAssetValue >>> 0) -
        (livestockCurrentValue(record, item) >>> 0)) >>>
      0;
  }
  view.setUint16(2, view.getUint16(2, true) & ~0x20, true);
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.objectCountOffset,
    Math.max(
      0,
      saveView.getUint16(saveData.format.objectCountOffset, true) - 1,
    ),
    true,
  );
  if (item) {
    const definitionView = stateView(item.record);
    definitionView.setUint16(
      4,
      Math.max(0, definitionView.getUint16(4, true) - 1),
      true,
    );
  }
  mapDirty = true;
  return true;
}

function playLivestockVoice(id, definition) {
  if (!definition?.sounds?.length) return;
  const index = definition.sounds.length === 1 ? 0 : nextSimRandom() & 1;
  play(definition.sounds[index]);
}

function playWeeklyBirdSound() {
  // FUN_19ab_010e makes one primary-LFSR call for the 25% gate, then a
  // second only on success. A set low bit selects BIRD1; clear selects BIRD2.
  if ((nextSimRandom() & 3) !== 2) return null;
  const name = (nextSimRandom() & 1) !== 0 ? "bird1" : "bird2";
  play(name);
  return name;
}

function advanceLivestockNeeds(
  temperature = state.currentTemperature ?? currentWeatherTemperature(),
) {
  let changed = false;
  for (const { record, definition } of activeLivestockRecords()) {
    record[13] = Math.min(0xff, record[13] + definition.foodIncrement);
    record[14] = Math.min(0xff, record[14] + definition.waterIncrement);
    const status = stateView(record).getUint16(2, true);
    if ((temperature < 32 || temperature > 95) && (status & 4) === 0) {
      record[8] = Math.max(0, record[8] - 5);
    }
    changed = true;
  }
  return changed;
}

function advanceLivestockMating() {
  let changed = false;
  for (const { record, view, definition } of activeLivestockRecords()) {
    const status = view.getUint16(2, true);
    if (
      (status & 2) === 0 ||
      (status & 1) !== 0 ||
      view.getUint16(10, true) <= definition.maturity ||
      record[8] <= 110
    )
      continue;
    view.setUint16(2, status | 1, true);
    record[28] = 0;
    changed = true;
  }
  return changed;
}

function advanceLivestockPregnancies() {
  const births = [];
  let changed = false;
  for (const { record, view, definition } of activeLivestockRecords()) {
    const status = view.getUint16(2, true);
    if ((status & 3) !== 3) continue;
    record[28] = (record[28] + 1) & 0xff;
    changed = true;
    if (record[28] <= definition.gestation) continue;
    view.setUint16(2, status & ~1, true);
    record[28] = 0;
    births.push({ x: record[0], y: record[1], id: view.getUint16(6, true) });
  }
  for (const birth of births) {
    const item = itemDefinitionForKeyAndId("livestock", birth.id);
    if (!item) continue;
    const child = allocateLivestockRecord(item, birth);
    if (child) registerAllocatedLivestock(item, true);
  }
  return changed || births.length !== 0;
}

function advanceLivestockWeek() {
  let changed = false;
  for (const { slot, record, view, definition } of activeLivestockRecords()) {
    if ((nextSimSecondaryRandom() & 0x7f) === 0x4b) {
      playLivestockVoice(view.getUint16(6, true), definition);
    }
    const age = (view.getUint16(10, true) + 1) & 0xffff;
    view.setUint16(10, age, true);
    if (age > definition.maturity) record[18] = 1;
    if (age > definition.lifespan) removeLivestockRecord(slot);
    changed = true;
  }
  return advanceLivestockPregnancies() || changed;
}

function livestockSquaredDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

function resetLivestockHerdRuntime(now = Date.now()) {
  nextLivestockHerdAt = now + livestockHerdInterval;
  livestockHerdTargets = new Map([
    [0xa0, { x: 0, y: 0 }],
    [0xa1, { x: 0, y: 0 }],
    [0xa2, { x: 0, y: 0 }],
    [0xa3, { x: 0, y: 0 }],
  ]);
}

function nearestLivestockSupply(id, x, y) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (let slot = 1; slot < saveData.format.storageLotRecordCount; slot += 1) {
    const record = storageLotRecord(slot);
    const view = stateView(record);
    if (
      (record[10] & 0x20) === 0 ||
      view.getUint16(0, true) !== id ||
      view.getUint16(2, true) === 0
    )
      continue;
    const distance = livestockSquaredDistance(x, y, record[8], record[9]);
    // 2303:03b4 keeps the first slot when distances tie.
    if (distance >= nearestDistance) continue;
    nearestDistance = distance;
    nearest = { slot, record, x: record[8], y: record[9], distance };
  }
  return nearest;
}

function nearestLivestockStructure(id, x, y) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (let slot = 1; slot < saveData.format.structureRecordCount; slot += 1) {
    const record = structureRecord(slot);
    const view = stateView(record);
    if (
      (view.getUint16(2, true) & 0x20) === 0 ||
      view.getUint16(0, true) !== id
    )
      continue;
    const distance = livestockSquaredDistance(x, y, record[4], record[5]);
    if (distance >= nearestDistance) continue;
    const definition = itemDefinitionForKeyAndId("structure", id);
    if (!definition) continue;
    nearestDistance = distance;
    nearest = {
      slot,
      record,
      id,
      definition,
      x: record[4],
      y: record[5],
      distance,
    };
  }
  return nearest;
}

function livestockDirectionForTarget(record, target, away = false) {
  if (!target) return record[4] & 7;
  const dx = Math.sign(target.x - record[0]);
  const dy = Math.sign(target.y - record[1]);
  if (dx === 0 && dy === 0) return record[4] & 7;
  let direction = livestockDirectionDeltas.findIndex(
    ([candidateX, candidateY]) => candidateX === dx && candidateY === dy,
  );
  if (direction < 0) direction = record[4] & 7;
  return away ? livestockSpriteDirections[direction] : direction;
}

function livestockPointerTarget() {
  // FUN_1f87_015e converts the live mouse coordinates through the open map
  // viewport. Outside that viewport its two target words are both zero.
  const editPointer = gameWindowPoint(pointer, editWindowSentinel);
  if (
    editPointer.x <= 80 ||
    editPointer.x >= 608 ||
    editPointer.y <= 80 ||
    editPointer.y >= 448
  ) {
    return { x: 0, y: 0 };
  }
  return {
    x: Math.max(
      0,
      Math.min(95, camera.x + Math.floor((editPointer.x - 80) / 16)),
    ),
    y: Math.max(
      0,
      Math.min(95, camera.y + Math.floor((editPointer.y - 80) / 16)),
    ),
  };
}

function rebuildLivestockHerdTargets() {
  // The DOS routine indexes these scratch bytes with the literal item IDs.
  // Its horse entry consequently overlaps the four count bytes; reproducing
  // that original indexing bug matters to RNG order and mixed-species herds.
  const addressBase = 0x22f7;
  const scratch = new Uint8Array(0x230c - addressBase);
  const scratchView = stateView(scratch);
  const byteOffset = (address) => address - addressBase;
  const readWord = (address) =>
    scratchView.getUint16(byteOffset(address), true);
  const writeWord = (address, value) => {
    scratchView.setUint16(byteOffset(address), value & 0xffff, true);
  };

  for (const { record, view } of activeLivestockRecords()) {
    const id = view.getUint16(6, true);
    const sumAddress = 0x2078 + id * 4;
    const countAddress = 0x2257 + id;
    if (
      sumAddress < addressBase ||
      sumAddress + 3 >= 0x230c ||
      countAddress < addressBase ||
      countAddress >= 0x230c
    )
      continue;
    writeWord(sumAddress, readWord(sumAddress) + record[0]);
    writeWord(sumAddress + 2, readWord(sumAddress + 2) + record[1]);
    scratch[byteOffset(countAddress)] =
      (scratch[byteOffset(countAddress)] + 1) & 0xff;
  }

  for (let group = 0; group < 4; group += 1) {
    const count = scratch[byteOffset(0x22f8 + group)];
    // The original JLE treats the byte as signed.
    if (count === 0 || count >= 0x80) continue;
    const targetAddress = 0x22fc + group * 4;
    writeWord(
      targetAddress,
      Math.floor(readWord(targetAddress) / count) + (nextSimRandom() & 3),
    );
    writeWord(
      targetAddress + 2,
      Math.floor(readWord(targetAddress + 2) / count) + (nextSimRandom() & 3),
    );
  }

  const targetAt = (address) => ({
    x: readWord(address),
    y: readWord(address + 2),
  });
  livestockHerdTargets = new Map([
    [0xa0, targetAt(0x2304)],
    [0xa1, targetAt(0x22fc)],
    [0xa2, targetAt(0x2300)],
    [0xa3, targetAt(0x2308)],
  ]);
  return true;
}

function livestockMovementTarget(record, definition) {
  let target = null;
  if (record[14] > definition.waterMaximum >> 4) {
    const supply = nearestLivestockSupply(299, record[0], record[1]);
    if (supply) target = supply;
    for (const id of [0x44, 0x45]) {
      const structure = nearestLivestockStructure(id, record[0], record[1]);
      if (structure && (!target || structure.distance < target.distance))
        target = structure;
    }
    if (target) {
      record[4] = livestockDirectionForTarget(record, target);
      if ((nextSimSecondaryRandom() & 0x0f) === 3)
        record[4] = (record[4] + 1) & 7;
    }
    return target;
  }

  if (record[13] > definition.foodMaximum >> 4) {
    const supply = nearestLivestockSupply(300, record[0], record[1]);
    if (supply) {
      target = supply;
      record[4] = livestockDirectionForTarget(record, target);
      if ((nextSimSecondaryRandom() & 0x0f) === 6)
        record[4] = (record[4] + 1) & 7;
      return target;
    }
    const field = fieldAtPosition({ x: record[0], y: record[1] });
    if (field) {
      target = {
        x: field.record[10] + (nextSimRandom() & 7) + 2,
        y: field.record[11] + (nextSimRandom() & 7) + 2,
      };
      record[4] = livestockDirectionForTarget(record, target);
    }
    return target;
  }

  const pointerTarget = livestockPointerTarget();
  const id = stateView(record).getUint16(6, true);
  target = livestockHerdTargets.get(id) || { x: 0, y: 0 };
  if (
    livestockSquaredDistance(
      record[0],
      record[1],
      pointerTarget.x,
      pointerTarget.y,
    ) < 50
  ) {
    record[4] = livestockDirectionForTarget(record, pointerTarget, true);
  } else if (
    livestockSquaredDistance(record[0], record[1], target.x, target.y) > 40
  ) {
    const chance = nextSimRandom() & 7;
    if (chance < 4) record[4] = livestockDirectionForTarget(record, target);
  }
  return target;
}

function isLivestockTerrainAllowed(x, y) {
  const cell = mapCell(x, y);
  if (!cell) return false;
  const words = tileWords(cell);
  const tile = words.base & 0x07ff;
  const overlay = words.overlay & 0x07ff;
  const allowedTile =
    (tile >= 0xaf && tile < 0xb1) ||
    (tile >= 0x0f && tile <= 0x1f) ||
    (tile >= 0x96 && tile <= 0xac) ||
    (tile >= 0x217 && tile <= 0x21b) ||
    (tile >= 0x83 && tile <= 0x93) ||
    (tile >= 0x2a8 && tile <= 0x348) ||
    tile === 0xbd ||
    tile === 0xbf ||
    tile === 0xc0 ||
    tile === 0xc1 ||
    tile === 0x24 ||
    tile === 0x0c;
  // The native range endpoints collapse to 0x3c2 here, an observable
  // collision quirk rather than a general animal-overlay exemption.
  return allowedTile && ((words.base & 0x0800) === 0 || overlay === 0x3c2);
}

function livestockSpriteTile(record, special) {
  const id = stateView(record).getUint16(6, true);
  if (special) return id + 0x36e;
  const start = livestockInitialTiles.get(id);
  return start === undefined ? 0 : start + (record[4] & 7) * 2 + record[18];
}

function writeLivestockAtCell(record, cell, special) {
  const view = stateView(cell);
  const words = tileWords(cell);
  view.setUint16(
    2,
    (words.overlay & 0xf800) | livestockSpriteTile(record, special),
    true,
  );
  view.setUint16(0, words.base | 0x0800, true);
}

function enterLivestockBarn(slot, record, structure) {
  const storageSlot = firstFreeStructureStorageSlot(structure);
  if (storageSlot < 0) return false;
  const id = stateView(record).getUint16(6, true);
  const displayTile = livestockInitialTiles.get(id);
  if (displayTile === undefined) return false;
  writeStructureStorageItem(structure, storageSlot, { id }, displayTile, slot);
  const position = structureStoragePosition(structure, storageSlot);
  record[0] = position.x;
  record[1] = position.y;
  const view = stateView(record);
  view.setUint16(2, view.getUint16(2, true) | 4, true);
  view.setUint16(16, structure.slot, true);
  mapDirty = true;
  return true;
}

function exitLivestockBarn(record) {
  const view = stateView(record);
  const structureSlot = view.getUint16(16, true);
  const structureRecordBytes = structureRecord(structureSlot);
  if (!structureRecordBytes) return false;
  const structureView = stateView(structureRecordBytes);
  const id = structureView.getUint16(0, true);
  const definition = itemDefinitionForKeyAndId("structure", id);
  if ((structureView.getUint16(2, true) & 0x20) === 0 || !definition)
    return false;
  const structure = {
    slot: structureSlot,
    record: structureRecordBytes,
    id,
    definition,
  };
  const candidates = [
    { x: structureRecordBytes[4] - 1, y: structureRecordBytes[5] },
    { x: structureRecordBytes[4] - 1, y: structureRecordBytes[5] + 1 },
    { x: structureRecordBytes[4] - 1, y: structureRecordBytes[5] + 2 },
  ];
  const destination = candidates.find(({ x, y }) =>
    isLivestockTerrainAllowed(x, y),
  );
  if (!destination) return false;
  clearStructureStorageCell(record[0], record[1]);
  view.setUint16(2, view.getUint16(2, true) & ~4, true);
  record[0] = destination.x;
  record[1] = destination.y;
  mapDirty = true;
  return true;
}

function damageCropUnderLivestock(record, originalTile) {
  if (originalTile < 0x2a8 || originalTile > 0x348) return false;
  const field = fieldAtPosition({ x: record[0], y: record[1] });
  if (!field) return false;
  const definition = cropSimulationDefinitionForSlot(field.record[14]);
  if (!definition || (definition.perennialFlags & 4) !== 0) return false;
  const fieldView = fieldRecordView(field.record);
  fieldView.setUint16(
    18,
    Math.min(0xffff, fieldView.getUint16(18, true) + 0x0400),
    true,
  );
  const cell = mapCell(record[0], record[1]);
  const words = tileWords(cell);
  stateView(cell).setUint16(0, (words.base & 0xf800) | 0x24, true);
  record[13] = 0;
  return true;
}

function advanceLivestockMovement(slot, now = Date.now()) {
  const record = objectRecord(slot);
  if (!record) return false;
  const view = stateView(record);
  const status = view.getUint16(2, true);
  const id = view.getUint16(6, true);
  const definition = livestockSimulationDefinitions.get(id);
  if ((status & 0x20) === 0 || !definition || (status & 4) !== 0) return false;

  let special = (status & 8) !== 0;
  if (special) {
    const elapsed = (biosClockTick(now) - view.getUint16(30, true)) & 0xffff;
    if (elapsed > livestockSpecialDurationTicks) {
      view.setUint16(2, view.getUint16(2, true) & ~8, true);
      playLivestockVoice(id, definition);
      special = false;
    }
  }

  // The stack locals begin as (0xffff, 0). Edge handling uses that sentinel
  // even when countdown motion or a failed resource search chose no target.
  let target = { x: 0xffff, y: 0 };
  if (record[5] !== 0) {
    record[4] = nextSimRandom() & 7;
    record[5] = (record[5] - 1) & 0xff;
  } else {
    target = livestockMovementTarget(record, definition) || target;
  }

  const [dx, dy] = livestockDirectionDeltas[record[4] & 7];
  const destinationX = record[0] + dx;
  const destinationY = record[1] + dy;
  if (
    destinationX < 0 ||
    destinationX >= 96 ||
    destinationY < 0 ||
    destinationY >= 96
  ) {
    record[4] = livestockDirectionForTarget(record, target);
    return true;
  }

  const destinationCell = mapCell(destinationX, destinationY);
  const destinationWords = tileWords(destinationCell);
  const destinationTile = destinationWords.base & 0x07ff;
  const isBarnTile =
    (destinationTile >= 0x1cc && destinationTile < 0x1d5) ||
    (destinationTile >= 0x1d5 && destinationTile < 0x1e1) ||
    destinationTile === 0xd9;
  if (isBarnTile) {
    const structure = structureAtPosition({ x: destinationX, y: destinationY });
    if (!structure || (structure.id !== 0x44 && structure.id !== 0x45))
      return false;
    clearLivestockMapOccupancy(record);
    return enterLivestockBarn(slot, record, structure);
  }

  if (!isLivestockTerrainAllowed(destinationX, destinationY)) {
    if (
      destinationTile >= livestockFenceStart &&
      destinationTile < livestockFenceStart + livestockFenceCount &&
      (record[13] > definition.foodMaximum >> 1 ||
        record[14] > definition.waterMaximum >> 1) &&
      (nextSimSecondaryRandom() & 0x7f) === 5
    ) {
      stateView(destinationCell).setUint16(
        0,
        (destinationWords.base & 0xf800) | 0xc0,
        true,
      );
      setQuickMessage(0x43);
    }
    record[4] = (record[4] + (nextSimSecondaryRandom() & 7)) & 7;
    record[5] = 8;
    const currentCell = mapCell(record[0], record[1]);
    clearLivestockMapOccupancy(record);
    writeLivestockAtCell(record, currentCell, special);
    mapDirty = true;
    return true;
  }

  clearLivestockMapOccupancy(record);
  writeLivestockAtCell(record, destinationCell, special);
  record[0] = destinationX;
  record[1] = destinationY;
  damageCropUnderLivestock(record, destinationTile);
  mapDirty = true;
  return true;
}

function advanceLivestockTick(now = Date.now()) {
  if (!farmStateBytes || !saveData) return false;
  if (now >= nextLivestockHerdAt) {
    rebuildLivestockHerdTargets();
    nextLivestockHerdAt = now + livestockHerdInterval;
  }
  let changed = false;
  for (const { slot, record, view } of activeLivestockRecords()) {
    if ((view.getUint16(2, true) & 4) !== 0) {
      if (record[14] !== 0) {
        record[14] = 0;
        changed = true;
      }
      if ((nextSimRandom() & 7) === 5)
        changed = exitLivestockBarn(record) || changed;
      continue;
    }
    changed = advanceLivestockMovement(slot, now) || changed;
    changed = advanceLivestockFeeding(slot) || changed;
  }
  return changed;
}

function consumeLivestockSupply(animal, supplyId) {
  const needOffset = supplyId === 299 ? 14 : 13;
  const x0 = animal[0];
  const y0 = animal[1];
  for (let x = x0 - 2; x <= x0 + 2; x += 1) {
    for (let y = y0 - 2; y <= y0 + 2; y += 1) {
      const cell = mapCell(x, y);
      if (!cell) continue;
      const words = tileWords(cell);
      const visualMatch =
        supplyId === 299
          ? (words.base & 0x07ff) === 0xb0
          : (words.overlay & 0x07ff) >= 0x3fc &&
            (words.overlay & 0x07ff) <= 0x400;
      if (!visualMatch) continue;
      const entry = storageLotAtPosition(x, y, supplyId);
      if (entry) {
        const supplyView = stateView(entry.record);
        const quantity = supplyView.getUint16(2, true);
        const need = animal[needOffset];
        supplyView.setUint16(2, need < quantity ? quantity - need : 0, true);
        const remaining = supplyView.getUint16(2, true);
        if (supplyId === 299 && remaining === 0) {
          stateView(cell).setUint16(0, (words.base & 0xf800) | 0xaf, true);
        } else if (supplyId === 300 && remaining === 0) {
          stateView(cell).setUint16(0, words.base & ~0x0800, true);
          stateView(cell).setUint16(2, words.overlay & 0xf800, true);
          removeLivestockSupplyRecord(entry);
        } else if (supplyId === 300) {
          let tier = 0;
          if (remaining < 102) tier = 4;
          else if (remaining < 206) tier = 3;
          else if (remaining < 308) tier = 2;
          else if (remaining < 410) tier = 1;
          stateView(cell).setUint16(
            2,
            (words.overlay & 0xf800) | (0x3fc + tier),
            true,
          );
        }
      }
      animal[needOffset] = 0;
      mapDirty = true;
      return true;
    }
  }
  return false;
}

function advanceLivestockFeeding(slot) {
  const animal = objectRecord(slot);
  if (!animal) return false;
  const view = stateView(animal);
  if ((view.getUint16(2, true) & 0x20) === 0) return false;
  const definition = livestockSimulationDefinitions.get(
    view.getUint16(6, true),
  );
  if (!definition) return false;
  let changed = false;
  if (animal[14] !== 0) {
    if ((view.getUint16(2, true) & 4) !== 0) {
      animal[13] = 0;
      animal[14] = 0;
      animal[8] = Math.min(0xff, animal[8] + 30);
      changed = true;
    } else if (consumeLivestockSupply(animal, 299)) {
      changed = true;
    } else if (
      animal[14] > definition.waterMaximum >> 1 &&
      animal[14] < definition.waterMaximum
    ) {
      setQuickMessage(0x39);
      animal[8] = Math.max(0, animal[8] - 1);
      changed = true;
    }
    if (animal[14] > definition.waterMaximum) {
      removeLivestockRecord(slot);
      play("uhoh");
      setQuickMessage(0x3a);
      return true;
    }
  }
  if (animal[13] !== 0) {
    if (consumeLivestockSupply(animal, 300)) {
      changed = true;
    } else if (animal[13] > definition.foodMaximum >> 1) {
      setQuickMessage(0x3b);
      animal[8] = Math.max(0, animal[8] - 1);
      changed = true;
    }
    if (animal[13] > definition.foodMaximum) {
      removeLivestockRecord(slot);
      play("uhoh");
      setQuickMessage(0x38);
      return true;
    }
  }
  return changed;
}

function placePurchasedLivestockAtPoint(item, point) {
  const position = mapCellForPointer(point);
  const initialTile = livestockInitialTiles.get(item.id);
  if (!position || initialTile === undefined) return false;
  const cell = mapCell(position.x, position.y);
  const words = tileWords(cell);
  const tile = words.base & 0x07ff;
  if (
    tile < 0x19 ||
    tile > 0x1b ||
    (words.base & 0x0800) !== 0 ||
    (words.overlay & 0x0800) === 0 ||
    (words.overlay & 0x07ff) !== 0
  )
    return false;
  if (state.funds < item.price) {
    setQuickMessage(0x2a);
    return false;
  }
  if (!allocateLivestockRecord(item, position)) return false;

  const overlay = (words.overlay & 0xf800) | initialTile;
  cell[2] = overlay & 0xff;
  cell[3] = overlay >> 8;
  const saveView = stateView(farmStateBytes);
  registerAllocatedLivestock(item);
  for (const offset of [
    saveData.format.livestockPurchaseExpenseOffset1,
    saveData.format.livestockPurchaseExpenseOffset2,
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

function placePurchasedItemAtPoint(point) {
  const item = selectedPurchaseDefinition();
  if (!item) return false;
  let placed = false;
  if (item.category === "machine")
    placed = placePurchasedMachineAtPoint(item, point);
  else if (item.category === "structure")
    placed = placePurchasedStructureAtPoint(item, point);
  else if (item.category === "seed")
    placed = placePurchasedSeedAtPoint(item, point);
  else if (item.category === "chemical")
    placed = placePurchasedChemicalAtPoint(item, point);
  else if (item.category === "livestock")
    placed = placePurchasedLivestockAtPoint(item, point);
  // The paid-storage wrapper supplies this sound natively; the other catalog
  // categories reach an equivalent outer rejection branch. In either case
  // one UHOH is audible because the DOS VOC player is single-voice.
  if (!placed) play("uhoh");
  return placed;
}

function placeSelectedToolAtPoint(point) {
  if (!dragState || !farmStateBytes) return;
  const position = mapCellForPointer(point);
  if (!position) return;
  // FUN_1d75_2a4a owns both the per-drag coordinate latch and the common
  // construction-cost gate.  Its unsigned CMP/Jcc sequence rejects an
  // exact balance as well as a smaller one; the bulldozer uses a separate
  // callback and accepts an exact $25.
  if (
    dragState.lastCell?.x === position.x &&
    dragState.lastCell?.y === position.y
  )
    return;
  dragState.lastCell = position;
  if (selectedTool !== "Bulldoze") {
    const price =
      paletteTools.find(({ name }) => name === selectedTool)?.cost || 0;
    if (price > 0 && state.funds >>> 0 <= price >>> 0) {
      play("uhoh");
      setQuickMessage(0x2a);
      return;
    }
  }
  if (linearTerrainTools[selectedTool]) placeLinearTerrainAtPoint(point);
  else if (selectedTool === "Fence Gate") placeFenceGateAtPoint(point);
  else if (selectedTool === "Irrigation Ditch Valve")
    placeDitchValveAtPoint(point);
  else if (selectedTool === "Livestock Feed") placeLivestockFeedAtPoint(point);
  else if (selectedTool === "Water Trough") placeWaterTroughAtPoint(point);
  else if (selectedTool === "Trees - Windbreaks") placeTreesAtPoint(point);
  else if (selectedTool === "Bulldoze") placeBulldozeAtPoint(point);
}
