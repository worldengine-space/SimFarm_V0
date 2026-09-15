// Machine routing, availability, harvesting payloads, and movement.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function startMachineRoute(machineSlot, targetX, targetY) {
  const record = machineRecord(machineSlot);
  const view = stateView(record);
  const boundedX = Math.max(0, Math.min(95, targetX));
  const boundedY = Math.max(0, Math.min(95, targetY));
  record[7] = boundedX;
  record[8] = boundedY;
  record[9] = record[5];
  record[10] = record[6];
  record[11] = record[5];
  record[12] = record[6];
  record[13] = record[5];
  record[14] = record[6];
  record[55] = 0;
  record[4] = 1;
  view.setUint16(30, biosClockTick(), true);
  view.setUint16(2, view.getUint16(2, true) | 2, true);
}

function startManualMachineRoute(machineSlot, targetX, targetY) {
  const record = machineRecord(machineSlot);
  if (!record) return false;
  const boundedX = Math.max(0, Math.min(95, targetX));
  const boundedY = Math.max(0, Math.min(95, targetY));
  startMachineRoute(machineSlot, boundedX, boundedY);
  // FUN_114c_0006 marks a manual request with 0x0800 but leaves the old
  // home intact. Self-propelled completion writes the requested home later;
  // implements consume state 1 through the Tractor-haul branch instead.
  const view = stateView(record);
  view.setUint16(2, view.getUint16(2, true) | 0x0800, true);
  return true;
}

function machineDefinitionForSlot(machineSlot) {
  const record = machineRecord(machineSlot);
  if (!record) return null;
  return itemDefinitionForKeyAndId(
    "machine",
    stateView(record).getUint16(0, true),
  );
}

function machineDimensions(machineSlot) {
  const record = machineRecord(machineSlot);
  const definition = machineDefinitionForSlot(machineSlot);
  if (!record || !definition) return { width: 1, height: 1 };
  const rotated = record[15] === 2 || record[15] === 6;
  return rotated
    ? { width: definition.height, height: definition.width }
    : { width: definition.width, height: definition.height };
}

function machineFootprintCellIsValid(x, y) {
  const cell = mapCell(x, y);
  if (!cell) return false;
  const words = tileWords(cell);
  if ((words.base & 0x0800) !== 0) {
    triggerLivestockMachineCollision(x, y);
    return false;
  }
  const tile = words.base & 0x07ff;
  // FUN_0d5f_0f1a uses the terrain, paved-road, dirt-road, and crossing
  // tile-table entries at indices 0, 4, 5, and 128. Its separate runtime
  // map plane bit 0x10 is the saved display cell's field bit 0x1000.
  return (
    (tile >= 0x0f && tile < 0x1f) ||
    (tile >= 0x96 && tile < 0xa1) ||
    (tile >= 0xa1 && tile < 0xac) ||
    (tile >= 0xbc && tile < 0xc1) ||
    (words.overlay & 0x1000) !== 0
  );
}

function collisionLivestockAtPosition(x, y) {
  if (!farmStateBytes || !saveData) return null;
  const liveCount = stateView(farmStateBytes).getUint16(
    saveData.format.objectCountOffset,
    true,
  );
  let activeSeen = 0;
  // FUN_0f87_0df0 uses the same live-count traversal quirk as the machine
  // allocator: inactive holes do not consume the count, and the first
  // active record at the exact byte coordinates wins.
  for (
    let slot = 1;
    slot < saveData.format.objectRecordCount && activeSeen < liveCount;
    slot += 1
  ) {
    const record = objectRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    if (record[0] === x && record[1] === y) return { slot, record, view };
    activeSeen += 1;
  }
  return null;
}

function triggerLivestockMachineCollision(x, y) {
  const collision = collisionLivestockAtPosition(x, y);
  if (!collision) return false;
  const { record, view } = collision;
  const flags = view.getUint16(2, true);
  // The special/stunned flag suppresses repeated collision callbacks. The
  // caller clears sex bit 0x02 only when it actually starts this state.
  if ((flags & 8) !== 0) return false;
  const cell = mapCell(x, y);
  if (!cell) return false;
  // Both native callers perform their stunned-bit guard before entering
  // FUN_1f87_1950; SMACK is the helper's first observable action.
  play("smack");
  const cellView = stateView(cell);
  const overlay = cellView.getUint16(2, true);
  const tile = overlay & 0x07ff;
  let collisionTile = 0x040e;
  if (tile >= 0x03c2 && tile < 0x03d2) collisionTile = 0x040f;
  else if (tile >= 0x03d2 && tile < 0x03e2) collisionTile = 0x0410;
  else if (tile >= 0x03e2 && tile < 0x03f2) collisionTile = 0x0411;
  // FUN_0f87_1950 classifies the displayed animal family, not the record
  // ID, then preserves the overlay flags while installing 0x40e..0x411.
  cellView.setUint16(2, (overlay & 0xf800) | collisionTile, true);
  view.setUint16(2, (flags | 8) & ~2, true);
  // The helper deliberately calls the duplicate SMACK filename again after
  // installing the impact sprite and stunned bit (1f87:1b0e).
  play("smack");
  view.setUint16(30, biosClockTick(Date.now()), true);
  mapDirty = true;
  return true;
}

function townTrafficRecord(slot) {
  if (
    !farmStateBytes ||
    !saveData ||
    slot < 0 ||
    slot >= saveData.format.featureRecordCount
  )
    return null;
  const offset =
    saveData.format.featureRecordOffset +
    slot * saveData.format.featureRecordSize;
  return farmStateBytes.subarray(
    offset,
    offset + saveData.format.featureRecordSize,
  );
}

function allocateTownTraffic(x, y, direction = 4) {
  if (!farmStateBytes || !saveData) return -1;
  const format = saveData.format;
  if (farmStateBytes[format.featureCountOffset] >= format.featureRecordCount)
    return -1;
  for (let slot = 0; slot < format.featureRecordCount; slot += 1) {
    const record = townTrafficRecord(slot);
    if ((record[0] & 1) !== 0) continue;
    const view = stateView(record);
    record[0] |= 3;
    view.setUint16(2, x, true);
    view.setUint16(4, y, true);
    record[6] = direction & 0xff;
    record[7] = nextSimRandom() & 3;
    farmStateBytes[format.featureCountOffset] += 1;
    return slot;
  }
  return -1;
}

function removeTownTraffic(slot) {
  const record = townTrafficRecord(slot);
  if (!record || (record[0] & 1) === 0) return false;
  record[0] &= 0xfe;
  farmStateBytes[saveData.format.featureCountOffset] = Math.max(
    0,
    farmStateBytes[saveData.format.featureCountOffset] - 1,
  );
  return true;
}

function townRoadConnectionMask(x, y) {
  return linearConnectionMask(
    x,
    y,
    linearTerrainTools["Paved Road"],
    linearNetworkRules(linearTerrainTools["Paved Road"]),
  );
}

function townTrafficDestination(x, y, initialDirection) {
  const directionBits = [1, 2, 4, 8];
  const reverseBits = [4, 8, 1, 2];
  const deltas = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  let startDirection = initialDirection & 6;
  let direction = startDirection;
  let failedAttempts = 0;
  while (true) {
    let connections = townRoadConnectionMask(x, y);
    const connectionCount = cardinalNeighbors.reduce(
      (count, neighbor) => count + ((connections & neighbor.bit) !== 0 ? 1 : 0),
      0,
    );
    if (connectionCount > 1) connections &= ~reverseBits[startDirection >> 1];

    // 19ab:196a advances the primary LFSR before every attempt. On an odd
    // result it advances it again and scans clockwise from that random
    // cardinal direction until it finds a connection. Invalid terrain then
    // rotates clockwise and jumps back through this entire RNG/mask block.
    if ((nextSimRandom() & 1) !== 0 && connections !== 0) {
      let candidate = nextSimRandom() & 3;
      while ((connections & directionBits[candidate]) === 0)
        candidate = (candidate + 1) & 3;
      direction = candidate << 1;
      startDirection = direction;
    }

    const [dx, dy] = deltas[direction >> 1];
    const destinationX = Math.max(0, Math.min(95, x + dx));
    const destinationY = Math.max(0, Math.min(95, y + dy));
    const words = tileWords(mapCell(destinationX, destinationY));
    const tile = words.base & 0x07ff;
    const paved = isLinearToolTile(tile, linearTerrainTools["Paved Road"]);
    const bridge = isLinearToolTile(tile, bridgeConnectionRule);
    const dirt =
      isLinearToolTile(tile, linearTerrainTools["Dirt Road"]) &&
      (words.overlay & 0x0800) === 0;
    if (paved || bridge || dirt) {
      return { x: destinationX, y: destinationY, direction };
    }
    direction = (direction + 2) & 7;
    failedAttempts += 1;
    if (direction === startDirection || failedAttempts > 4) return null;
  }
}

function advanceTownTrafficRecord(slot) {
  const record = townTrafficRecord(slot);
  if (!record || (record[0] & 1) === 0) return false;
  const view = stateView(record);
  let flags = record[0];
  const oldX = view.getUint16(2, true);
  const oldY = view.getUint16(4, true);

  if ((flags & 2) !== 0) {
    const oldCell = mapCell(oldX, oldY);
    if (oldCell) {
      const oldView = stateView(oldCell);
      oldView.setUint16(0, oldView.getUint16(0, true) & ~0x0800, true);
      oldView.setUint16(2, oldView.getUint16(2, true) & 0xf800, true);
    }
  }

  const destination = townTrafficDestination(oldX, oldY, record[6]);
  if (!destination) {
    removeTownTraffic(slot);
    mapDirty = true;
    return true;
  }

  const destinationCell = mapCell(destination.x, destination.y);
  const destinationView = stateView(destinationCell);
  const base = destinationView.getUint16(0, true);
  if ((base & 0x0800) !== 0) {
    const collision = collisionLivestockAtPosition(
      destination.x,
      destination.y,
    );
    if (collision && (collision.view.getUint16(2, true) & 8) === 0) {
      triggerLivestockMachineCollision(destination.x, destination.y);
    }
    flags &= ~2;
  } else {
    flags |= 2;
    destinationView.setUint16(0, base | 0x0800, true);
    const overlay = destinationView.getUint16(2, true);
    const carTile = 0x394 + (record[7] & 3) * 4 + (destination.direction >> 1);
    destinationView.setUint16(2, (overlay & 0xf800) | carTile, true);
  }

  view.setUint16(2, destination.x, true);
  view.setUint16(4, destination.y, true);
  record[6] = destination.direction;
  record[0] = flags;
  mapDirty = true;
  return true;
}

