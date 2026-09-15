// Overview and analytical maps, terrain state, and irrigation.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function drawMapWindow() {
  const skinMarker = markerIndex ?? 0;
  if (markerIndex === null) {
    drawTitleBar(80, 64, 288, "MAP");
    context.drawImage(images.mapWindow0, 0, 16, 288, 240, 80, 80, 288, 240);
  } else context.drawImage(images[`mapWindow${markerIndex}`], 80, 64);
  if (mapMode >= 0) {
    context.drawImage(images[`map${skinMarker}-${mapMode}`], 152, 80);
    if (mapMode === 0) drawLivePropertyMap();
    else if (
      markerIndex === null ||
      cameraMoved() ||
      overviewHasLiveTileChanges() ||
      weatherPaletteDiffersFromCapturedScenario()
    )
      drawDecodedAnalyticalMap(mapMode);
    else if (conditionMapRecordOffsets.has(mapMode))
      drawLiveConditionMap(mapMode);
    else if (mapMode === 3) drawLiveGroundwaterMap();
    else if (mapMode === 5) drawLiveFieldProfitMap();
    context.drawImage(images[`mapStatus${skinMarker}-${mapMode}`], 88, 280);
    if (mapMode === 0 && selectedParcel) drawParcelValue();
  } else if (
    markerIndex === null ||
    cameraMoved() ||
    mapDirty ||
    weatherPaletteDiffersFromCapturedScenario()
  ) {
    drawDecodedOverview();
  }
  if (markerIndex === null && mapMode !== 0 && farmStateBytes) {
    context.fillStyle = "#c3c3c3";
    context.fillRect(96, 260, 48, 12);
    const value = String(parcelLandValue(0, 0));
    drawText(value, 96 + Math.floor((48 - value.length * 8) / 2), 264);
  }
}

function navigateFromOverview(point) {
  if (
    stage !== "game" ||
    activeWindow !== "map" ||
    modalNotice ||
    !editVisible ||
    mapMode === 0 ||
    !inside(point, 152, 80, 193, 193)
  )
    return false;
  // Map callback7a62:0aea maps two overview pixels to one farm cell.
  // The selected cell becomes the viewport origin (not its center). This
  // callback's own clamp includes Edit's48/32px client insets, unlike the
  // scrollbar clamp:96-(48+544)/16=59,96-(32+368)/16=71. camera.x
  // retains our historical origin+1 convention; the first column usesx-1.
  camera.x = 1 + Math.max(0, Math.min(59, Math.floor((point.x - 152) / 2)));
  camera.y = Math.max(0, Math.min(71, Math.floor((point.y - 80) / 2)));
  mapDirty = true;
  return true;
}

function readMapWindowPixels(x, y, width, height) {
  // Canvas pixel I/O ignores the current transform. Map painters run under
  // their moved window's translation, so apply that translation explicitly.
  const position = gameWindowPosition("map");
  return context.getImageData(
    x + position.x - 80,
    y + position.y - 64,
    width,
    height,
  );
}

function writeMapWindowPixels(pixels, x, y) {
  const position = gameWindowPosition("map");
  context.putImageData(pixels, x + position.x - 80, y + position.y - 64);
}

function drawDecodedAnalyticalMap(mode) {
  if (
    !farmStateBytes ||
    typeof context.getImageData !== "function" ||
    typeof context.putImageData !== "function"
  )
    return;
  const pixels = readMapWindowPixels(152, 80, 192, 192);
  if (!pixels?.data) return;
  const indexes = new Uint8Array(192 * 192);
  const conditionOffset = conditionMapRecordOffsets.get(mode);
  const fields = activeFieldRecords();
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      let pattern;
      if (mode === 3) pattern = groundwaterMapPattern(farmStateBytes, x, y);
      else {
        const field = fields.find(({ record }) =>
          fieldRecordContainsCell(record, x, y),
        );
        if (mode === 5) {
          pattern = field
            ? fieldProfitMapPattern(field.record)
            : farMapPatternForCell(farmStateBytes, x, y);
        } else {
          pattern =
            field && conditionOffset !== undefined
              ? conditionMapDither[field.record[conditionOffset] >> 3]
              : mode === 4
                ? "PPPP"
                : "GGGG";
        }
      }
      for (let pixel = 0; pixel < 4; pixel += 1) {
        setOverviewPixel(
          pixels,
          indexes,
          x * 2 + (pixel & 1),
          y * 2 + (pixel >> 1),
          mapPatternPaletteIndex(pattern, pixel),
        );
      }
    }
  }
  drawOverviewAnnotations(pixels, indexes);
  writeMapWindowPixels(pixels, 152, 80);
}

function activeFieldRecordsFromBytes(bytes) {
  if (!bytes || !saveData) return [];
  const fields = [];
  for (let slot = 1; slot < saveData.format.fieldRecordCount; slot += 1) {
    const start =
      saveData.format.fieldRecordOffset +
      slot * saveData.format.fieldRecordSize;
    const record = bytes.subarray(
      start,
      start + saveData.format.fieldRecordSize,
    );
    if ((record[7] & 1) !== 0) fields.push(record);
  }
  return fields;
}

function pixelMatchesColor(data, offset, color) {
  return (
    data[offset] === color[0] &&
    data[offset + 1] === color[1] &&
    data[offset + 2] === color[2]
  );
}

function farMapPixelPair(value) {
  return [
    ((value >> 7) & 1) |
      ((value >> 4) & 2) |
      ((value >> 1) & 4) |
      ((value << 2) & 8),
    ((value >> 6) & 1) | ((value >> 3) & 2) | (value & 4) | ((value << 3) & 8),
  ];
}

function farMapPattern(tileIndex) {
  if (!(tileIndex >= 0 && tileIndex * 2 + 1 < farMapTileBytes.length))
    return [0, 0, 0, 0];
  return [
    ...farMapPixelPair(farMapTileBytes[tileIndex * 2]),
    ...farMapPixelPair(farMapTileBytes[tileIndex * 2 + 1]),
  ];
}

function farMapPaletteColor(index) {
  if (index === 7 && state.currentWeatherCondition === 3)
    return farMapPalette[6];
  if (index === 7 && state.currentWeatherCondition === 4)
    return farMapPalette[15];
  return farMapPalette[index & 15];
}

function mapPatternPaletteIndex(pattern, pixel) {
  const value = pattern[pixel];
  return typeof value === "number"
    ? value & 15
    : conditionMapPaletteIndexes[value];
}

function paintMapField(record, targetPatternForCell, sourcePatternForCell) {
  if (
    !record ||
    typeof context.getImageData !== "function" ||
    typeof context.putImageData !== "function"
  )
    return;
  const fieldX = record[10];
  const fieldY = record[11];
  const fieldWidth = Math.min(record[12], 96 - fieldX);
  const fieldHeight = Math.min(record[13], 96 - fieldY);
  if (fieldWidth <= 0 || fieldHeight <= 0) return;
  const left = 152 + fieldX * 2;
  const top = 80 + fieldY * 2;
  const pixels = readMapWindowPixels(
    left,
    top,
    fieldWidth * 2,
    fieldHeight * 2,
  );
  if (!pixels?.data) return;
  const pixelWidth = fieldWidth * 2;
  for (let cellY = 0; cellY < fieldHeight; cellY += 1) {
    for (let cellX = 0; cellX < fieldWidth; cellX += 1) {
      const targetPattern = targetPatternForCell(
        fieldX + cellX,
        fieldY + cellY,
      );
      const sourcePattern = sourcePatternForCell(
        fieldX + cellX,
        fieldY + cellY,
      );
      for (let pixel = 0; pixel < 4; pixel += 1) {
        const x = cellX * 2 + (pixel & 1);
        const y = cellY * 2 + (pixel >> 1);
        const offset = (y * pixelWidth + x) * 4;
        const sourceIndex = mapPatternPaletteIndex(sourcePattern, pixel);
        const sourceColor = farMapPaletteColor(sourceIndex);
        const xorSourceColor = farMapPaletteColor(sourceIndex ^ 15);
        const xorAnnotation = pixelMatchesColor(
          pixels.data,
          offset,
          xorSourceColor,
        );
        // Unrelated river/town pixels are neither the expected source color
        // nor its palette-XOR annotation and remain untouched.
        if (
          !xorAnnotation &&
          !pixelMatchesColor(pixels.data, offset, sourceColor)
        )
          continue;
        const targetIndex = mapPatternPaletteIndex(targetPattern, pixel);
        const color = farMapPaletteColor(
          xorAnnotation ? targetIndex ^ 15 : targetIndex,
        );
        pixels.data[offset] = color[0];
        pixels.data[offset + 1] = color[1];
        pixels.data[offset + 2] = color[2];
      }
    }
  }
  writeMapWindowPixels(pixels, left, top);
}

function paintConditionMapField(record, pattern, sourcePattern = pattern) {
  paintMapField(
    record,
    () => pattern,
    () => sourcePattern,
  );
}

function mapCellFromBytes(bytes, x, y) {
  if (!bytes || !saveData || x < 0 || x >= 96 || y < 0 || y >= 96) return null;
  const format = saveData.format;
  const offset =
    format.displayCellMapOffset +
    (x * format.mapHeight + y) * format.mapCellSize;
  return bytes.subarray(offset, offset + format.mapCellSize);
}

function farMapPatternForCell(bytes, x, y) {
  const cell = mapCellFromBytes(bytes, x, y);
  return farMapPattern(cell ? tileWords(cell).base & 0x07ff : 0);
}

function fieldProfitMapPattern(record) {
  const quality = stateView(record).getUint16(18, true);
  return conditionMapDither[31 - (quality >> 11)];
}

function fieldRecordContainsCell(record, x, y) {
  return (
    x >= record[10] &&
    x < record[10] + record[12] &&
    y >= record[11] &&
    y < record[11] + record[13]
  );
}

function drawLiveFieldProfitMap() {
  if (!farmStateBytes || !authoredWindbreakBytes) return;
  // First erase every authored profit rectangle using the live tile beneath
  // each old position. This also handles deleted, resized, and moved fields.
  const authoredFields = activeFieldRecordsFromBytes(authoredWindbreakBytes);
  for (const record of authoredFields) {
    const sourcePattern = fieldProfitMapPattern(record);
    paintMapField(
      record,
      (x, y) => farMapPatternForCell(farmStateBytes, x, y),
      () => sourcePattern,
    );
  }
  // A current field can occupy either an authored field position (which the
  // pass above restored from the live tile) or virgin terrain (which still
  // has the authored tile pattern). Select that source once so a target
  // color that happens to equal source^15 cannot be toggled a second time.
  for (const { record } of activeFieldRecords()) {
    const targetPattern = fieldProfitMapPattern(record);
    paintMapField(
      record,
      () => targetPattern,
      (x, y) =>
        farMapPatternForCell(
          authoredFields.some((authored) =>
            fieldRecordContainsCell(authored, x, y),
          )
            ? farmStateBytes
            : authoredWindbreakBytes,
          x,
          y,
        ),
    );
  }
}

function drawLiveConditionMap(mode) {
  const recordOffset = conditionMapRecordOffsets.get(mode);
  if (recordOffset === undefined || !farmStateBytes) return;
  const background = mode === 4 ? "PPPP" : "GGGG";
  // Remove every authored field first so bulldozed fields do not remain in
  // the scenario capture, then render the complete current field table.
  for (const record of activeFieldRecordsFromBytes(authoredWindbreakBytes)) {
    paintConditionMapField(
      record,
      background,
      conditionMapDither[record[recordOffset] >> 3],
    );
  }
  for (const { record } of activeFieldRecords()) {
    paintConditionMapField(
      record,
      conditionMapDither[record[recordOffset] >> 3],
      background,
    );
  }
}

function groundwaterMapPattern(bytes, x, y) {
  const cell = mapCellFromBytes(bytes, x, y);
  if (!cell) return conditionMapDither[11];
  const base = stateView(cell).getUint16(0, true);
  if ((base & 0x2000) !== 0) return conditionMapDither[31];
  return conditionMapDither[Math.min(31, 11 + cell[4])];
}

function drawLiveGroundwaterMap() {
  if (
    !farmStateBytes ||
    !authoredWindbreakBytes ||
    typeof context.getImageData !== "function" ||
    typeof context.putImageData !== "function"
  )
    return;
  const pixels = readMapWindowPixels(152, 80, 192, 192);
  if (!pixels?.data) return;
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const sourcePattern = groundwaterMapPattern(authoredWindbreakBytes, x, y);
      const targetPattern = groundwaterMapPattern(farmStateBytes, x, y);
      if (sourcePattern === targetPattern) continue;
      for (let pixel = 0; pixel < 4; pixel += 1) {
        const pixelX = x * 2 + (pixel & 1);
        const pixelY = y * 2 + (pixel >> 1);
        const offset = (pixelY * 192 + pixelX) * 4;
        const sourceIndex = mapPatternPaletteIndex(sourcePattern, pixel);
        const targetIndex = mapPatternPaletteIndex(targetPattern, pixel);
        const sourceColor = farMapPaletteColor(sourceIndex);
        const xorSourceColor = farMapPaletteColor(sourceIndex ^ 15);
        const xorAnnotation = pixelMatchesColor(
          pixels.data,
          offset,
          xorSourceColor,
        );
        if (
          !xorAnnotation &&
          !pixelMatchesColor(pixels.data, offset, sourceColor)
        )
          continue;
        const color = farMapPaletteColor(
          xorAnnotation ? targetIndex ^ 15 : targetIndex,
        );
        pixels.data[offset] = color[0];
        pixels.data[offset + 1] = color[1];
        pixels.data[offset + 2] = color[2];
      }
    }
  }
  writeMapWindowPixels(pixels, 152, 80);
}

function cameraMoved() {
  return camera.x !== camera.initialX || camera.y !== camera.initialY;
}

function mapCell(x, y) {
  return mapCellFromBytes(farmStateBytes, x, y);
}

function parcelRecord(parcelX, parcelY) {
  if (
    !farmStateBytes ||
    !saveData ||
    parcelX < 0 ||
    parcelX >= saveData.format.parcelGridWidth ||
    parcelY < 0 ||
    parcelY >= saveData.format.parcelGridHeight
  )
    return null;
  const format = saveData.format;
  const index = parcelX * format.parcelGridHeight + parcelY;
  const offset = format.parcelRecordOffset + index * format.parcelRecordSize;
  return farmStateBytes.subarray(offset, offset + format.parcelRecordSize);
}

function parcelStatus(parcelX, parcelY) {
  const record = parcelRecord(parcelX, parcelY);
  return record ? record[saveData.format.parcelStatusOffset] : -1;
}

function authoredParcelStatus(parcelX, parcelY) {
  return (
    authoredParcelStatuses[
      parcelX * saveData.format.parcelGridHeight + parcelY
    ] ?? -1
  );
}

function propertyOwnershipMatchesAuthored() {
  if (!saveData || authoredParcelStatuses.length === 0) return false;
  for (let x = 0; x < saveData.format.parcelGridWidth; x += 1) {
    for (let y = 0; y < saveData.format.parcelGridHeight; y += 1) {
      if (parcelStatus(x, y) !== authoredParcelStatus(x, y)) return false;
    }
  }
  return true;
}

function readParcelStatuses(bytes) {
  const statuses = [];
  const format = saveData.format;
  for (let x = 0; x < format.parcelGridWidth; x += 1) {
    for (let y = 0; y < format.parcelGridHeight; y += 1) {
      const index = x * format.parcelGridHeight + y;
      statuses.push(
        bytes[
          format.parcelRecordOffset +
            index * format.parcelRecordSize +
            format.parcelStatusOffset
        ],
      );
    }
  }
  return statuses;
}

function readAuthoredParcelStatuses() {
  if (markerIndex === null) {
    authoredParcelStatuses =
      generatedWorldActive && farmStateBytes
        ? readParcelStatuses(farmStateBytes)
        : [];
    return;
  }
  const scenarioIndex = scenarioFileIndexes[markerIndex];
  const scenario = saveData.states.find(
    (candidate) => candidate.scenarioIndex === scenarioIndex,
  );
  authoredParcelStatuses = scenario
    ? readParcelStatuses(decodeState(scenario.stateBase64))
    : [];
}

function readAuthoredWindbreakBytes() {
  if (markerIndex === null) {
    authoredWindbreakBytes =
      generatedWorldActive && farmStateBytes ? farmStateBytes.slice() : null;
    return;
  }
  const scenarioIndex = scenarioFileIndexes[markerIndex];
  const scenario = saveData.states.find(
    (candidate) => candidate.scenarioIndex === scenarioIndex,
  );
  authoredWindbreakBytes = scenario ? decodeState(scenario.stateBase64) : null;
}