function advanceTownTrafficTick() {
  if (!farmStateBytes || !saveData) return false;
  let changed = false;
  for (let slot = 0; slot < saveData.format.featureRecordCount; slot += 1) {
    if ((townTrafficRecord(slot)?.[0] & 1) !== 0) {
      changed = advanceTownTrafficRecord(slot) || changed;
    }
  }
  return changed;
}

function machineChainPositionIsValid(machineSlot) {
  let currentSlot = machineSlot;
  while (currentSlot !== 0) {
    const record = machineRecord(currentSlot);
    if (!record) return false;
    const { width, height } = machineDimensions(currentSlot);
    for (let x = record[5]; x < record[5] + width; x += 1) {
      for (let y = record[6]; y < record[6] + height; y += 1) {
        if (!machineFootprintCellIsValid(x, y)) return false;
      }
    }
    currentSlot = stateView(record).getUint16(46, true);
  }
  return true;
}

function clearMachineVisibilityFlags(machineSlot) {
  const root = machineRecord(machineSlot);
  if (!root) return;
  const rootView = stateView(root);
  rootView.setUint16(2, rootView.getUint16(2, true) & ~0x80, true);
  const child = machineRecord(rootView.getUint16(46, true));
  if (!child) return;
  const childView = stateView(child);
  childView.setUint16(2, childView.getUint16(2, true) & ~0x80, true);
}

function updateMachineRouteRender(machineSlot) {
  if (!machineChainPositionIsValid(machineSlot)) {
    clearMachineVisibilityFlags(machineSlot);
    return false;
  }
  renderMachineChain(machineSlot);
  return true;
}

function clearMachineRender(machineSlot) {
  const root = machineRecord(machineSlot);
  if (!root) return;
  const rootFlags = stateView(root).getUint16(2, true);
  if ((rootFlags & 0xa0) !== 0xa0) return;
  let currentSlot = machineSlot;
  while (currentSlot !== 0) {
    const record = machineRecord(currentSlot);
    if (!record) break;
    const view = stateView(record);
    const { width, height } = machineDimensions(currentSlot);
    for (let x = record[5]; x < record[5] + width; x += 1) {
      for (let y = record[6]; y < record[6] + height; y += 1) {
        const cell = mapCell(x, y);
        if (!cell) continue;
        const base = stateView(cell).getUint16(0, true) & ~0x0800;
        const overlay = stateView(cell).getUint16(2, true) & 0xf800;
        stateView(cell).setUint16(0, base, true);
        stateView(cell).setUint16(2, overlay, true);
      }
    }
    view.setUint16(2, view.getUint16(2, true) & ~0x80, true);
    currentSlot = view.getUint16(46, true);
  }
  mapDirty = true;
}

function renderMachineChain(machineSlot) {
  let currentSlot = machineSlot;
  while (currentSlot !== 0) {
    const record = machineRecord(currentSlot);
    const definition = machineDefinitionForSlot(currentSlot);
    if (!record || !definition) break;
    const view = stateView(record);
    const flags = view.getUint16(2, true);
    if ((flags & 0x20) === 0) break;
    const { width, height } = machineDimensions(currentSlot);
    const firstTile = machineOverlayStarts.get(definition.id);
    if (firstTile !== undefined) {
      let tile =
        firstTile +
        definition.width *
          definition.height *
          definition.storage *
          (record[15] >> 1) +
        definition.width * definition.height * record[42];
      for (let x = record[5]; x < record[5] + width; x += 1) {
        for (let y = record[6]; y < record[6] + height; y += 1) {
          const cell = mapCell(x, y);
          if (!cell) continue;
          const cellView = stateView(cell);
          cellView.setUint16(0, cellView.getUint16(0, true) | 0x0800, true);
          cellView.setUint16(
            2,
            (cellView.getUint16(2, true) & 0xf800) | tile,
            true,
          );
          tile += 1;
        }
      }
    }
    view.setUint16(2, flags | 0x80, true);
    currentSlot = view.getUint16(46, true);
  }
  mapDirty = true;
}

function syncMachineChain(machineSlot) {
  let parentSlot = machineSlot;
  let childSlot = stateView(machineRecord(parentSlot)).getUint16(46, true);
  while (childSlot !== 0) {
    const parent = machineRecord(parentSlot);
    const child = machineRecord(childSlot);
    if (!parent || !child) break;
    const parentDefinition = machineDefinitionForSlot(parentSlot);
    const childDefinition = machineDefinitionForSlot(childSlot);
    if (!parentDefinition || !childDefinition) break;
    const direction = parent[15];
    if (direction === 0) {
      child[5] = (parent[5] - (childDefinition.width >> 1)) & 0xff;
      child[6] = (parent[6] + parentDefinition.height) & 0xff;
    } else if (direction === 2) {
      child[5] = (parent[5] - childDefinition.height) & 0xff;
      child[6] = (parent[6] - (childDefinition.width >> 1)) & 0xff;
    } else if (direction === 4) {
      child[5] = (parent[5] - (childDefinition.width >> 1)) & 0xff;
      child[6] = (parent[6] - childDefinition.height) & 0xff;
    } else if (direction === 6) {
      child[5] = (parent[5] + parentDefinition.height) & 0xff;
      child[6] = (parent[6] - (childDefinition.width >> 1)) & 0xff;
    }
    child[15] = direction;
    child[48] = parent[48];
    child[49] = parent[49];
    parentSlot = childSlot;
    childSlot = stateView(child).getUint16(46, true);
  }
}

function setMachineDirection(machineSlot, direction) {
  const record = machineRecord(machineSlot);
  if (!record) return;
  record[15] = direction;
  syncMachineChain(machineSlot);
}

function linkMachines(parentSlot, childSlot) {
  const parent = machineRecord(parentSlot);
  const child = machineRecord(childSlot);
  const childDefinition = machineDefinitionForSlot(childSlot);
  if (!parent || !child || !childDefinition) return false;
  const parentView = stateView(parent);
  const childView = stateView(child);
  parentView.setUint16(46, childSlot, true);
  childView.setUint16(44, parentSlot, true);
  let widthIncrease = 0;
  let heightIncrease = 0;
  const oldHeight = parent[54];
  if (parent[53] < childDefinition.width) {
    widthIncrease = childDefinition.width - parent[53] - 1;
    parent[53] = childDefinition.width;
  }
  if (parent[54] < childDefinition.height) {
    heightIncrease = childDefinition.height - parent[54] - 1;
    parent[54] = childDefinition.height;
  }
  const halfChildWidth = childDefinition.width >> 1;
  if (parent[15] === 0) {
    parent[5] = (parent[5] + widthIncrease) & 0xff;
    parent[6] = (parent[6] + heightIncrease) & 0xff;
    child[5] = (parent[5] - halfChildWidth) & 0xff;
    child[6] = (parent[6] + oldHeight) & 0xff;
  } else if (parent[15] === 2) {
    parent[5] = (parent[5] + heightIncrease) & 0xff;
    parent[6] = (parent[6] + widthIncrease) & 0xff;
    child[5] = (parent[5] - childDefinition.height) & 0xff;
    child[6] = (parent[6] - halfChildWidth) & 0xff;
  } else if (parent[15] === 4) {
    parent[5] = (parent[5] + widthIncrease) & 0xff;
    parent[6] = (parent[6] + heightIncrease) & 0xff;
    child[5] = (parent[5] - halfChildWidth) & 0xff;
    child[6] = (parent[6] - childDefinition.height) & 0xff;
  } else if (parent[15] === 6) {
    parent[5] = (parent[5] + heightIncrease) & 0xff;
    parent[6] = (parent[6] + widthIncrease) & 0xff;
    child[5] = (parent[5] + oldHeight) & 0xff;
    child[6] = (parent[6] - halfChildWidth) & 0xff;
  }
  child[15] = parent[15];
  child[48] = parent[48];
  child[49] = parent[49];
  return true;
}

function isRoadTileAt(x, y) {
  const tile =
    tileWords(
      mapCell(Math.max(0, Math.min(95, x)), Math.max(0, Math.min(95, y))),
    ).base & 0x07ff;
  return (
    (tile >= 0x96 && tile < 0x96 + 0x0b) || (tile >= 0xa1 && tile < 0xa1 + 0x0b)
  );
}

function perimeterRoadDestination(
  originX,
  originY,
  width,
  height,
  fallback = { x: originX, y: originY },
) {
  for (let x = originX - 1; x < originX + width + 1; x += 1) {
    if (isRoadTileAt(x, originY - 1)) {
      return { x: Math.max(0, Math.min(95, x)), y: Math.max(0, originY - 1) };
    }
    if (isRoadTileAt(x, originY + height)) {
      return {
        x: Math.max(0, Math.min(95, x)),
        y: Math.min(95, originY + height),
      };
    }
  }
  for (let y = originY - 1; y < originY + height + 1; y += 1) {
    if (isRoadTileAt(originX - 1, y)) {
      return { x: Math.max(0, originX - 1), y: Math.max(0, Math.min(95, y)) };
    }
    if (isRoadTileAt(originX + width, y)) {
      return {
        x: Math.min(95, originX + width),
        y: Math.max(0, Math.min(95, y)),
      };
    }
  }
  return fallback;
}

function fieldRouteDestination(record) {
  return perimeterRoadDestination(
    record[10],
    record[11],
    record[12],
    record[13],
  );
}