function parcelFieldCellCount(parcelX, parcelY) {
  let count = 0;
  for (let x = parcelX * 8; x < parcelX * 8 + 8; x += 1) {
    for (let y = parcelY * 8; y < parcelY * 8 + 8; y += 1) {
      if ((tileWords(mapCell(x, y)).base & 0x1000) !== 0) count += 1;
    }
  }
  return count;
}

function parcelLandValue(parcelX, parcelY) {
  const record = parcelRecord(parcelX, parcelY);
  if (!record) return 0;
  let ownedOrTownCount = 0;
  for (let x = 0; x < saveData.format.parcelGridWidth; x += 1) {
    for (let y = 0; y < saveData.format.parcelGridHeight; y += 1) {
      if (parcelStatus(x, y) !== 0) ownedOrTownCount += 1;
    }
  }
  return (
    baseLandValue +
    // 4753:1bc6 reads the live signed soil-moisture/terrain-band byte at
    // selector-relative 0x164. It starts at eight, but weather can move it
    // across a long-running game; land value and annual tax follow it.
    (state.soilMoisture ?? 8) * 16 +
    ownedOrTownCount * 100 +
    (record[6] >> 4) * 16 +
    parcelFieldCellCount(parcelX, parcelY) * 500
  );
}

function drawParcelValue() {
  const value = parcelLandValue(selectedParcel.x, selectedParcel.y);
  context.fillStyle = "#c3c3c3";
  context.fillRect(96, 238, 48, 38);
  drawText("Land", 104, 240);
  drawText("Value", 100, 252);
  drawText(
    String(value),
    96 + Math.floor((48 - String(value).length * 8) / 2),
    264,
  );
  const status = parcelStatus(selectedParcel.x, selectedParcel.y);
  if (status !== 0) {
    context.fillStyle = "#c3c3c3";
    if (status === 1) {
      context.fillRect(244, 287, 40, 16);
      drawText("SELL", 248, 291);
    } else {
      // Town property is inspectable but cannot be transacted; DOS erases
      // the complete BUY button, including its bevel, for owner state 2.
      context.fillRect(240, 283, 48, 24);
    }
  }
}

function drawLivePropertyMap() {
  if (
    !farmStateBytes ||
    typeof context.getImageData !== "function" ||
    typeof context.putImageData !== "function"
  )
    return;
  // The authored crop preserves the exact water-animation phase captured
  // by DOS. Keep it when Property is in its native initial state; controlled
  // and mutated saves still take the complete live renderer below.
  if (
    markerIndex !== null &&
    !propertySelectionActivated &&
    selectedParcel?.x === 0 &&
    selectedParcel?.y === 0 &&
    !cameraMoved() &&
    !overviewHasLiveTileChanges() &&
    !weatherPaletteDiffersFromCapturedScenario() &&
    propertyOwnershipMatchesAuthored()
  )
    return;
  const pixels = readMapWindowPixels(152, 80, 192, 192);
  if (!pixels?.data) return;
  const indexes = new Uint8Array(192 * 192);
  for (let pixelY = 0; pixelY < 192; pixelY += 1) {
    for (let pixelX = 0; pixelX < 192; pixelX += 1) {
      let paletteIndex;
      const owner = parcelStatus(pixelX >> 4, pixelY >> 4);
      if (owner === 1) paletteIndex = 4;
      else if (owner === 2) paletteIndex = 5;
      else {
        const pattern = farMapPatternForCell(
          farmStateBytes,
          pixelX >> 1,
          pixelY >> 1,
        );
        paletteIndex = pattern[((pixelY & 1) << 1) | (pixelX & 1)];
      }
      setOverviewPixel(pixels, indexes, pixelX, pixelY, paletteIndex);
    }
  }
  // Property draws its landmark glyphs first. On initial entry its grid is
  // below the viewport frame; after a parcel click the native callback
  // repaints that grid last, clipping landmarks and the frame on grid lines.
  drawOverviewLandmarks(pixels, indexes);
  const drawPropertyGrid = () => {
    for (let pixel = 0; pixel < 192; pixel += 16) {
      for (let other = 0; other < 192; other += 1) {
        setOverviewPixel(pixels, indexes, pixel, other, 1);
        setOverviewPixel(pixels, indexes, other, pixel, 1);
      }
    }
  };
  if (!propertySelectionActivated) drawPropertyGrid();
  if (selectedParcel) {
    const left = selectedParcel.x * 16 + 1;
    const top = selectedParcel.y * 16 + 1;
    for (let y = top; y < top + 15; y += 1) {
      for (let x = left; x < left + 15; x += 1)
        xorOverviewPixel(pixels, indexes, x, y);
    }
  }
  drawOverviewFrame(pixels, indexes);
  if (propertySelectionActivated) drawPropertyGrid();
  writeMapWindowPixels(pixels, 152, 80);
}

function fieldRecord(slot) {
  if (
    !farmStateBytes ||
    !saveData ||
    slot < 0 ||
    slot >= saveData.format.fieldRecordCount
  ) {
    return null;
  }
  const start =
    saveData.format.fieldRecordOffset + slot * saveData.format.fieldRecordSize;
  return farmStateBytes.subarray(
    start,
    start + saveData.format.fieldRecordSize,
  );
}

function objectRecord(slot) {
  if (
    !farmStateBytes ||
    !saveData ||
    slot < 0 ||
    slot >= saveData.format.objectRecordCount
  ) {
    return null;
  }
  const start =
    saveData.format.objectRecordOffset +
    slot * saveData.format.objectRecordSize;
  return farmStateBytes.subarray(
    start,
    start + saveData.format.objectRecordSize,
  );
}

function chemicalStorageRecord(slot) {
  if (
    !farmStateBytes ||
    !saveData ||
    slot < 0 ||
    slot >= saveData.format.chemicalStorageRecordCount
  ) {
    return null;
  }
  const start =
    saveData.format.chemicalStorageRecordOffset +
    slot * saveData.format.chemicalStorageRecordSize;
  return farmStateBytes.subarray(
    start,
    start + saveData.format.chemicalStorageRecordSize,
  );
}

function machineRecord(slot) {
  if (
    !farmStateBytes ||
    !saveData ||
    slot < 0 ||
    slot >= saveData.format.machineRecordCount
  ) {
    return null;
  }
  const start =
    saveData.format.machineRecordOffset +
    slot * saveData.format.machineRecordSize;
  return farmStateBytes.subarray(
    start,
    start + saveData.format.machineRecordSize,
  );
}

function structureRecord(slot) {
  if (
    !farmStateBytes ||
    !saveData ||
    slot < 0 ||
    slot >= saveData.format.structureRecordCount
  ) {
    return null;
  }
  const start =
    saveData.format.structureRecordOffset +
    slot * saveData.format.structureRecordSize;
  return farmStateBytes.subarray(
    start,
    start + saveData.format.structureRecordSize,
  );
}

function storageLotRecord(slot) {
  if (
    !farmStateBytes ||
    !saveData ||
    slot < 0 ||
    slot >= saveData.format.storageLotRecordCount
  ) {
    return null;
  }
  const start =
    saveData.format.storageLotRecordOffset +
    slot * saveData.format.storageLotRecordSize;
  return farmStateBytes.subarray(
    start,
    start + saveData.format.storageLotRecordSize,
  );
}

function toolItemDefinitionForId(id) {
  if (!farmStateBytes || !saveData) return null;
  for (
    let index = 0;
    index < saveData.format.toolItemDefinitionCount;
    index += 1
  ) {
    const definition = formatItemDefinition(
      "tool",
      "toolItemDefinitionOffset",
      "toolItemDefinitionCount",
      index,
    );
    if (definition?.id === id) return definition;
  }
  return null;
}

function adjustToolOwnCount(id, amount) {
  const definition = toolItemDefinitionForId(id);
  if (!definition) return;
  const view = stateView(definition.record);
  const current = view.getUint16(4, true);
  view.setUint16(4, Math.max(0, Math.min(0xffff, current + amount)), true);
}

function storageLotAtPosition(x, y, id = null) {
  for (let slot = 1; slot < saveData.format.storageLotRecordCount; slot += 1) {
    const record = storageLotRecord(slot);
    if ((record[10] & 0x20) === 0 || record[8] !== x || record[9] !== y)
      continue;
    if (id !== null && stateView(record).getUint16(0, true) !== id) continue;
    return { slot, record };
  }
  return null;
}

function allocateLivestockSupplyRecord(id, quantity, position) {
  const slot = firstFreeStorageLotSlot();
  if (slot < 0) return null;
  const record = storageLotRecord(slot);
  record.fill(0);
  const view = stateView(record);
  view.setUint16(0, id, true);
  view.setUint16(2, quantity, true);
  record[8] = position.x;
  record[9] = position.y;
  record[10] = 0x20;
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.storageLotCountOffset,
    saveView.getUint16(saveData.format.storageLotCountOffset, true) + 1,
    true,
  );
  adjustToolOwnCount(id, 1);
  return { slot, record };
}

function removeLivestockSupplyRecord(entry) {
  if (!entry || (entry.record[10] & 0x20) === 0) return false;
  const id = stateView(entry.record).getUint16(0, true);
  entry.record[10] &= ~0x20;
  const saveView = stateView(farmStateBytes);
  saveView.setUint16(
    saveData.format.storageLotCountOffset,
    Math.max(
      0,
      saveView.getUint16(saveData.format.storageLotCountOffset, true) - 1,
    ),
    true,
  );
  adjustToolOwnCount(id, -1);
  return true;
}

function structureAtPosition(position) {
  if (!position) return null;
  for (let slot = 1; slot < saveData.format.structureRecordCount; slot += 1) {
    const record = structureRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    const id = view.getUint16(0, true);
    if (id < 0x40 || id > 0x48) continue;
    const definition = itemDefinition(3, id - 0x40);
    if (!definition) continue;
    if (
      position.x >= record[4] &&
      position.x < record[4] + definition.width &&
      position.y >= record[5] &&
      position.y < record[5] + definition.height
    ) {
      return { slot, record, id, definition };
    }
  }
  return null;
}

function refreshOpenStructureStorageCell(structure, storageSlot) {
  if (!structure || !openableStorageStructureIds.has(structure.id))
    return false;
  const view = stateView(structure.record);
  if ((view.getUint16(2, true) & 1) === 0) return false;
  const relativeX = Math.floor(storageSlot / 3);
  const relativeY = storageSlot % 3;
  if (
    relativeX < 0 ||
    relativeX >= structure.definition.width ||
    relativeY < 0 ||
    relativeY >= structure.definition.height
  )
    return false;
  const cell = mapCell(
    structure.record[4] + relativeX,
    structure.record[5] + relativeY,
  );
  if (!cell) return false;
  const displayTile = view.getUint16(10 + storageSlot * 2, true);
  if (displayTile < 0x0350) {
    writeMapBaseWord(cell, displayTile);
  } else {
    const words = tileWords(cell);
    writeMapBaseWord(cell, 0x08d9);
    stateView(cell).setUint16(2, (words.overlay & 0xf800) | displayTile, true);
  }
  return true;
}

function setStructureRoofOpen(structure, open) {
  if (!structure || !openableStorageStructureIds.has(structure.id))
    return false;
  const view = stateView(structure.record);
  const flags = view.getUint16(2, true);
  if ((flags & 0x20) === 0 || Boolean(flags & 1) === open) return false;
  view.setUint16(2, open ? flags | 1 : flags & ~1, true);
  const roofStart = structureBaseTileStarts.get(structure.id);
  for (
    let relativeX = 0;
    relativeX < structure.definition.width;
    relativeX += 1
  ) {
    for (
      let relativeY = 0;
      relativeY < structure.definition.height;
      relativeY += 1
    ) {
      const storageSlot = relativeX * 3 + relativeY;
      if (open) {
        refreshOpenStructureStorageCell(structure, storageSlot);
      } else {
        const cell = mapCell(
          structure.record[4] + relativeX,
          structure.record[5] + relativeY,
        );
        if (cell)
          writeMapBaseWord(
            cell,
            roofStart + relativeY * structure.definition.width + relativeX,
          );
      }
    }
  }
  mapDirty = true;
  return true;
}

function toggleStructureRoofAtPosition(position) {
  const structure = structureAtPosition(position);
  if (!structure || !openableStorageStructureIds.has(structure.id))
    return false;
  return setStructureRoofOpen(
    structure,
    (stateView(structure.record).getUint16(2, true) & 1) === 0,
  );
}

function machineAtPosition(position) {
  if (!position || !saveData) return null;
  for (let slot = 1; slot < saveData.format.machineRecordCount; slot += 1) {
    const record = machineRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    const id = view.getUint16(0, true);
    const definition = itemDefinitionForKeyAndId("machine", id);
    if (!definition) continue;
    const width = record[53] || definition.width;
    const height = record[54] || definition.height;
    if (
      position.x >= record[5] &&
      position.x < record[5] + width &&
      position.y >= record[6] &&
      position.y < record[6] + height
    ) {
      return { slot, record, id, definition };
    }
  }
  return null;
}

function firstFreeStructureStorageSlot(structure) {
  const view = stateView(structure.record);
  for (
    let relativeX = 0;
    relativeX < structure.definition.width;
    relativeX += 1
  ) {
    for (
      let relativeY = 0;
      relativeY < structure.definition.height;
      relativeY += 1
    ) {
      const index = relativeX * 3 + relativeY;
      if (view.getUint16(34 + index * 2, true) === 0xffff) return index;
    }
  }
  return -1;
}

function fieldRecordView(record) {
  return new DataView(record.buffer, record.byteOffset, record.byteLength);
}

function activeFieldRecords() {
  const fields = [];
  for (let slot = 1; slot < saveData.format.fieldRecordCount; slot += 1) {
    const record = fieldRecord(slot);
    if (record && (record[7] & 1) !== 0) fields.push({ slot, record });
  }
  return fields;
}

function tileWords(cell) {
  if (!cell || cell.length < 5) return { base: 0, overlay: 0 };
  return {
    base: cell[0] | (cell[1] << 8),
    overlay: cell[2] | (cell[3] << 8),
  };
}

function cropSlotName(slot) {
  if (
    !farmStateBytes ||
    !saveData ||
    slot < 0 ||
    slot >= saveData.format.cropNameCount
  ) {
    return null;
  }
  const start =
    saveData.format.cropNameOffset + slot * saveData.format.cropNameSize;
  let name = "";
  for (let index = 0; index < saveData.format.cropNameSize; index += 1) {
    const value = farmStateBytes[start + index];
    if (value === 0) break;
    name += String.fromCharCode(value).toLowerCase();
  }
  return name.replace(/\.crp$/, "");
}

function cropSlotHasRelatedMaterials(slot) {
  for (const { record } of activeFieldRecords()) {
    if (record[14] === slot && record[2] !== 0) return true;
  }
  const storedCrop = formatItemDefinition(
    "stored-crop",
    "storedCropItemDefinitionOffset",
    "storedCropItemDefinitionCount",
    slot,
  );
  const seed = formatItemDefinition(
    "seed",
    "seedItemDefinitionOffset",
    "seedItemDefinitionCount",
    slot,
  );
  if ((storedCrop?.own || 0) !== 0 || (seed?.own || 0) !== 0) return true;
  for (
    let index = 1;
    index < saveData.format.storageLotRecordCount;
    index += 1
  ) {
    const record = storageLotRecord(index);
    if ((record[10] & 0x20) === 0) continue;
    const id = stateView(record).getUint16(0, true);
    if (id === 0x00a8 + slot || id === 0x00c0 + slot) return true;
  }
  return false;
}

function cropCatalogWord(entry, offset) {
  const stats = entry?.statsRaw;
  if (!Array.isArray(stats) || offset < 0 || offset + 1 >= stats.length)
    return 0;
  return stats[offset] | (stats[offset + 1] << 8);
}

function replaceLoadedCrop() {
  const entry = cropCatalogEntry();
  const key = cropCatalogKey(entry);
  if (!farmStateBytes || !saveData || !entry || !key) return false;
  const alreadyLoaded = Array.from(
    { length: saveData.format.cropNameCount },
    (_, slot) => cropSlotName(slot),
  ).includes(key);
  if (alreadyLoaded || cropSlotHasRelatedMaterials(loadCropSlot)) {
    modalNotice = "load-crop-in-use";
    return false;
  }

  const nameOffset =
    saveData.format.cropNameOffset +
    loadCropSlot * saveData.format.cropNameSize;
  farmStateBytes.fill(0, nameOffset, nameOffset + saveData.format.cropNameSize);
  const filename = entry.file.toUpperCase();
  for (
    let index = 0;
    index < Math.min(filename.length, saveData.format.cropNameSize - 1);
    index += 1
  ) {
    farmStateBytes[nameOffset + index] = filename.charCodeAt(index) & 0x7f;
  }

  const quote = cropCatalogWord(entry, 18);
  const seedPrice = cropCatalogWord(entry, 22) >>> 2;
  const commodity = marketItemDefinition(loadCropSlot);
  const seed = formatItemDefinition(
    "seed",
    "seedItemDefinitionOffset",
    "seedItemDefinitionCount",
    loadCropSlot,
  );
  if (commodity) stateView(commodity.record).setUint16(6, quote, true);
  if (seed) stateView(seed.record).setUint16(6, seedPrice, true);
  if (marketRuntime.history[loadCropSlot])
    marketRuntime.history[loadCropSlot].fill(quote);
  fieldCropNames[loadCropSlot] = cropCatalogDisplayName(entry);
  message = "";
  mapDirty = true;
  return true;
}