function storedMachineRouteDestination(machineSlot) {
  const record = machineRecord(machineSlot);
  if (!record) return { x: 0, y: 0 };
  const structure = structureAtPosition({ x: record[50], y: record[51] });
  if (!structure) return { x: Math.max(0, record[50] - 1), y: record[51] };
  return perimeterRoadDestination(
    structure.record[4],
    structure.record[5],
    structure.definition.width,
    structure.definition.height,
    { x: Math.max(0, structure.record[4] - 1), y: structure.record[5] },
  );
}

function routeDirection(record) {
  const dx = record[5] - record[7];
  const dy = record[6] - record[8];
  if (Math.abs(dx) <= Math.abs(dy)) return dy < 0 ? 4 : 0;
  return dx < 0 ? 2 : 6;
}

function routeCandidateCost(record, dx, dy) {
  const x = record[5] + dx;
  const y = record[6] + dy;
  const targetDx = x - record[7];
  const targetDy = y - record[8];
  if (targetDx * targetDx + targetDy * targetDy <= 4) return 0;
  const tile = tileWords(mapCell(x, y)).base & 0x07ff;
  const traversable =
    (tile >= 0x0f && tile <= 0x1f) ||
    (tile >= 0x96 && tile <= 0xac) ||
    (tile >= 0xbc && tile <= 0xc0);
  if (!traversable) return 20000;
  let cost = tile >= 0x0f && tile <= 0x1f ? 0x55 : 0;
  if (
    (x === record[9] && y === record[10]) ||
    (x === record[11] && y === record[12]) ||
    (x === record[13] && y === record[14])
  )
    cost += 200;
  return cost;
}

function routeCandidates(direction) {
  if (direction === 0)
    return [
      [0, -1],
      [-1, 0],
      [1, 0],
    ];
  if (direction === 2)
    return [
      [1, 0],
      [0, -1],
      [0, 1],
    ];
  if (direction === 4)
    return [
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
  return [
    [-1, 0],
    [0, -1],
    [0, 1],
  ];
}

function addMachineRouteDamage(machineSlot, amount) {
  const record = machineRecord(machineSlot);
  if (!record) return;
  // FUN_0d5f_2182 adds one quarter of the little-endian word beginning at
  // record byte 18, then the caller's route penalty, to damage byte 17.
  // The high byte is normally zero, but reading the full word preserves the
  // executable's exact malformed/synthetic-record behavior.
  const wearWord = stateView(record).getUint16(18, true);
  record[17] = Math.min(0xff, record[17] + (wearWord >> 2) + amount);
}

function applyMachineOffroadRouteWear(machineSlot) {
  const record = machineRecord(machineSlot);
  if (!record) return;
  const tile = tileWords(mapCell(record[5], record[6])).base & 0x07ff;
  // The first terrain table entry starts at 0x0f and has length 0x10:
  // only tiles 0x0f..0x1e participate in this global route-wear counter.
  if (tile < 0x0f || tile >= 0x1f) return;
  groundRouteWearCounter += 1;
  if (groundRouteWearCounter <= 10) return;
  groundRouteWearCounter = 0;
  setQuickMessage(0x2c);
  const view = stateView(record);
  if (view.getUint16(0, true) !== 6) addMachineRouteDamage(machineSlot, 2);
  const childSlot = view.getUint16(46, true);
  if (childSlot !== 0) addMachineRouteDamage(childSlot, 2);
}

function advanceMachineRoute(machineSlot) {
  const record = machineRecord(machineSlot);
  if (!record) return false;
  const view = stateView(record);
  if ((view.getUint16(2, true) & 2) === 0) return false;
  clearMachineRender(machineSlot);
  const candidates = routeCandidates(routeDirection(record));
  const costs = candidates.map(
    ([dx, dy], index) =>
      routeCandidateCost(record, dx, dy) + (index === 0 ? 0 : 5),
  );
  let dx = 0;
  let dy = 0;
  if (costs.some((cost) => cost <= 0x75a)) {
    let selected = 0;
    if (costs[1] < costs[selected]) selected = 1;
    if (costs[2] < costs[selected]) selected = 2;
    [dx, dy] = candidates[selected];
    if (dx === 0 && dy === -1) record[15] = 0;
    else if (dx === 1 && dy === 0) record[15] = 2;
    else if (dx === 0 && dy === 1) record[15] = 4;
    else if (dx === -1 && dy === 0) record[15] = 6;
  } else {
    record[5] = record[7];
    record[6] = record[8];
  }
  record[13] = record[11];
  record[14] = record[12];
  record[11] = record[9];
  record[12] = record[10];
  record[9] = record[5];
  record[10] = record[6];
  record[5] = (record[5] + dx) & 0xff;
  record[6] = (record[6] + dy) & 0xff;
  syncMachineChain(machineSlot);
  applyMachineOffroadRouteWear(machineSlot);
  updateMachineRouteRender(machineSlot);
  if (record[5] === record[7] && record[6] === record[8]) {
    if ((view.getUint16(2, true) & 1) === 0) {
      record[50] = record[5];
      record[51] = record[6];
      record[52] = record[15];
    }
    record[55] = 0;
    view.setUint16(2, view.getUint16(2, true) & ~2, true);
    return true;
  }
  record[55] = (record[55] + 1) & 0xff;
  // The original comparison is signed (`cmp byte,40h` / `jge`). Normal
  // routes reach 0x40; preserving signedness also keeps corrupt/save-probe
  // counters 0x80..0xff from spuriously taking the watchdog branch.
  if ((record[55] & 0x80) === 0 && record[55] >= 0x40) {
    clearMachineRender(machineSlot);
    record[5] = record[7];
    record[6] = record[8];
    record[55] = 0;
    // The original route watchdog resolves a confused/roadless machine by
    // snapping it to the destination and passing ten through the same
    // wear-aware damage helper as off-road travel. Unlike the eleven-step
    // terrain branch, it penalizes only the root. Machine ID 6 is exempt.
    if (view.getUint16(0, true) !== 6) addMachineRouteDamage(machineSlot, 10);
    setQuickMessage(0x2d);
    syncMachineChain(machineSlot);
    updateMachineRouteRender(machineSlot);
    view.setUint16(2, view.getUint16(2, true) & ~2, true);
  }
  return true;
}

function storeMachine(machineSlot) {
  const record = machineRecord(machineSlot);
  const definition = machineDefinitionForSlot(machineSlot);
  if (!record || !definition) return false;
  const structure = structureAtPosition({ x: record[5], y: record[6] });
  if (!structure) return false;
  const structureView = stateView(structure.record);
  const preferredDirection = storedMachineDirections.get(machineSlot);
  const directions =
    preferredDirection === 0 || preferredDirection === 2
      ? [preferredDirection, preferredDirection === 0 ? 2 : 0]
      : [0, 2];
  let placement = null;
  for (
    let relativeX = 0;
    relativeX < structure.definition.width && !placement;
    relativeX += 1
  ) {
    for (
      let relativeY = 0;
      relativeY < structure.definition.height && !placement;
      relativeY += 1
    ) {
      for (const direction of directions) {
        const rotated = direction === 2;
        const width = rotated ? definition.height : definition.width;
        const height = rotated ? definition.width : definition.height;
        if (
          relativeX + width > structure.definition.width ||
          relativeY + height > structure.definition.height
        )
          continue;
        let free = true;
        for (let itemX = 0; itemX < width && free; itemX += 1) {
          for (let itemY = 0; itemY < height; itemY += 1) {
            const storageSlot = (relativeX + itemX) * 3 + relativeY + itemY;
            if (
              structureView.getUint16(34 + storageSlot * 2, true) !== 0xffff
            ) {
              free = false;
              break;
            }
          }
        }
        if (free)
          placement = { relativeX, relativeY, direction, width, height };
        if (placement) break;
      }
    }
  }
  if (!placement) return false;
  const storageSlot = placement.relativeX * 3 + placement.relativeY;
  const position = structureStoragePosition(structure, storageSlot);
  record[5] = position.x;
  record[6] = position.y;
  record[15] = placement.direction;
  const view = stateView(record);
  view.setUint16(2, view.getUint16(2, true) | 4, true);
  let tile =
    (machineOverlayStarts.get(definition.id) ?? 0x350) +
    definition.width *
      definition.height *
      definition.storage *
      (placement.direction >> 1) +
    definition.width * definition.height * record[42];
  for (let itemX = 0; itemX < placement.width; itemX += 1) {
    for (let itemY = 0; itemY < placement.height; itemY += 1) {
      writeStructureStorageItem(
        structure,
        (placement.relativeX + itemX) * 3 + placement.relativeY + itemY,
        definition,
        tile,
        machineSlot,
      );
      tile += 1;
    }
  }
  storedMachineDirections.delete(machineSlot);
  return true;
}

function resetMachineAfterOperation(machineSlot) {
  const record = machineRecord(machineSlot);
  const definition = machineDefinitionForSlot(machineSlot);
  if (!record || !definition) return;
  const view = stateView(record);
  let flags = view.getUint16(2, true) & 0xfff6;
  view.setUint16(2, flags, true);
  record[48] = 0;
  record[53] = definition.width;
  record[54] = definition.height;
  if ((flags & 0x40) !== 0) {
    flags &= ~0x20;
    view.setUint16(2, flags, true);
    const saveView = stateView(farmStateBytes);
    saveView.setUint16(
      saveData.format.machineCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.machineCountOffset, true) - 1,
      ),
      true,
    );
  }
}

function machineParkingCandidateIsValid(machineSlot, x, y, direction) {
  const record = machineRecord(machineSlot);
  if (!record) return false;
  const oldX = record[5];
  const oldY = record[6];
  const oldDirection = record[15];
  record[5] = x & 0xff;
  record[6] = y & 0xff;
  record[15] = direction;
  // FUN_2281:0786 deliberately changes only the root record while testing;
  // any linked child's already-synchronized position remains untouched.
  const valid = machineChainPositionIsValid(machineSlot);
  record[5] = oldX;
  record[6] = oldY;
  record[15] = oldDirection;
  return valid;
}