function cropSimulationDefinitionForSlot(slot) {
  return cropSimulationDefinitions.get(cropSlotName(slot)) || null;
}

function weatherPaletteSuffix() {
  if (stage !== "game") return "";
  if (state.currentWeatherCondition === 3) return "Rain";
  if (state.currentWeatherCondition === 4) return "Frost";
  // Imported native SFM files do not serialize the transient seven-day
  // condition buffer. Until the first reconstructed weather transition,
  // retain the exact palette of the authored scenario framebuffer.
  if (
    state.currentWeatherCondition === undefined ||
    state.currentWeatherCondition === null
  )
    return capturedScenarioWeatherSuffix();
  return "";
}

function capturedScenarioWeatherSuffix(index = markerIndex) {
  // The native capture run advances one day before taking each authored
  // scenario frame. Markers 3/5/7 cross into condition-3 rain; the other
  // five frames retain SIMFARM.PAL.
  return [3, 5, 7].includes(index) ? "Rain" : "";
}

function weatherPaletteDiffersFromCapturedScenario() {
  return (
    markerIndex !== null &&
    weatherPaletteSuffix() !== capturedScenarioWeatherSuffix()
  );
}

function shouldDrawDecodedViewport() {
  return (
    (generatedWorldActive && farmStateBytes) ||
    (markerIndex !== null &&
      (cameraMoved() ||
        mapDirty ||
        mapTileAnimationPhase !== 0 ||
        weatherPaletteDiffersFromCapturedScenario()))
  );
}

function weatherTileSheet() {
  return images[`tileSheet${weatherPaletteSuffix()}`] || images.tileSheet;
}

function weatherMaskedTileSheet() {
  return images[`maskedTiles${weatherPaletteSuffix()}`] || images.maskedTiles;
}

function weatherTownEventTileSheet() {
  return (
    images[`townEventTiles${weatherPaletteSuffix()}`] || images.townEventTiles
  );
}

function weatherAllTiles() {
  return images[`allTiles${weatherPaletteSuffix()}`] || images.allTiles;
}

function weatherAirplaneWindow() {
  return (
    images[`airplaneWindow${weatherPaletteSuffix()}`] || images.airplaneWindow
  );
}

function weatherCropImage(cropSlot) {
  const cropName = cropSlotName(cropSlot);
  const suffix = weatherPaletteSuffix().toLowerCase();
  return (
    images[`crop-${cropName}${suffix ? `-${suffix}` : ""}`] ||
    images[`crop-${cropName}`]
  );
}

function drawMapTile(tileIndex, x, y, width = 16, height = 16) {
  const eventMode = townEventMode();
  if (
    eventMode >= 1 &&
    eventMode <= 2 &&
    tileIndex >= townEventTileBase &&
    tileIndex < townEventTileBase + 35
  ) {
    const eventTile = tileIndex - townEventTileBase + eventMode * 35;
    context.drawImage(
      weatherTownEventTileSheet(),
      (eventTile % 20) * 16,
      Math.floor(eventTile / 20) * 16,
      16,
      16,
      x,
      y,
      width,
      height,
    );
    return;
  }
  let cropSlot = -1;
  let cropTile = -1;
  if (tileIndex >= 0x340 && tileIndex < 0x350) {
    // The runtime crop manager loads each CRP's catalog tile 41 into the
    // sixteen slots immediately below MSKDTILE. BUY addresses those slots
    // through ITEMTEXT's 0x340..0x34f range.
    cropSlot = tileIndex - 0x340;
    cropTile = 41;
  } else if (tileIndex >= 688 && tileIndex < 688 + 16 * 8) {
    cropSlot = Math.floor((tileIndex - 688) / 8);
    cropTile = (tileIndex - 688) % 8;
  } else if (tileIndex >= 539 && tileIndex < 539 + 16 * 4) {
    cropSlot = Math.floor((tileIndex - 539) / 4);
    cropTile = 36 + ((tileIndex - 539) % 4);
  }
  if (cropSlot >= 0) {
    const cropImage = weatherCropImage(cropSlot);
    if (cropImage) {
      context.drawImage(
        cropImage,
        (cropTile % 7) * 16,
        Math.floor(cropTile / 7) * 16,
        16,
        16,
        x,
        y,
        width,
        height,
      );
      return;
    }
  }
  const tileSheet = weatherTileSheet();
  const columns = Math.floor(images.tileSheet.width / 16);
  const rows = Math.floor(images.tileSheet.height / 16);
  const bounded = Math.max(0, Math.min(columns * rows - 1, tileIndex));
  context.drawImage(
    tileSheet,
    (bounded % columns) * 16,
    Math.floor(bounded / columns) * 16,
    16,
    16,
    x,
    y,
    width,
    height,
  );
}

function drawMaskedMapTile(tileIndex, x, y, width = 16, height = 16) {
  const maskedIndex = tileIndex - 0x350;
  const columns = Math.floor(images.maskedTiles.width / 16);
  const rows = Math.floor(images.maskedTiles.height / 16);
  if (maskedIndex < 0 || maskedIndex >= columns * rows) return;
  context.drawImage(
    weatherMaskedTileSheet(),
    (maskedIndex % columns) * 16,
    Math.floor(maskedIndex / columns) * 16,
    16,
    16,
    x,
    y,
    width,
    height,
  );
}

function drawFieldCropIcon(cropSlot, x, y) {
  const firstTile = 0x21b + cropSlot * 4;
  drawMapTile(firstTile, x, y);
  drawMapTile(firstTile + 1, x + 16, y);
  drawMapTile(firstTile + 2, x, y + 16);
  drawMapTile(firstTile + 3, x + 16, y + 16);
}

function drawLoadedCropIcon(cropSlot, x, y) {
  const cropImage = weatherCropImage(cropSlot);
  if (!cropImage) {
    drawFieldCropIcon(cropSlot, x, y);
    return;
  }
  // DOS loads these four CRP tiles over EGA slots 0x21b+slot*4 before
  // windows such as Evaluation request the ordinary 32x32 icon helper.
  context.drawImage(cropImage, 16, 80, 16, 16, x, y, 16, 16);
  context.drawImage(cropImage, 32, 80, 16, 16, x + 16, y, 16, 16);
  context.drawImage(cropImage, 48, 80, 16, 16, x, y + 16, 16, 16);
  context.drawImage(cropImage, 64, 80, 16, 16, x + 16, y + 16, 16, 16);
}

function drawCropCatalogIcon(cropSlot, x, y) {
  const cropImage = weatherCropImage(cropSlot);
  if (!cropImage) return;
  // Tile 41 is the exact 16x16 catalog swatch loaded by the DOS crop
  // manager for the Field Schedule's two-row crop chooser.
  context.drawImage(cropImage, 6 * 16, 5 * 16, 16, 16, x, y, 16, 16);
}

function fieldScheduleTile(fieldSlot, week) {
  if (!farmStateBytes || !saveData || fieldSlot < 1 || week < 0 || week >= 240)
    return 0xd1;
  const index = week * saveData.format.fieldRecordCount + fieldSlot - 1;
  const offset = saveData.format.sourceMapBlockOffset + index * 2;
  return stateView(farmStateBytes).getUint16(offset, true);
}

function setFieldScheduleTile(fieldSlot, week, tile) {
  if (!farmStateBytes || !saveData || fieldSlot < 1 || week < 0 || week >= 240)
    return;
  const index = week * saveData.format.fieldRecordCount + fieldSlot - 1;
  const offset = saveData.format.sourceMapBlockOffset + index * 2;
  stateView(farmStateBytes).setUint16(offset, tile, true);
}

function fieldEnvironmentalOffset(record) {
  const parcelX = (record[10] + (record[12] >> 1)) >> 3;
  const parcelY = (record[11] + (record[13] >> 1)) >> 3;
  return (
    saveData.format.environmentalGridOffset +
    (parcelX * 12 + parcelY) * saveData.format.environmentalGridCellSize
  );
}