function findMachineParkingPosition(machineSlot, originX, originY) {
  // FUN_2281:0486 searches asymmetric footprint-origin rings. For each
  // radius it checks the horizontal edges first, then the vertical edges;
  // every coordinate is tried north-facing before east-facing.
  for (let radius = 1; radius <= 0x7f; radius += 1) {
    const size = radius * 2 + 1;
    const minX = originX - radius;
    const minY = originY - radius;
    const maxX = minX + size;
    const maxY = minY + size;
    for (let x = minX; x < maxX; x += 1) {
      for (const candidate of [
        { x, y: minY, direction: 0 },
        { x, y: maxY, direction: 0 },
        { x, y: minY, direction: 2 },
        { x, y: maxY, direction: 2 },
      ]) {
        if (
          machineParkingCandidateIsValid(
            machineSlot,
            candidate.x,
            candidate.y,
            candidate.direction,
          )
        )
          return candidate;
      }
    }
    for (let y = minY + 1; y < maxY; y += 1) {
      for (const candidate of [
        { x: minX, y, direction: 0 },
        { x: maxX, y, direction: 0 },
        { x: minX, y, direction: 2 },
        { x: maxX, y, direction: 2 },
      ]) {
        if (
          machineParkingCandidateIsValid(
            machineSlot,
            candidate.x,
            candidate.y,
            candidate.direction,
          )
        )
          return candidate;
      }
    }
  }
  return null;
}

function parkMachineAfterRoute(machineSlot) {
  const record = machineRecord(machineSlot);
  if (!record) return false;
  clearMachineRender(machineSlot);
  if (storeMachine(machineSlot)) return true;
  if (machineChainPositionIsValid(machineSlot)) {
    renderMachineChain(machineSlot);
    return true;
  }
  const parking = findMachineParkingPosition(machineSlot, record[5], record[6]);
  if (!parking) return false;
  record[5] = parking.x & 0xff;
  record[6] = parking.y & 0xff;
  record[15] = parking.direction;
  if (storeMachine(machineSlot)) return true;
  renderMachineChain(machineSlot);
  return true;
}

function completeDefaultMachineRoute(machineSlot) {
  const record = machineRecord(machineSlot);
  if (!record) return false;
  const view = stateView(record);
  // FUN_2281:040e clears flags 0x0801, records the requested home before
  // any parking fallback moves the live footprint, then parks the machine.
  view.setUint16(2, view.getUint16(2, true) & 0xf7fe, true);
  record[50] = record[5];
  record[51] = record[6];
  record[52] = record[15];
  return parkMachineAfterRoute(machineSlot);
}

function handleCompletedMachineReturn(machineSlot) {
  const tractor = machineRecord(machineSlot);
  if (!tractor) return false;
  const tractorView = stateView(tractor);
  let flags = tractorView.getUint16(2, true);
  if ((flags & 0x1000) !== 0) {
    flags &= ~0x1000;
    tractorView.setUint16(2, flags, true);
    if ((flags & 8) === 0) {
      tractorView.setUint16(2, tractorView.getUint16(2, true) & ~1, true);
      storeMachine(machineSlot);
    }
    return true;
  }
  if ((flags & 0x0400) !== 0) {
    const attachmentSlot = tractorView.getUint16(46, true);
    const attachment = machineRecord(attachmentSlot);
    if (!attachment) return false;
    clearMachineRender(machineSlot);
    tractorView.setUint16(46, 0, true);
    const attachmentView = stateView(attachment);
    attachmentView.setUint16(44, 0, true);
    attachment[5] = attachment[50];
    attachment[6] = attachment[51];
    attachment[15] = attachment[52];
    attachmentView.setUint16(2, attachmentView.getUint16(2, true) & ~1, true);
    if ((attachmentView.getUint16(2, true) & 0x40) === 0) {
      parkMachineAfterRoute(attachmentSlot);
    }
    resetMachineAfterOperation(attachmentSlot);
    tractorView.setUint16(2, tractorView.getUint16(2, true) & ~0x0400, true);
    return true;
  }
  if ((flags & 0x0100) !== 0) {
    const attachmentSlot = tractorView.getUint16(46, true);
    const attachment = machineRecord(attachmentSlot);
    if (!attachment) return false;
    clearMachineRender(machineSlot);
    tractorView.setUint16(46, 0, true);
    stateView(attachment).setUint16(44, 0, true);
    attachment[5] = attachment[50];
    attachment[6] = attachment[51];
    attachment[15] = attachment[52];
    stateView(attachment).setUint16(
      2,
      stateView(attachment).getUint16(2, true) & ~3,
      true,
    );
    if ((stateView(attachment).getUint16(2, true) & 0x40) === 0) {
      parkMachineAfterRoute(attachmentSlot);
    }
    resetMachineAfterOperation(attachmentSlot);
    flags = tractorView.getUint16(2, true) & ~0x0100;
    tractorView.setUint16(2, flags, true);
    startMachineRoute(machineSlot, tractor[50], tractor[51]);
    tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x0200, true);
    // The original return handler immediately performs one FUN_0d5f_07f8
    // step when the second route begins at its destination. That first
    // step moves away; the normal route tick then steps back and completes.
    if (tractor[5] === tractor[7] && tractor[6] === tractor[8]) {
      advanceMachineRoute(machineSlot);
    }
    return true;
  }
  if ((flags & 0x0200) !== 0) {
    clearMachineRender(machineSlot);
    tractor[5] = tractor[50];
    tractor[6] = tractor[51];
    tractor[15] = tractor[52];
    tractorView.setUint16(2, tractorView.getUint16(2, true) & ~0x0200, true);
    if ((tractorView.getUint16(2, true) & 0x40) === 0) {
      parkMachineAfterRoute(machineSlot);
    }
    resetMachineAfterOperation(machineSlot);
    return true;
  }
  return false;
}

function advanceImplementMoveState(machineSlot) {
  const implement = machineRecord(machineSlot);
  if (!implement) return { changed: false, abort: false };
  const implementView = stateView(implement);
  if (implement[4] === 1) {
    const tractorSlot = findAvailableMachine(0, implement[5], implement[6]);
    // 2281:0153 exits the entire machine executor when no Tractor can be
    // found; records after this implement are not visited during this pass.
    if (tractorSlot === 0) return { changed: false, abort: true };
    const tractor = machineRecord(tractorSlot);
    const tractorView = stateView(tractor);
    tractorView.setUint16(2, tractorView.getUint16(2, true) | 8, true);
    implementView.setUint16(44, tractorSlot, true);
    startMachineRoute(tractorSlot, implement[5] - 1, implement[6]);
    tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x1000, true);
    implement[4] = 2;
    return { changed: true, abort: false };
  }
  if (implement[4] !== 2) return { changed: false, abort: false };
  const tractorSlot = implementView.getUint16(44, true);
  const tractor = machineRecord(tractorSlot);
  if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0) {
    return { changed: false, abort: false };
  }
  clearMachineRender(machineSlot);
  clearMachineRender(tractorSlot);
  if (!linkMachines(tractorSlot, machineSlot))
    return { changed: false, abort: false };
  startMachineRoute(tractorSlot, implement[7], implement[8] - 1);
  implement[50] = implement[7];
  implement[51] = implement[8];
  const tractorView = stateView(tractor);
  tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x0100, true);
  implement[4] = 0;
  return { changed: true, abort: false };
}

function advanceMachineRoutes(now = null) {
  let changed = false;
  const liveCount = stateView(farmStateBytes).getUint16(
    saveData.format.machineCountOffset,
    true,
  );
  const timed = now !== null;
  const tick = timed ? biosClockTick(now) : 0;
  let activeSeen = 0;
  for (
    let slot = 1;
    slot < saveData.format.machineRecordCount && activeSeen < liveCount;
    slot += 1
  ) {
    const record = machineRecord(slot);
    const view = stateView(record);
    const flags = view.getUint16(2, true);
    if ((flags & 0x20) === 0) continue;
    activeSeen += 1;
    const machineId = view.getUint16(0, true);
    if (
      machineId === 1 ||
      machineId === 2 ||
      machineId === 3 ||
      machineId === 5
    ) {
      const result = advanceImplementMoveState(slot);
      changed = result.changed || changed;
      if (result.abort) return changed;
      continue;
    }
    // The 2281 jump table routes only Tractor, Harvester, the legacy ID-6
    // entry, and Truck through the timestamp-gated mover. Crop Duster ID 8
    // and malformed IDs above seven intentionally receive no route work.
    if (
      machineId !== 0 &&
      machineId !== 4 &&
      machineId !== 6 &&
      machineId !== 7
    )
      continue;
    if (
      timed &&
      state.speed !== "Ultra" &&
      ((tick - view.getUint16(30, true)) & 0xffff) <= 1
    )
      continue;
    if ((flags & 2) !== 0) {
      changed = advanceMachineRoute(slot) || changed;
      if ((view.getUint16(2, true) & 2) === 0) {
        const handled = handleCompletedMachineReturn(slot);
        changed = handled || changed;
        if (!handled) changed = completeDefaultMachineRoute(slot) || changed;
      }
    }
    if (timed) view.setUint16(30, tick, true);
  }
  return changed;
}

function advanceChemicalTransferStates() {
  if (!farmStateBytes || !saveData) return false;
  const saveView = stateView(farmStateBytes);
  const liveCount = saveView.getUint16(
    saveData.format.chemicalStorageCountOffset,
    true,
  );
  let processed = 0;
  let changed = false;
  // FUN_225a_000c has a genuine split-index bug. Its one-based `slot`
  // cursor decides whether a record is active, but its zero-based
  // `processed` counter selects the 20-byte payload to dispatch. Preserve
  // that mismatch: ordinary compact saves therefore inspect payload slots
  // 0..count-1 while active sentinels are found in slots 1..count.
  for (
    let slot = 1;
    slot < saveData.format.chemicalStorageRecordCount && processed < liveCount;
    slot += 1
  ) {
    const sentinel = chemicalStorageRecord(slot);
    if (!sentinel || (stateView(sentinel).getUint16(2, true) & 0x20) === 0)
      continue;
    const record = chemicalStorageRecord(processed);
    if (!record) break;
    const view = stateView(record);
    const transferState = record[4];

    if (transferState === 1) {
      const tractorSlot = findAvailableMachine(0, record[5], record[6]);
      // The original returns from the whole executor when no Tractor can be
      // allocated; later chemical records are not visited on this pass.
      if (tractorSlot === 0) return changed;
      clearMachineRender(tractorSlot);
      const tractor = machineRecord(tractorSlot);
      const tractorView = stateView(tractor);
      tractorView.setUint16(2, tractorView.getUint16(2, true) | 8, true);
      view.setUint16(16, tractorSlot, true);
      startMachineRoute(tractorSlot, record[5] - 1, record[6]);
      record[4] = 2;
      changed = true;
    } else if (transferState === 2) {
      const tractorSlot = view.getUint16(16, true);
      const tractor = machineRecord(tractorSlot);
      if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
        return changed;
      const sourceCell = mapCell(record[5], record[6]);
      if (sourceCell) {
        // 225a:00f4 writes a fresh terrain word rather than retaining any
        // high map flags from the chemical cell.
        writeMapBaseWord(
          sourceCell,
          0x0f + state.soilMoisture + (sourceCell[4] >> 2),
        );
        mapDirty = true;
      }
      clearMachineRender(tractorSlot);
      startMachineRoute(tractorSlot, record[12], record[13] - 1);
      record[4] = 3;
      changed = true;
    } else if (transferState === 3) {
      const tractorSlot = view.getUint16(16, true);
      const tractor = machineRecord(tractorSlot);
      if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
        return changed;
      record[5] = record[12];
      record[6] = record[13];
      const destinationCell = mapCell(record[12], record[13]);
      if (destinationCell) {
        // The native range test is `(id >= 0xdc) || (id <= 0xdf)`, so its
        // write is effectively unconditional even for malformed IDs.
        writeMapBaseWord(
          destinationCell,
          (0x0393 + view.getUint16(0, true) - 0x00dc) & 0xffff,
        );
        mapDirty = true;
      }
      const tractorView = stateView(tractor);
      tractorView.setUint16(2, tractorView.getUint16(2, true) & ~8, true);
      resetMachineAfterOperation(tractorSlot);
      startMachineRoute(tractorSlot, tractor[50], tractor[51]);
      view.setUint16(16, 0, true);
      record[4] = 0;
      changed = true;
    }
    processed += 1;
  }
  return changed;
}

function traverseFieldWithMachine(machineSlot, workTile = 0xffff) {
  const machine = machineRecord(machineSlot);
  if (!machine) return false;
  const field = fieldRecord(machine[48]);
  if (!field) return false;
  clearMachineRender(machineSlot);
  const machineWidth = machine[53];
  let x = machine[5] + (machine[49] & 0x80 ? machine[49] - 0x100 : machine[49]);
  let y = machine[6];
  let step = machine[49] & 0x80 ? machine[49] - 0x100 : machine[49];
  const workCell = mapCell(machine[5], machine[6]);
  if (workTile !== 0xffff && workCell) {
    const words = tileWords(workCell);
    const baseTile = words.base & 0x07ff;
    // FUN_0d5f_10de preserves the permanent 0x21b..0x299 field marker and
    // irrigation/status family while replacing eligible field cells. The
    // runtime plane's 0x10 field bit serializes as overlay bit 0x1000.
    if (
      (words.overlay & 0x1000) !== 0 &&
      (baseTile < 0x021b || baseTile >= 0x029a)
    ) {
      const base = (words.base & 0xf800) | workTile;
      workCell[0] = base & 0xff;
      workCell[1] = base >> 8;
    }
  }
  if (x >= field[10] + field[12] + 1) {
    step = -1;
    setMachineDirection(machineSlot, 6);
    x = field[10] + field[12] - 1;
    y += 1;
  }
  if (x < field[10] - 1) {
    step = 1;
    setMachineDirection(machineSlot, 2);
    y += 1;
    x = field[10];
  }
  if (y >= field[11] + field[13] - (machineWidth >> 1)) {
    renderMachineChain(machineSlot);
    return true;
  }
  const dx = x - machine[5];
  const dy = y - machine[6];
  let childSlot = stateView(machine).getUint16(46, true);
  while (childSlot !== 0) {
    const child = machineRecord(childSlot);
    child[5] = (child[5] + dx) & 0xff;
    child[6] = (child[6] + dy) & 0xff;
    child[49] = step & 0xff;
    childSlot = stateView(child).getUint16(46, true);
  }
  machine[5] = x & 0xff;
  machine[6] = y & 0xff;
  machine[49] = step & 0xff;
  renderMachineChain(machineSlot);
  return false;
}

function completeSprayOperation(slot, record, tractorSlot) {
  const operation = record[2];
  const fieldView = fieldRecordView(record);
  const tractor = machineRecord(tractorSlot);
  const attachmentSlot = stateView(tractor).getUint16(46, true);
  const attachment = machineRecord(attachmentSlot);
  startMachineRoute(tractorSlot, attachment[50], attachment[51]);
  const tractorView = stateView(tractor);
  tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x0100, true);
  fieldView.setUint16(42, 0, true);
  record[3] = 0;
  record[2] = record[4];
  record[3] = record[5];
  if (operation === 6) {
    restoreIdleFieldNutrients(record, 0xff);
  } else if (operation === 7) {
    addFieldCondition(record, 32, null, 0x20);
    subtractFieldCondition(record, 20, 2, record[20]);
    record[60] >>= 2;
  } else if (operation === 8) {
    addFieldCondition(record, 32, null, 0x20);
    subtractFieldCondition(record, 21, 4, record[21]);
    record[61] >>= 2;
  } else if (operation === 9) {
    addFieldCondition(record, 32, null, 0x20);
    subtractFieldCondition(record, 22, 3, record[22]);
    record[62] >>= 2;
  }
  // FUN_15b3_12d2 calls FUN_1957_0d9a while rebuilding the field's status
  // tiles, copying the current first nutrient byte into its cached value and
  // setting diagnostic bit 0x80 when that byte is below 128.
  record[28] = record[29];
  fieldView.setUint16(54, record[29] < 0x80 ? 0x80 : 0, true);
  mapDirty = true;
}

function completePlantingOperation(record, tractorSlot) {
  const fieldView = fieldRecordView(record);
  const tractor = machineRecord(tractorSlot);
  const tractorView = stateView(tractor);
  const attachmentSlot = tractorView.getUint16(46, true);
  const attachment = machineRecord(attachmentSlot);
  startMachineRoute(
    tractorSlot,
    Math.max(0, attachment[50] - 1),
    attachment[51],
  );
  tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x0100, true);
  record[34] = 0;
  fieldView.setUint16(38, 0, true);
  fieldView.setUint16(40, 0, true);
  record[6] = (record[6] | 4) & 0xfd;
  fieldView.setUint16(42, 0, true);
  record[3] = 0;
  record[2] = 4;
  fieldView.setUint16(
    36,
    cropPlantingValues.get(cropSlotName(record[14])) ?? 0,
    true,
  );
  fieldView.setUint16(18, 0, true);
  record[33] = (state.week + 1) & 3;
  record[28] = record[29];
  fieldView.setUint16(54, record[29] < 0x80 ? 0x80 : 0, true);
  mapDirty = true;
}