function subtractFieldCondition(
  record,
  recordOffset,
  environmentalByte,
  amount,
) {
  const current = record[recordOffset];
  record[recordOffset] = amount < current ? current - amount : 0;
  if (environmentalByte === null) return;
  const offset = fieldEnvironmentalOffset(record) + environmentalByte;
  const environmentalValue = farmStateBytes[offset];
  // Preserve the original 1957:0e10/0ea6/0fd2 comparison exactly. Its
  // environmental-grid branch is intentionally inverted: values above the
  // amount become zero, while values at or below it use byte subtraction.
  farmStateBytes[offset] =
    environmentalValue <= amount ? (environmentalValue - amount) & 0xff : 0;
}

function addFieldCondition(record, recordOffset, environmentalByte, amount) {
  record[recordOffset] = Math.min(0xff, record[recordOffset] + amount);
  if (environmentalByte === null) return;
  const offset = fieldEnvironmentalOffset(record) + environmentalByte;
  farmStateBytes[offset] = Math.min(0xff, farmStateBytes[offset] + amount);
}

function restoreIdleFieldNutrients(record, amount) {
  // FUN_15b3_1b16 action 1 fans out to the three original nutrient fields.
  addFieldCondition(record, 29, 6, amount);
  // The second nutrient plane is runtime-only in the DOS layout; it has no
  // serialized byte in the seven-byte parcel/environment record.
  addFieldCondition(record, 30, null, amount);
  addFieldCondition(record, 31, null, amount);
}

function refreshFieldConditionCache(record) {
  // FUN_1957_0d9a copies the first nutrient byte to the cached field-status
  // byte.  FUN_15b3_12d2 also rebuilds the low-nutrient diagnostic bit.
  record[28] = record[29];
  const view = fieldRecordView(record);
  const flags = view.getUint16(54, true);
  view.setUint16(54, (flags & ~0x80) | (record[29] < 0x80 ? 0x80 : 0), true);
}

function advanceFieldSoilDay() {
  // 09ab:14fe runs on odd hidden day numbers. Action 1 restores one unit
  // to all three nutrients; action 2 removes two toxicity units. Both also
  // mutate their serialized parcel planes with the original comparison
  // behavior implemented by the helpers above.
  advanceFrostEvent();
  for (const { record } of activeFieldRecords()) {
    restoreIdleFieldNutrients(record, 1);
    subtractFieldCondition(record, 32, 5, 2);
    refreshFieldConditionCache(record);
  }
}

function addCropPressure(
  record,
  recordOffset,
  environmentalByte,
  amount,
  resistance,
) {
  // The three CRP resistance bytes do not act as percentages. Any nonzero
  // value selects the DOS routine's quarter-strength path.
  const applied = resistance === 0 ? amount : amount >> 2;
  addFieldCondition(record, recordOffset, environmentalByte, applied);
}

function fieldGrowthWaterEffect(record, definition) {
  const signedByte = (value) => (value & 0x80 ? value - 0x100 : value);
  const water = fieldRecordView(record).getUint16(24, true);
  let lower = signedByte(definition.waterMin) - signedByte(record[51]) * 2;
  if (lower < 0) lower = 0;
  const upper = signedByte(definition.waterMax) + signedByte(record[52]) * 2;
  const midpoint = ((upper - lower) >> 1) + lower;
  if (
    (water >= lower && water < midpoint) ||
    (water >= midpoint && water < upper)
  )
    return 0;
  const penalty = cropSlotName(record[14]) === "sorghum" ? 0 : 1;
  return ((nextSimSecondaryRandom() & 0x1f) * penalty - 0x80) & 0xff;
}

function weatherRecordByte(cycle, month, week, byteOffset, signed = false) {
  if (!farmStateBytes || !saveData?.format?.weatherRecordOffset) return null;
  const format = saveData.format;
  const rawIndex =
    (cycle * format.weatherMonthsPerCycle + month) *
      format.weatherWeeksPerMonth +
    week;
  const index =
    ((rawIndex % format.weatherRecordCount) + format.weatherRecordCount) %
    format.weatherRecordCount;
  return weatherRecordByteByIndex(index, byteOffset, signed);
}

function weatherRecordByteByIndex(index, byteOffset, signed = false) {
  if (!farmStateBytes || !saveData?.format?.weatherRecordOffset) return null;
  const format = saveData.format;
  const offset =
    format.weatherRecordOffset + index * format.weatherRecordSize + byteOffset;
  const value = farmStateBytes[offset];
  return signed && (value & 0x80) !== 0 ? value - 0x100 : value;
}

function currentWeatherTemperature() {
  // DAT_6190_4278 is a five-year table of signed weekly temperatures.
  // 09ab:0bde samples the newly entered week immediately before crop growth.
  return (
    weatherRecordByte(
      state.weatherTemperatureCycle ?? 0,
      state.month,
      state.week,
      saveData?.format?.weatherTemperatureOffset ?? 2,
      true,
    ) ?? 74
  );
}

function refreshFieldSoilMoisture() {
  const water = (state.soilMoisture ?? 8) * 2;
  for (const { record } of activeFieldRecords()) {
    fieldRecordView(record).setUint16(24, water, true);
  }
}

function refreshTerrainSoilMoisture() {
  if (!farmStateBytes) return;
  // FUN_148c_0114/FUN_148c_01b8 rebuild only the 16-tile base-soil
  // family.  The per-cell source class is display-cell byte 4 divided by
  // four; high ownership/field flags survive unchanged.
  const terrainStart = 0x000f;
  const terrainEnd = terrainStart + 0x10;
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const cell = mapCell(x, y);
      const view = stateView(cell);
      const word = view.getUint16(0, true);
      const tile = word & 0x07ff;
      if (tile < terrainStart || tile >= terrainEnd) continue;
      view.setUint16(
        0,
        (word & 0xf800) | (terrainStart + (cell[4] >> 2) + state.soilMoisture),
        true,
      );
    }
  }
  mapDirty = true;
}

function weatherVariation(temperature) {
  const randomClass = nextSimRandom() & 7;
  if (temperature < 71) {
    if (randomClass === 0 || randomClass === 4) return 0;
    if (randomClass === 1 || randomClass === 3) return 2;
    return 1;
  }
  if (temperature < 86) {
    if (randomClass === 1 || randomClass === 7) return 1;
    if (randomClass === 2 || randomClass === 4) return 2;
    return 0;
  }
  if (randomClass === 2) return 1;
  if (randomClass === 5) return 2;
  return 0;
}

function weatherForecastTemplate(temperature, precipitation) {
  const index = Math.max(0, Math.min(7, precipitation));
  const warmTemplates = [
    [0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0],
    [0, 0, 3, 0, 0, 3, 0],
    [3, 0, 0, 3, 3, 0, 0],
    [3, 3, 0, 0, 0, 3, 3],
    [0, 3, 3, 3, 3, 3, 0],
    [3, 3, 3, 3, 3, 3, 0],
    [3, 3, 3, 3, 3, 3, 3],
  ];
  const coldTemplates = [
    [1, 1, 1, 1, 1, 1, 1],
    [4, 1, 1, 1, 1, 1, 1],
    [1, 1, 4, 1, 1, 4, 1],
    [4, 1, 1, 4, 4, 1, 1],
    [4, 4, 1, 1, 1, 4, 4],
    [1, 4, 4, 4, 4, 4, 1],
    [4, 4, 4, 4, 4, 4, 1],
    [4, 4, 4, 4, 4, 4, 4],
  ];
  return (temperature < 33 ? coldTemplates : warmTemplates)[index];
}

function generateNextWeatherWeek() {
  const format = saveData?.format;
  if (!farmStateBytes || !format?.weatherRecordOffset) {
    state.nextWeatherDays = [0, 0, 0, 0, 0, 0, 0];
    return;
  }
  const currentIndex =
    ((state.weatherPrecipitationCycle ?? 0) * format.weatherMonthsPerCycle +
      state.month) *
      format.weatherWeeksPerMonth +
    state.week;
  const nextIndex = (currentIndex + 1) % format.weatherRecordCount;
  let precipitation =
    weatherRecordByteByIndex(nextIndex, format.weatherPrecipitationOffset) ?? 0;
  if (precipitation < 0) precipitation = 0;
  precipitation = Math.min(7, precipitation);
  const temperature =
    weatherRecordByteByIndex(
      nextIndex,
      format.weatherTemperatureOffset,
      true,
    ) ?? 74;
  const cold = temperature < 33;
  const anchor = cold ? 4 : 3;
  state.nextWeatherDays = weatherForecastTemplate(
    temperature,
    precipitation,
  ).map((condition) =>
    condition === anchor ? condition : weatherVariation(temperature),
  );
}