function advancePlantingFieldState(slot, record) {
  const fieldView = fieldRecordView(record);
  // The field-creation click can be serialized after the original has
  // reached substate 3.  Native creation preserves that observable state;
  // if its private machine pointers are still empty, restart the same
  // allocator sequence on the next machinery tick.
  if (record[3] === 3 && fieldView.getUint16(42, true) === 0) record[3] = 0;
  if (record[3] === 0) {
    record[3] = 1;
  } else if (record[3] === 1) {
    const tractorSlot = findAvailableMachine(0, record[10], record[11]);
    if (tractorSlot === 0) return false;
    const tractor = machineRecord(tractorSlot);
    const tractorView = stateView(tractor);
    tractorView.setUint16(2, tractorView.getUint16(2, true) | 8, true);
    fieldView.setUint16(42, tractorSlot, true);
    tractor[48] = slot;
    tractor[15] = 2;
    tractor[49] = 1;
    record[3] = 2;
  } else if (record[3] === 2) {
    const attachmentSlot = findAvailableMachine(1, record[10], record[11]);
    if (attachmentSlot === 0) return false;
    const tractorSlot = fieldView.getUint16(42, true);
    const tractor = machineRecord(tractorSlot);
    const tractorView = stateView(tractor);
    const attachment = machineRecord(attachmentSlot);
    const attachmentView = stateView(attachment);
    fieldView.setUint16(44, attachmentSlot, true);
    startMachineRoute(tractorSlot, attachment[5], attachment[6]);
    attachmentView.setUint16(2, attachmentView.getUint16(2, true) | 8, true);
    tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x1000, true);
    record[3] = 3;
  } else if (record[3] === 3) {
    const tractorSlot = fieldView.getUint16(42, true);
    const tractor = machineRecord(tractorSlot);
    if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
      return false;
    const attachmentSlot = fieldView.getUint16(44, true);
    fieldView.setUint16(44, 0, true);
    clearMachineRender(attachmentSlot);
    clearMachineRender(tractorSlot);
    if (!linkMachines(tractorSlot, attachmentSlot)) return false;
    const destination = fieldRouteDestination(record);
    startMachineRoute(tractorSlot, destination.x, destination.y);
    const tractorView = stateView(tractor);
    tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x1000, true);
    record[3] = 4;
  } else if (record[3] === 4) {
    const tractorSlot = fieldView.getUint16(42, true);
    const tractor = machineRecord(tractorSlot);
    if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
      return false;
    clearMachineRender(tractorSlot);
    tractor[5] = record[10];
    tractor[6] = record[11];
    record[3] = 5;
    setMachineDirection(tractorSlot, 2);
  } else if (record[3] === 5) {
    const tractorSlot = fieldView.getUint16(42, true);
    if (traverseFieldWithMachine(tractorSlot, 0x000c)) {
      const tractor = machineRecord(tractorSlot);
      const attachmentSlot = stateView(tractor).getUint16(46, true);
      const destination = storedMachineRouteDestination(attachmentSlot);
      startMachineRoute(tractorSlot, destination.x, destination.y);
      const tractorView = stateView(tractor);
      tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x0400, true);
      record[6] |= 2;
      record[3] = 6;
    }
  } else if (record[3] === 6) {
    const tractor = machineRecord(fieldView.getUint16(42, true));
    if (tractor && (stateView(tractor).getUint16(2, true) & 2) === 0)
      record[3] = 7;
  } else if (record[3] === 7) {
    const attachmentSlot = findAvailableMachine(2, record[10], record[11]);
    if (attachmentSlot === 0) return false;
    const tractorSlot = fieldView.getUint16(42, true);
    const tractor = machineRecord(tractorSlot);
    const tractorView = stateView(tractor);
    const attachment = machineRecord(attachmentSlot);
    const attachmentView = stateView(attachment);
    fieldView.setUint16(44, attachmentSlot, true);
    attachmentView.setUint16(2, attachmentView.getUint16(2, true) | 8, true);
    startMachineRoute(
      tractorSlot,
      Math.max(0, attachment[5] - 1),
      attachment[6],
    );
    tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x1000, true);
    record[3] = 8;
  } else if (record[3] === 8) {
    const tractorSlot = fieldView.getUint16(42, true);
    const tractor = machineRecord(tractorSlot);
    if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
      return false;
    const attachmentSlot = fieldView.getUint16(44, true);
    fieldView.setUint16(44, 0, true);
    clearMachineRender(attachmentSlot);
    clearMachineRender(tractorSlot);
    if (!linkMachines(tractorSlot, attachmentSlot)) return false;
    record[3] = 9;
  } else if (record[3] === 9) {
    const tractorSlot = fieldView.getUint16(42, true);
    const tractor = machineRecord(tractorSlot);
    if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
      return false;
    const destination = fieldRouteDestination(record);
    startMachineRoute(tractorSlot, destination.x, destination.y);
    const tractorView = stateView(tractor);
    tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x1000, true);
    record[3] = 10;
  } else if (record[3] === 10) {
    const tractorSlot = fieldView.getUint16(42, true);
    const tractor = machineRecord(tractorSlot);
    if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
      return false;
    tractor[48] = slot;
    tractor[15] = 2;
    tractor[49] = 1;
    clearMachineRender(tractorSlot);
    tractor[5] = record[10];
    tractor[6] = record[11];
    setMachineDirection(tractorSlot, 2);
    record[3] = 11;
  } else if (record[3] === 11) {
    const tractorSlot = fieldView.getUint16(42, true);
    if (traverseFieldWithMachine(tractorSlot, 0x02b0 + record[14] * 8)) {
      completePlantingOperation(record, tractorSlot);
    }
  }
  return true;
}

function reserveNearestCropStorage(x, y) {
  let selected = null;
  let selectedDistance = 0x4240;
  for (let slot = 1; slot < saveData.format.structureRecordCount; slot += 1) {
    const record = structureRecord(slot);
    const view = stateView(record);
    const id = view.getUint16(0, true);
    if ((view.getUint16(2, true) & 0x20) === 0 || (id !== 0x40 && id !== 0x41))
      continue;
    const definition = itemDefinitionForKeyAndId("structure", id);
    if (!definition) continue;
    let storageSlot = -1;
    for (
      let relativeX = 0;
      relativeX < definition.width && storageSlot < 0;
      relativeX += 1
    ) {
      for (let relativeY = 0; relativeY < definition.height; relativeY += 1) {
        const candidate = relativeX * 3 + relativeY;
        if (view.getUint16(34 + candidate * 2, true) === 0xffff) {
          storageSlot = candidate;
          break;
        }
      }
    }
    if (storageSlot < 0) continue;
    const dx = x - record[4];
    const dy = y - record[5];
    const distance = dx * dx + dy * dy;
    if (distance >= selectedDistance) continue;
    selectedDistance = distance;
    selected = { slot, record, definition, storageSlot };
  }
  if (!selected) return null;
  const view = stateView(selected.record);
  view.setUint16(34 + selected.storageSlot * 2, 0xfffe, true);
  return {
    ...selected,
    relativeX: Math.floor(selected.storageSlot / 3),
    relativeY: selected.storageSlot % 3,
  };
}

function harvestQuality(record) {
  // FUN_1957_0a3a computes a 16.16 crop-stage mismatch penalty. The result
  // is thresholded, saturated, and then combined with the field's accrued
  // quality word by FUN_1957_0ade using the original unsigned carry rule.
  const definition = cropSimulationDefinitionForSlot(record[14]);
  const stageCount = definition?.stageCount ?? 0;
  const plantingValue = cropPlantingValues.get(cropSlotName(record[14])) ?? 0;
  const progress =
    plantingValue === 0
      ? 0
      : Math.floor(
          fieldRecordView(record).getUint16(38, true) / (plantingValue + 2),
        );
  const signedByte = (value) => (value & 0x80 ? value - 0x100 : value);
  const delta = signedByte(record[34]) - signedByte(progress & 0xff);
  const numerator = (delta & 0xffff) * 0x10000;
  const quotient = stageCount === 0 ? 0 : Math.floor(numerator / stageCount);
  let penalty = quotient >= 0x10000 ? 0xffff : quotient & 0xffff;
  if (penalty < 0x2000) penalty = 0;
  const accumulated = fieldRecordView(record).getUint16(18, true);
  const result = 0xffff - penalty + accumulated;
  return result > 0xffff ? 0xffff : result;
}

function harvestValueAtPrice(record, price) {
  const quality = harvestQuality(record);
  if (quality > 51000) return 0;
  const quantity = cropHarvestQuantities.get(cropSlotName(record[14])) ?? 0;
  return Math.floor(
    (quantity * Math.floor(price / 10) * (0xffff - quality)) / 0x10000,
  );
}

function settleHarvestContract(record) {
  const fieldView = fieldRecordView(record);
  const contractPrice = fieldView.getUint16(48, true);
  if (contractPrice === 0) return false;
  const commodity = itemDefinitionForKeyAndId("commodity", 0x80 + record[14]);
  if (!commodity) return false;
  const commodityView = stateView(commodity.record);
  commodityView.setUint16(4, (commodity.own - 1) & 0xffff, true);
  const contractedValue = harvestValueAtPrice(record, contractPrice);
  fieldView.setUint16(48, 0, true);
  const marketValue = harvestValueAtPrice(record, commodity.price);
  const saveView = stateView(farmStateBytes);
  if (contractedValue >= marketValue) {
    const difference = contractedValue - marketValue;
    saveView.setUint32(
      saveData.format.contractGainIncomeOffset,
      saveView.getUint32(saveData.format.contractGainIncomeOffset, true) +
        difference,
      true,
    );
  } else {
    const difference = marketValue - contractedValue;
    saveView.setUint32(
      saveData.format.contractLossExpenseOffset,
      saveView.getUint32(saveData.format.contractLossExpenseOffset, true) +
        difference,
      true,
    );
  }
  saveView.setUint32(
    saveData.format.storedCropSaleIncomeOffset,
    saveView.getUint32(saveData.format.storedCropSaleIncomeOffset, true) +
      contractedValue,
    true,
  );
  addTaxableSaleIncome(contractedValue);
  state.funds += contractedValue;
  return true;
}

function clearTruckHarvestPayload(truckSlot, clearStorageReference = true) {
  const truck = machineRecord(truckSlot);
  const view = stateView(truck);
  view.setUint16(20, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(38, 0, true);
  view.setUint16(40, 0, true);
  truck[42] = 0;
  if (clearStorageReference) view.setUint16(44, 0, true);
}

function finishHarvestField(record) {
  const view = fieldRecordView(record);
  const definition = cropSimulationDefinitionForSlot(record[14]);
  const perennial = (definition?.perennialFlags & 1) !== 0;
  record[3] = 0;
  view.setUint16(44, 0, true);
  view.setUint16(38, 0, true);
  view.setUint16(40, 0, true);
  view.setUint16(18, 0, true);
  record[33] = 0;
  if (perennial) {
    record[34] =
      cropSlotName(record[14]) === "apples" ||
      cropSlotName(record[14]) === "oranges"
        ? 1
        : 0;
    record[2] = 4;
  } else {
    record[34] = 0;
    record[2] = 0;
  }
  if (!perennial) record[6] &= 0xf9;
  mapDirty = true;
}

function allocateHarvestStorageLot(record, storage) {
  let lotSlot = 0;
  for (let slot = 1; slot < saveData.format.storageLotRecordCount; slot += 1) {
    if ((storageLotRecord(slot)[10] & 0x20) === 0) {
      lotSlot = slot;
      break;
    }
  }
  if (lotSlot === 0) return 0;
  const cropId = 0x00a8 + record[14];
  const lot = storageLotRecord(lotSlot);
  const lotView = stateView(lot);
  lotView.setUint16(0, cropId, true);
  lotView.setUint16(
    2,
    cropHarvestQuantities.get(cropSlotName(record[14])) ?? 0,
    true,
  );
  lotView.setUint16(4, harvestQuality(record), true);
  lotView.setUint16(6, 0, true);
  lot[8] = storage.record[4] + storage.relativeX;
  lot[9] = storage.record[5] + storage.relativeY;
  lot[10] = 0x20;
  lot[11] = 0;
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.storageLotCountOffset,
    saveView.getUint16(saveData.format.storageLotCountOffset, true) + 1,
    true,
  );
  const definition = itemDefinitionForKeyAndId("stored-crop", cropId);
  if (definition) {
    const definitionView = stateView(definition.record);
    definitionView.setUint16(4, definitionView.getUint16(4, true) + 1, true);
  }
  writeStructureStorageItem(
    storage,
    storage.storageSlot,
    { id: cropId },
    0x0330 + record[14],
    lotSlot,
  );
  return lotSlot;
}