function applyWeeklyWeatherTransition(withSound = false) {
  const accumulator = state.weatherMoistureAccumulator ?? 0;
  if (accumulator >= 8 || accumulator <= -8) {
    const delta = accumulator >> 3;
    if (accumulator >= 8) {
      state.soilMoisture = Math.min(12, state.soilMoisture + delta);
    } else {
      state.soilMoisture = Math.max(0, state.soilMoisture + delta);
    }
    state.weatherMoistureAccumulator = 0;
    refreshTerrainSoilMoisture();
  }
  state.weatherDays = [...state.nextWeatherDays];
  if (withSound) playWeeklyWeatherSound();
  generateNextWeatherWeek();
}

function playWeeklyWeatherSound() {
  const format = saveData?.format;
  if (!farmStateBytes || !format?.weatherRecordOffset) return false;
  const currentIndex =
    ((state.weatherPrecipitationCycle ?? 0) * format.weatherMonthsPerCycle +
      state.month) *
      format.weatherWeeksPerMonth +
    state.week;
  const nextIndex = (currentIndex + 1) % format.weatherRecordCount;
  const precipitation =
    weatherRecordByteByIndex(nextIndex, format.weatherPrecipitationOffset) ?? 0;
  if (precipitation <= 3) return false;
  play("thunder");
  setQuickMessage(0x47);
  return true;
}

function addAnnualRainfallEvent() {
  const offset = saveData?.format?.annualRainfallEventCountOffset;
  if (!farmStateBytes || offset === undefined) return;
  const view = stateView(farmStateBytes);
  view.setUint16(offset, (view.getUint16(offset, true) + 1) & 0xffff, true);
}

function resetAnnualRainfallEvents() {
  const offset = saveData?.format?.annualRainfallEventCountOffset;
  if (!farmStateBytes || offset === undefined) return;
  stateView(farmStateBytes).setUint16(offset, 0, true);
}

function applyDailyWeather() {
  const condition = state.weatherDays?.[state.day] ?? 0;
  state.currentWeatherCondition = condition;
  let moisture = 0;
  if (condition === 0) moisture = state.currentWindSpeed > 14 ? -6 : -2;
  else if (condition === 1) moisture = state.currentWindSpeed > 14 ? -3 : -1;
  else if (condition === 2) moisture = state.currentWindSpeed > 14 ? -2 : -1;
  else if (condition === 3 || condition === 4) {
    moisture = 8;
    addAnnualRainfallEvent();
  }
  let accumulator =
    ((state.weatherMoistureAccumulator ?? 0) + moisture) & 0xffff;
  if ((accumulator & 0x8000) !== 0) accumulator -= 0x10000;
  state.weatherMoistureAccumulator = accumulator;
  state.currentTemperature =
    currentWeatherTemperature() + nextSimSmallRandom(5);
}

function advanceCropGrowthField(
  record,
  currentTemperature = currentWeatherTemperature(),
) {
  const cropName = cropSlotName(record[14]);
  const definition = cropSimulationDefinitions.get(cropName);
  if (!definition || record[2] !== 4) return false;
  const view = fieldRecordView(record);
  const oldStage = record[34];
  record[34] = (oldStage + 1) & 0xff;

  const plantingValue = cropPlantingValues.get(cropName) ?? 0;
  if (plantingValue !== 0) {
    // 15b3:070c accumulates heat shortfall in field word 38. CRP byte 51
    // is 50 for the original crop set; seven degree-days are consumed at
    // each growth gate before any remainder is added to the shortfall.
    let heat = Math.max(0, currentTemperature - 50) * 7;
    let shortfall = view.getUint16(38, true);
    if (shortfall !== 0) {
      if (shortfall < heat) {
        heat -= shortfall;
        shortfall = 0;
      } else {
        shortfall -= heat;
        heat = 0;
      }
    }
    if (heat < plantingValue)
      shortfall = (shortfall + plantingValue - heat) & 0xffff;
    view.setUint16(38, shortfall, true);
  }

  const [nitrogenCost, phosphorusCost, potassiumCost] =
    cropGrowthNutrientCosts.get(cropName) || [0, 0, 0];
  subtractFieldCondition(record, 29, 6, nitrogenCost);
  subtractFieldCondition(record, 30, null, phosphorusCost);
  subtractFieldCondition(record, 31, null, potassiumCost);
  addCropPressure(record, 20, 2, record[60], definition.pestResistance);
  addCropPressure(record, 21, 4, record[61], definition.weedResistance);
  addCropPressure(record, 22, 3, record[62], definition.diseaseResistance);

  const stageCount = definition.stageCount;
  if (stageCount !== 0) {
    const average = Math.floor(
      (record[22] -
        record[28] +
        record[20] +
        record[21] +
        record[32] +
        0xff +
        fieldGrowthWaterEffect(record, definition)) /
        6,
    );
    const scale = Math.floor(0xffff / stageCount) * 2;
    const addition = Math.floor((average * scale) / 0x100) & 0xffff;
    const accumulated = view.getUint16(18, true);
    view.setUint16(18, Math.min(0xffff, accumulated + addition), true);
  }

  if (oldStage < stageCount) {
    const groupDivisor = Math.floor(
      (stageCount + definition.stageDivisor - 1) / definition.stageDivisor,
    );
    const progress =
      plantingValue === 0
        ? 0
        : Math.floor(view.getUint16(38, true) / (plantingValue + 2));
    const tileOffset = Math.trunc(
      (record[34] - progress + (groupDivisor >> 1)) / groupDivisor,
    );
    const cropTile = 0x02b0 + record[14] * 8 + tileOffset;
    view.setUint16(16, cropTile, true);
    for (let x = record[10]; x < record[10] + record[12]; x += 1) {
      for (let y = record[11]; y < record[11] + record[13]; y += 1) {
        const cell = mapCell(x, y);
        const words = tileWords(cell);
        const tile = words.base & 0x07ff;
        if (tile < 0x02b0 || tile >= 0x0330) continue;
        const base = (words.base & 0xf800) | cropTile;
        cell[0] = base & 0xff;
        cell[1] = base >> 8;
      }
    }
    mapDirty = true;
    return true;
  }
  if (definition.fixedHarvestWeek === 0) resetFieldOperation(record);
  return definition.fixedHarvestWeek !== 0;
}

function advanceCropGrowthPhase(
  phase = state.week,
  currentTemperature = currentWeatherTemperature(),
) {
  let changed = false;
  for (const { record } of activeFieldRecords()) {
    if (record[2] !== 4 || record[33] !== phase) continue;
    refreshFieldConditionCache(record);
    record[33] = (record[33] + 1) & 3;
    changed = advanceCropGrowthField(record, currentTemperature) || changed;
  }
  return changed;
}

function clearFieldDiagnosticMarkers(record) {
  // FUN_15b3_12d2 first removes the three transient 2x2 problem badges at
  // field x+2, x+4, and x+6. FUN_25b3_1d88 restores each badge's low tile
  // bits from the two map rows immediately below it while retaining the
  // destination cell's high flags. The permanent crop badge at x+0 stays.
  for (const offsetX of [2, 4, 6]) {
    for (let localX = 0; localX < 2; localX += 1) {
      for (let localY = 0; localY < 2; localY += 1) {
        const target = mapCell(
          record[10] + offsetX + localX,
          record[11] + localY,
        );
        const source = mapCell(
          record[10] + offsetX + localX,
          record[11] + localY + 2,
        );
        if (!target || !source) continue;
        writeMapBaseWord(
          target,
          (tileWords(target).base & 0xf800) | (tileWords(source).base & 0x07ff),
        );
      }
    }
  }
  mapDirty = true;
}