function sellHarvestDirectly(record) {
  const synthetic = new Uint8Array(12);
  const view = stateView(synthetic);
  const cropId = 0x00a8 + record[14];
  view.setUint16(0, cropId, true);
  view.setUint16(
    2,
    cropHarvestQuantities.get(cropSlotName(record[14])) ?? 0,
    true,
  );
  view.setUint16(4, harvestQuality(record), true);
  const quantity = view.getUint16(2, true);
  const quality = view.getUint16(4, true);
  const storedCrop = itemDefinitionForKeyAndId("stored-crop", cropId);
  const value =
    !storedCrop || quality > 51000
      ? 0
      : Math.floor(
          (quantity * Math.floor(storedCrop.price / 10) * (0xffff - quality)) /
            0x10000,
        );
  state.funds += value;
  const saveView = stateView(farmStateBytes);
  saveView.setUint32(
    saveData.format.storedCropSaleIncomeOffset,
    saveView.getUint32(saveData.format.storedCropSaleIncomeOffset, true) +
      value,
    true,
  );
  addTaxableSaleIncome(value);
}

function completeMechanizedHarvestPass(record, harvesterSlot) {
  const fieldView = fieldRecordView(record);
  const harvester = machineRecord(harvesterSlot);
  const harvesterView = stateView(harvester);
  const headerSlot = harvesterView.getUint16(46, true);
  const header = machineRecord(headerSlot);
  const truckSlot = fieldView.getUint16(44, true);
  const truck = machineRecord(truckSlot);
  const truckView = stateView(truck);
  fieldView.setUint16(64, 0, true);
  record[66] = 0xff;
  record[67] = 0xff;
  if (settleHarvestContract(record)) {
    clearTruckHarvestPayload(truckSlot);
    startMachineRoute(truckSlot, truck[50], truck[51]);
    truckView.setUint16(2, truckView.getUint16(2, true) | 0x0200, true);
    finishHarvestField(record);
  } else {
    const storage = reserveNearestCropStorage(truck[5], truck[6]);
    setQuickMessage(5);
    truckView.setUint16(20, harvesterView.getUint16(20, true), true);
    truckView.setUint16(32, harvestQuality(record), true);
    truckView.setUint16(34, 0x00a8 + record[14], true);
    truck[42] = 1;
    if (storage) {
      fieldView.setUint16(64, storage.slot, true);
      record[66] = storage.relativeX;
      record[67] = storage.relativeY;
      const destination = perimeterRoadDestination(
        storage.record[4],
        storage.record[5],
        storage.definition.width,
        storage.definition.height,
        { x: Math.max(0, storage.record[4] - 1), y: storage.record[5] },
      );
      startMachineRoute(truckSlot, destination.x, destination.y);
      truckView.setUint16(44, storage.slot, true);
      truckView.setUint16(2, truckView.getUint16(2, true) | 0x1000, true);
      record[3] = 6;
    } else {
      sellHarvestDirectly(record);
      const saveView = stateView(farmStateBytes);
      startMachineRoute(
        truckSlot,
        saveView.getUint16(saveData.format.autoLeaseReducedXOffset, true) * 8,
        saveView.getUint16(saveData.format.autoLeaseReducedYOffset, true) * 8,
      );
      truckView.setUint16(2, truckView.getUint16(2, true) | 0x1000, true);
      record[3] = 7;
    }
  }
  header[42] = 0;
  startMachineRoute(harvesterSlot, header[50], header[51]);
  harvesterView.setUint16(2, harvesterView.getUint16(2, true) | 0x0100, true);
  fieldView.setUint16(42, 0, true);
  record[6] &= 0xf9;
}

function finishHarvestTruckTrip(
  record,
  truckSlot,
  storage = null,
  preserveStorageReference = false,
  preservePayload = false,
) {
  if (storage) {
    const lotSlot = allocateHarvestStorageLot(record, storage);
    if (lotSlot === 0) {
      const storageView = stateView(storage.record);
      storageView.setUint16(34 + storage.storageSlot * 2, 0xffff, true);
      sellHarvestDirectly(record);
    }
  }
  const fieldView = fieldRecordView(record);
  fieldView.setUint16(64, 0, true);
  const truck = machineRecord(truckSlot);
  const truckView = stateView(truck);
  if (preservePayload) {
    truck[42] = 0;
    if (!preserveStorageReference) truckView.setUint16(44, 0, true);
  } else {
    clearTruckHarvestPayload(truckSlot, !preserveStorageReference);
  }
  startMachineRoute(truckSlot, truck[50], truck[51]);
  truckView.setUint16(2, (truckView.getUint16(2, true) & ~8) | 0x0200, true);
  finishHarvestField(record);
}

function scatterManualHarvestMarkers(record) {
  for (let relativeX = 0; relativeX < 8; relativeX += 1) {
    for (let relativeY = 0; relativeY < 8; relativeY += 1) {
      const random = nextSimRandom();
      if ((random & 7) >= 6) continue;
      const cell = mapCell(record[10] + relativeX, record[11] + relativeY);
      if (!cell) continue;
      const view = stateView(cell);
      const base = view.getUint16(0, true);
      if ((base & 0x0800) !== 0) continue;
      const overlay = view.getUint16(2, true);
      view.setUint16(
        2,
        (overlay & 0xf800) | (0x040c + (nextSimRandom() & 1)),
        true,
      );
      view.setUint16(0, base | 0x0800, true);
    }
  }
  mapDirty = true;
}

function clearManualHarvestMarkers(record) {
  const definition = cropSimulationDefinitionForSlot(record[14]);
  const perennial = (definition?.perennialFlags & 1) !== 0;
  for (let relativeX = 0; relativeX < 8; relativeX += 1) {
    for (let relativeY = 0; relativeY < 8; relativeY += 1) {
      const cell = mapCell(record[10] + relativeX, record[11] + relativeY);
      if (!cell) continue;
      const view = stateView(cell);
      let base = view.getUint16(0, true) & ~0x0800;
      if (!perennial) base = (base & 0xf800) | 0x0024;
      view.setUint16(0, base, true);
    }
  }
  mapDirty = true;
}

function prepareManualHarvestDelivery(record, truckSlot) {
  const fieldView = fieldRecordView(record);
  const truck = machineRecord(truckSlot);
  const truckView = stateView(truck);
  const storage = reserveNearestCropStorage(truck[5], truck[6]);
  setQuickMessage(5);
  fieldView.setUint16(64, 0, true);
  record[66] = 0xff;
  record[67] = 0xff;
  truckView.setUint16(20, 0, true);
  truckView.setUint16(32, harvestQuality(record), true);
  truckView.setUint16(34, 0x00a8 + record[14], true);
  truck[42] = 1;
  if (storage) {
    fieldView.setUint16(64, storage.slot, true);
    record[66] = storage.relativeX;
    record[67] = storage.relativeY;
    const destination = perimeterRoadDestination(
      storage.record[4],
      storage.record[5],
      storage.definition.width,
      storage.definition.height,
      { x: Math.max(0, storage.record[4] - 1), y: storage.record[5] },
    );
    startMachineRoute(truckSlot, destination.x, destination.y);
    truckView.setUint16(44, storage.slot, true);
    truckView.setUint16(2, truckView.getUint16(2, true) | 0x1000, true);
    record[3] = 15;
  } else {
    const saveView = stateView(farmStateBytes);
    startMachineRoute(
      truckSlot,
      saveView.getUint16(saveData.format.autoLeaseReducedXOffset, true) * 8,
      saveView.getUint16(saveData.format.autoLeaseReducedYOffset, true) * 8,
    );
    truckView.setUint16(2, truckView.getUint16(2, true) | 0x1000, true);
    record[3] = 16;
  }
}