function resetFieldOperation(record, now = Date.now()) {
  if (record[2] === 0) {
    restoreIdleFieldNutrients(record, 10);
    return;
  }
  // FUN_2957_0b38 requests ordinary EVENTS.DAT record 2 before applying
  // the terminal schedule reset. Its “field completely died off” card is
  // optional, but the state mutation below is unconditional.
  requestGenericEvent(2, now);
  if (record[2] === 4) restoreIdleFieldNutrients(record, 0x46);
  const view = fieldRecordView(record);
  record[2] = 0;
  record[3] = 0;
  view.setUint16(18, 0, true);
  // The following FUN_15b3_12d2 call clears its diagnostic word, then exits
  // at the now-idle state test. It does not refresh cached nutrient byte 28.
  view.setUint16(54, 0, true);
  clearFieldDiagnosticMarkers(record);
  for (let x = record[10]; x < record[10] + record[12]; x += 1) {
    for (let y = record[11]; y < record[11] + record[13]; y += 1) {
      const cell = mapCell(x, y);
      const words = tileWords(cell);
      const tile = words.base & 0x07ff;
      if (tile >= 0x02b0 && tile < 0x0330) {
        const base = (words.base & 0xf800) | 0x22;
        cell[0] = base & 0xff;
        cell[1] = base >> 8;
      }
    }
  }
  mapDirty = true;
}

function writeFieldCropMarker(record, cropSlot) {
  const firstTile = 0x021b + cropSlot * 4;
  for (let markerX = 0; markerX < 2; markerX += 1) {
    for (let markerY = 0; markerY < 2; markerY += 1) {
      const cell = mapCell(record[10] + markerX, record[11] + markerY);
      const words = tileWords(cell);
      const tile = firstTile + markerY * 2 + markerX;
      const base = (words.base & 0xf800) | tile;
      cell[0] = base & 0xff;
      cell[1] = base >> 8;
    }
  }
}

function cropDispatchPenalty(resistance) {
  let random = nextSimSecondaryRandom() & 0xff;
  if (random === 0) random = 1;
  return resistance < random ? Math.min(0x40, random - resistance) : 0;
}

function dispatchScheduledFieldOperations(scheduleWeek) {
  if (!farmStateBytes || !saveData || scheduleWeek < 0 || scheduleWeek >= 240)
    return false;
  for (const { slot, record } of activeFieldRecords()) {
    const tile = fieldScheduleTile(slot, scheduleWeek);
    const view = fieldRecordView(record);
    if (tile === 0x00c6) {
      if (record[2] === 4 && view.getUint16(48, true) === 0) {
        const commodity = itemDefinitionForKeyAndId(
          "commodity",
          0x80 + record[14],
        );
        if (commodity) {
          const commodityView = stateView(commodity.record);
          view.setUint16(48, commodity.price, true);
          commodityView.setUint16(4, (commodity.own + 1) & 0xffff, true);
        }
      }
    } else if (tile === 0x00d1) {
      resetFieldOperation(record);
    } else if (tile === 0x00ef) {
      record[2] = 5;
      record[3] = 0;
      record[7] &= 0xfd;
    } else if (tile === 0x01b8) {
      if (record[2] === 4) {
        record[2] = 5;
        record[3] = 0;
        record[7] |= 2;
        const definition = cropSimulationDefinitionForSlot(record[14]);
        if (definition?.harvestSubstateTen) record[3] = 10;
      }
    } else if (tile >= 0x0340 && tile <= 0x034f) {
      const cropSlot = tile - 0x0340;
      view.setUint16(38, 0, true);
      view.setUint16(40, 0, true);
      view.setUint16(18, 0, true);
      record[33] = 0;
      record[34] = 0;
      const contract = view.getUint16(48, true);
      if (contract !== 0) {
        const oldCommodity = itemDefinitionForKeyAndId(
          "commodity",
          0x80 + record[14],
        );
        if (oldCommodity) {
          const commodityView = stateView(oldCommodity.record);
          commodityView.setUint16(4, (oldCommodity.own - 1) & 0xffff, true);
        }
        view.setUint16(48, 0, true);
      }
      if (!consumeStoredSeed(cropSlot)) {
        resetFieldOperation(record);
        return false;
      }
      record[2] = 3;
      record[3] = 0;
      applyCropProductionMarketEffect(cropSlot);
      const sameCrop = record[14] === cropSlot;
      subtractFieldCondition(
        record,
        20,
        2,
        sameCrop ? record[20] >> 2 : record[20],
      );
      subtractFieldCondition(
        record,
        22,
        3,
        sameCrop ? record[22] >> 2 : record[22],
      );
      subtractFieldCondition(
        record,
        21,
        4,
        sameCrop ? record[21] >> 2 : record[21],
      );
      record[14] = cropSlot;
      writeFieldCropMarker(record, cropSlot);
      const definition = cropSimulationDefinitionForSlot(cropSlot);
      if (definition) {
        record[61] = cropDispatchPenalty(definition.weedResistance);
        record[60] = cropDispatchPenalty(definition.pestResistance);
        record[62] = cropDispatchPenalty(definition.diseaseResistance);
      }
      mapDirty = true;
    } else if (tile === 0x0354) {
      record[2] = 2;
    } else if (tile >= 0x0390 && tile <= 0x0393) {
      record[4] = record[2];
      record[5] = record[3];
      record[2] = 9 - (tile - 0x0390);
      record[3] = 0;
    }
  }
  return true;
}

function findAvailableMachine(machineId, targetX, targetY) {
  let selectedSlot = 0;
  let selectedDistance = 0x4240;
  let activeSeen = 0;
  const liveCount = stateView(farmStateBytes).getUint16(
    saveData.format.machineCountOffset,
    true,
  );
  // FUN_0d5f_1de6 does not scan the whole backing array. It advances the
  // slot index until it has encountered the serialized live count of active
  // records, including active records that fail the availability filters.
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
    if (
      (record[17] & 0xc0) === 0xc0 ||
      (flags & 0x40) !== 0 ||
      view.getUint16(0, true) !== machineId ||
      (flags & 9) !== 0 ||
      view.getUint16(46, true) !== 0
    )
      continue;
    const dx = targetX - record[5];
    const dy = targetY - record[6];
    const distance = dx * dx + dy * dy;
    if (distance >= selectedDistance) continue;
    selectedSlot = slot;
    selectedDistance = distance;
  }
  if (selectedSlot === 0) {
    if (!state.options.AutoLease) {
      setQuickMessage(0x48);
      return 0;
    }
    return allocateLeasedMachine(machineId);
  }
  const record = machineRecord(selectedSlot);
  const view = stateView(record);
  let flags = view.getUint16(2, true) | 1;
  if ((flags & 4) !== 0) {
    storedMachineDirections.set(selectedSlot, record[15]);
    clearStoredMachineFootprint(record[5], record[6], selectedSlot);
    flags &= ~4;
  }
  view.setUint16(2, flags, true);
  mapDirty = true;
  return selectedSlot;
}

function allocateLeasedMachine(machineId) {
  if (!state.options.AutoLease || !farmStateBytes) return 0;
  const definition = itemDefinitionForKeyAndId("machine", machineId);
  if (!definition) return 0;
  // FUN_0d5f_1de6 creates the temporary record before attempting the
  // charge.  Keeping that order also reproduces the inactive initialized
  // record left behind when the original cannot fund a lease.
  const saveView = stateView(farmStateBytes);
  const spawnX =
    saveView.getUint16(saveData.format.autoLeaseReducedXOffset, true) * 8 + 1;
  const spawnY =
    saveView.getUint16(saveData.format.autoLeaseReducedYOffset, true) * 8 + 5;
  const allocated = allocateMachineSlotRecord(definition, 0, 0);
  if (!allocated) {
    setQuickMessage(0x48);
    return 0;
  }
  saveView.setUint16(
    saveData.format.machineCountOffset,
    saveView.getUint16(saveData.format.machineCountOffset, true) + 1,
    true,
  );
  const leasePrice = definition.price >> 1;
  if (state.funds < leasePrice) {
    const allocatedView = stateView(allocated.record);
    allocatedView.setUint16(2, allocatedView.getUint16(2, true) & ~0x20, true);
    saveView.setUint16(
      saveData.format.machineCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.machineCountOffset, true) - 1,
      ),
      true,
    );
    // The shared charge helper first emits record 42, then the caller
    // removes the failed lease and replaces it with machinery record 0.
    setQuickMessage(0);
    return 0;
  }
  const leaseExpenseOffset =
    saveData.format.machineLeaseExpenseOffset ?? 0x216c4;
  saveView.setUint32(
    leaseExpenseOffset,
    saveView.getUint32(leaseExpenseOffset, true) + leasePrice,
    true,
  );
  state.funds -= leasePrice;
  const record = allocated.record;
  const view = stateView(record);
  record[5] = spawnX;
  record[6] = spawnY;
  record[50] = spawnX;
  record[51] = spawnY;
  view.setUint16(2, view.getUint16(2, true) | 0x41, true);
  mapDirty = true;
  return allocated.slot;
}