function advanceManualHarvestFieldState(slot, record) {
  const fieldView = fieldRecordView(record);
  if (record[3] === 10) {
    const laborCost = fieldView.getUint16(58, true);
    if (state.funds < laborCost) {
      // The original charge helper emits record 42, then this harvest
      // branch immediately replaces it with record 63 ("Bulldoze").
      setQuickMessage(0x2a);
      setQuickMessage(0x3f);
      return false;
    }
    state.funds -= laborCost;
    record[3] = 11;
  } else if (record[3] === 11) {
    const truckSlot = findAvailableMachine(7, record[10], record[11]);
    if (truckSlot === 0) {
      setQuickMessage(0x1e);
      return false;
    }
    const truck = machineRecord(truckSlot);
    const truckView = stateView(truck);
    truckView.setUint16(2, truckView.getUint16(2, true) | 8, true);
    fieldView.setUint16(44, truckSlot, true);
    const destination = fieldRouteDestination(record);
    startMachineRoute(truckSlot, destination.x, destination.y);
    truckView.setUint16(2, truckView.getUint16(2, true) | 0x1000, true);
    record[3] = 12;
  } else if (record[3] === 12) {
    const truck = machineRecord(fieldView.getUint16(44, true));
    if (!truck || (stateView(truck).getUint16(2, true) & 2) !== 0) return false;
    record[3] = 13;
    fieldView.setUint16(46, 0, true);
    manualHarvestAnimationTicks.set(slot, 0);
    scatterManualHarvestMarkers(record);
  } else if (record[3] === 13) {
    const elapsed = (manualHarvestAnimationTicks.get(slot) ?? 0) + 1;
    manualHarvestAnimationTicks.set(slot, elapsed);
    if (elapsed < 3) return false;
    manualHarvestAnimationTicks.delete(slot);
    clearManualHarvestMarkers(record);
    record[3] = 14;
  } else if (record[3] === 14) {
    const truckSlot = fieldView.getUint16(44, true);
    const truck = machineRecord(truckSlot);
    if (!truck) return false;
    if (fieldView.getUint16(48, true) !== 0) {
      fieldView.setUint16(64, 0, true);
      record[66] = 0xff;
      record[67] = 0xff;
      settleHarvestContract(record);
      clearTruckHarvestPayload(truckSlot);
      startMachineRoute(truckSlot, truck[50], truck[51]);
      const truckView = stateView(truck);
      truckView.setUint16(
        2,
        (truckView.getUint16(2, true) & ~8) | 0x0200,
        true,
      );
      finishHarvestField(record);
    } else {
      prepareManualHarvestDelivery(record, truckSlot);
    }
  } else if (record[3] === 15) {
    const truckSlot = fieldView.getUint16(44, true);
    const truck = machineRecord(truckSlot);
    if (!truck || (stateView(truck).getUint16(2, true) & 2) !== 0) return false;
    const structureSlot = fieldView.getUint16(64, true);
    const structureRecordBytes = structureRecord(structureSlot);
    const id = stateView(structureRecordBytes).getUint16(0, true);
    finishHarvestTruckTrip(
      record,
      truckSlot,
      {
        slot: structureSlot,
        record: structureRecordBytes,
        definition: itemDefinitionForKeyAndId("structure", id),
        storageSlot: record[66] * 3 + record[67],
        relativeX: record[66],
        relativeY: record[67],
      },
      true,
    );
  } else if (record[3] === 16) {
    const truckSlot = fieldView.getUint16(44, true);
    const truck = machineRecord(truckSlot);
    if (!truck || (stateView(truck).getUint16(2, true) & 2) !== 0) return false;
    sellHarvestDirectly(record);
    // The original manual no-silo path leaves the crop ID and quality in
    // the truck record after returning home; only its payload-active byte
    // and storage reference are cleared.
    finishHarvestTruckTrip(record, truckSlot, null, false, true);
  }
  return true;
}

function advanceMechanizedHarvestFieldState(slot, record) {
  const fieldView = fieldRecordView(record);
  if (record[3] === 0) {
    const harvesterSlot = findAvailableMachine(4, record[10], record[11]);
    if (harvesterSlot === 0) return false;
    const harvester = machineRecord(harvesterSlot);
    const view = stateView(harvester);
    view.setUint16(2, view.getUint16(2, true) | 8, true);
    harvester[48] = slot;
    fieldView.setUint16(42, harvesterSlot, true);
    record[3] = 1;
  } else if (record[3] === 1) {
    const headerSlot = findAvailableMachine(5, record[10], record[11]);
    if (headerSlot === 0) return false;
    const harvesterSlot = fieldView.getUint16(42, true);
    const harvester = machineRecord(harvesterSlot);
    fieldView.setUint16(46, headerSlot, true);
    const header = machineRecord(headerSlot);
    startMachineRoute(harvesterSlot, Math.max(0, header[5] - 1), header[6]);
    const view = stateView(harvester);
    view.setUint16(2, view.getUint16(2, true) | 0x1000, true);
    record[3] = 2;
  } else if (record[3] === 2) {
    const truckSlot = findAvailableMachine(7, record[10], record[11]);
    if (truckSlot === 0) {
      setQuickMessage(0x1e);
      return false;
    }
    const truck = machineRecord(truckSlot);
    const truckView = stateView(truck);
    truckView.setUint16(2, truckView.getUint16(2, true) | 8, true);
    fieldView.setUint16(44, truckSlot, true);
    const destination = fieldRouteDestination(record);
    startMachineRoute(truckSlot, destination.x, destination.y);
    truckView.setUint16(2, truckView.getUint16(2, true) | 0x1000, true);
    record[3] = 3;
  } else if (record[3] === 3) {
    const harvesterSlot = fieldView.getUint16(42, true);
    const harvester = machineRecord(harvesterSlot);
    if (!harvester || (stateView(harvester).getUint16(2, true) & 2) !== 0)
      return false;
    const headerSlot = fieldView.getUint16(46, true);
    fieldView.setUint16(46, 0, true);
    clearMachineRender(headerSlot);
    clearMachineRender(harvesterSlot);
    if (!linkMachines(harvesterSlot, headerSlot)) return false;
    const destination = fieldRouteDestination(record);
    startMachineRoute(harvesterSlot, destination.x, destination.y);
    const view = stateView(harvester);
    view.setUint16(2, view.getUint16(2, true) | 0x1000, true);
    record[3] = 4;
  } else if (record[3] === 4) {
    const harvesterSlot = fieldView.getUint16(42, true);
    const truckSlot = fieldView.getUint16(44, true);
    const harvester = machineRecord(harvesterSlot);
    const truck = machineRecord(truckSlot);
    if (
      !harvester ||
      !truck ||
      (stateView(harvester).getUint16(2, true) & 2) !== 0 ||
      (stateView(truck).getUint16(2, true) & 2) !== 0
    )
      return false;
    clearMachineRender(harvesterSlot);
    harvester[5] = record[10];
    harvester[6] = record[11];
    setMachineDirection(harvesterSlot, 2);
    record[3] = 5;
  } else if (record[3] === 5) {
    const harvesterSlot = fieldView.getUint16(42, true);
    const definition = cropSimulationDefinitionForSlot(record[14]);
    const workTile = (definition?.perennialFlags & 1) !== 0 ? 0xffff : 0x0024;
    if (traverseFieldWithMachine(harvesterSlot, workTile)) {
      completeMechanizedHarvestPass(record, harvesterSlot);
    }
  } else if (record[3] === 6) {
    const truckSlot = fieldView.getUint16(44, true);
    const truck = machineRecord(truckSlot);
    if (!truck || (stateView(truck).getUint16(2, true) & 2) !== 0) return false;
    const structureSlot = fieldView.getUint16(64, true);
    const structureRecordBytes = structureRecord(structureSlot);
    const id = stateView(structureRecordBytes).getUint16(0, true);
    const storageSlot = record[66] * 3 + record[67];
    finishHarvestTruckTrip(record, truckSlot, {
      slot: structureSlot,
      record: structureRecordBytes,
      definition: itemDefinitionForKeyAndId("structure", id),
      storageSlot,
      relativeX: record[66],
      relativeY: record[67],
    });
  } else if (record[3] === 7) {
    const truckSlot = fieldView.getUint16(44, true);
    const truck = machineRecord(truckSlot);
    if (!truck || (stateView(truck).getUint16(2, true) & 2) !== 0) return false;
    finishHarvestTruckTrip(record, truckSlot);
  }
  return true;
}

function advanceScheduledFieldSupplyStates() {
  for (const { slot, record } of activeFieldRecords()) {
    if (record[2] === 3) {
      if (!advancePlantingFieldState(slot, record)) return false;
      continue;
    }
    if (record[2] === 5 && record[3] < 8) {
      if (!advanceMechanizedHarvestFieldState(slot, record)) return false;
      continue;
    }
    if (record[2] === 5 && record[3] >= 10 && record[3] <= 16) {
      if (!advanceManualHarvestFieldState(slot, record)) return false;
      continue;
    }
    if (record[2] < 6 || record[2] > 9) continue;
    const fieldView = fieldRecordView(record);
    if (record[3] === 0) {
      const chemicalId = 0xdc + (record[2] - 6);
      if (!consumeStoredChemical(chemicalId)) return false;
      record[3] = 1;
    } else if (record[3] === 1) {
      const tractorSlot = findAvailableMachine(0, record[10], record[11]);
      if (tractorSlot === 0) continue;
      const tractor = machineRecord(tractorSlot);
      const tractorView = stateView(tractor);
      tractorView.setUint16(2, tractorView.getUint16(2, true) | 8, true);
      fieldView.setUint16(42, tractorSlot, true);
      tractor[48] = slot;
      tractor[15] = 2;
      tractor[49] = 1;
      record[3] = 2;
    } else if (record[3] === 2) {
      const attachmentSlot = findAvailableMachine(3, record[10], record[11]);
      if (attachmentSlot === 0) continue;
      const tractorSlot = fieldView.getUint16(42, true);
      const tractor = machineRecord(tractorSlot);
      const tractorView = stateView(tractor);
      const attachment = machineRecord(attachmentSlot);
      const attachmentView = stateView(attachment);
      fieldView.setUint16(44, attachmentSlot, true);
      startMachineRoute(tractorSlot, attachment[5], attachment[6]);
      attachmentView.setUint16(2, attachmentView.getUint16(2, true) | 8, true);
      tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x1000, true);
      record[3] = 3;
    } else if (record[3] === 3) {
      const tractorSlot = fieldView.getUint16(42, true);
      const tractor = machineRecord(tractorSlot);
      if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
        continue;
      const attachmentSlot = fieldView.getUint16(44, true);
      fieldView.setUint16(44, 0, true);
      clearMachineRender(attachmentSlot);
      clearMachineRender(tractorSlot);
      if (!linkMachines(tractorSlot, attachmentSlot)) continue;
      const destination = fieldRouteDestination(record);
      startMachineRoute(tractorSlot, destination.x, destination.y);
      const tractorView = stateView(tractor);
      tractorView.setUint16(2, tractorView.getUint16(2, true) | 0x1000, true);
      record[3] = 4;
    } else if (record[3] === 4) {
      const tractorSlot = fieldView.getUint16(42, true);
      const tractor = machineRecord(tractorSlot);
      if (!tractor || (stateView(tractor).getUint16(2, true) & 2) !== 0)
        continue;
      clearMachineRender(tractorSlot);
      tractor[5] = record[10];
      tractor[6] = record[11];
      record[3] = 5;
      setMachineDirection(tractorSlot, 2);
    } else if (record[3] === 5) {
      const tractorSlot = fieldView.getUint16(42, true);
      if (traverseFieldWithMachine(tractorSlot)) {
        completeSprayOperation(slot, record, tractorSlot);
      }
    }
  }
  return true;
}
