// Market prices, item definitions, purchasing, examining, and inventory sales.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function itemDefinition(categoryIndex, itemIndex) {
  if (!farmStateBytes || !saveData) return null;
  const category = buyCategories[categoryIndex];
  if (!category) return null;
  const declaredCount = saveData.format[category.count];
  const count = Math.min(category.visibleCount ?? declaredCount, declaredCount);
  if (itemIndex < 0 || itemIndex >= count) return null;
  const offset =
    saveData.format[category.offset] +
    itemIndex * saveData.format.itemDefinitionRecordSize;
  const record = farmStateBytes.subarray(
    offset,
    offset + saveData.format.itemDefinitionRecordSize,
  );
  const view = stateView(record);
  return {
    category: category.key,
    categoryIndex,
    itemIndex,
    offset,
    record,
    textIndex: view.getUint16(0, true),
    id: view.getUint16(2, true),
    own: view.getUint16(4, true),
    price: view.getUint16(6, true),
    width: record[8],
    height: record[9],
    storage: record[10],
    artIndex: record[11],
    flags: record[12],
  };
}

function formatItemDefinition(categoryKey, offsetKey, countKey, itemIndex) {
  if (!farmStateBytes || !saveData) return null;
  const count = saveData.format[countKey];
  if (itemIndex < 0 || itemIndex >= count) return null;
  const offset =
    saveData.format[offsetKey] +
    itemIndex * saveData.format.itemDefinitionRecordSize;
  const record = farmStateBytes.subarray(
    offset,
    offset + saveData.format.itemDefinitionRecordSize,
  );
  const view = stateView(record);
  return {
    category: categoryKey,
    categoryIndex: -1,
    itemIndex,
    offset,
    record,
    textIndex: view.getUint16(0, true),
    id: view.getUint16(2, true),
    own: view.getUint16(4, true),
    price: view.getUint16(6, true),
    width: record[8],
    height: record[9],
    storage: record[10],
    artIndex: record[11],
    flags: record[12],
  };
}

function marketItemDefinition(slot) {
  return formatItemDefinition(
    "commodity",
    "commodityItemDefinitionOffset",
    "commodityItemDefinitionCount",
    slot,
  );
}

function marketCropData(slot = marketRuntime.selectedCrop) {
  const key = cropSlotName(slot);
  const item = marketItemDefinition(slot);
  return {
    slot,
    key,
    item,
    name: cropMarketDisplayNames.get(key) || key || "",
    basePrice: cropMarketBasePrices.get(key) ?? item?.price ?? 1,
    quantity: cropHarvestQuantities.get(key) ?? 0,
  };
}

function normalizeScenarioMarketPrices() {
  if (!farmStateBytes || !saveData) return;
  for (let slot = 0; slot < 16; slot += 1) {
    const item = marketItemDefinition(slot);
    const basePrice = cropMarketBasePrices.get(cropSlotName(slot));
    if (!item || basePrice === undefined) continue;
    stateView(item.record).setUint16(6, basePrice, true);
  }
}

function initializeMarketRuntime() {
  if (!farmStateBytes || !saveData) return marketRuntime;
  // 07bc replaces the thirty graph samples, but its direction comes from
  // the retained DS:bc66 trend. New Game does not reset bc66/bc67/bc72.
  marketRuntime.initialized = true;
  for (let slot = 0; slot < 16; slot += 1) {
    const item = marketItemDefinition(slot);
    let price = item?.price ?? 0;
    const quarter = price >>> 2;
    const history = marketRuntime.history[slot];
    for (let sample = 0; sample < 30; sample += 1) {
      history[sample] = price;
      const randomClass = nextSimSecondaryRandom() & 7;
      let direction = 0;
      if (marketRuntime.trend === 0) direction = randomClass <= 3 ? -1 : 1;
      else if (marketRuntime.trend === 1) direction = randomClass <= 1 ? -1 : 1;
      else if (marketRuntime.trend === 2 && randomClass > 5) direction = 1;
      if (direction !== 0 && (nextSimSecondaryRandom() & 1) !== 0) {
        const factor =
          (nextSimSecondaryRandom() & 1) + (direction > 0 ? 1 : -1);
        price = (price + factor * quarter) & 0xffff;
      }
    }
  }
  return marketRuntime;
}

function initializeLoadedScenarioMarketRuntime() {
  if (!farmStateBytes || !saveData) return marketRuntime;
  marketRuntime.initialized = true;
  // The authored/load path skips CODE59:07bc and keeps samples0..28 plus
  // the selected crop, trend and age. Only first process startup sees zeros.
  // SFM reader283c invokes crop loader3920, which writes each CRP baseline
  // to sample29 even if a different current quote was serialized in SFM.
  for (let slot = 0; slot < 16; slot += 1) {
    marketRuntime.history[slot][29] = marketCropData(slot).basePrice;
  }
  return marketRuntime;
}

function finishNativeSfmFileLoad() {
  // Raw import/export deliberately preserves SFM bytes. The actual native
  // File Load callback additionally reloads each named CRP (283c ->3920),
  // overwriting Commodity and Seed prices, but not Stored Crop prices.
  // This occurs after the serialized item-definition tables were read.
  if (farmStateBytes && saveData) {
    const view = stateView(farmStateBytes);
    const format = saveData.format;
    for (let slot = 0; slot < format.cropNameCount; slot += 1) {
      const crop = expertCropRecord(slot);
      if (!crop) continue;
      const record = slot * format.itemDefinitionRecordSize;
      view.setUint16(
        format.commodityItemDefinitionOffset + record + 6,
        cropCatalogWord(crop, 18),
        true,
      );
      view.setUint16(
        format.seedItemDefinitionOffset + record + 6,
        Math.max(5, cropCatalogWord(crop, 22) >>> 2),
        true,
      );
    }
  }
  endNativeFileDialogPause(true);
}

function writeMarketQuote(slot, price) {
  const format = saveData?.format;
  if (!farmStateBytes || !format) return;
  const writeDefinitionPrice = (offsetKey, countKey, value) => {
    if (slot >= format[countKey]) return;
    const offset =
      format[offsetKey] + slot * format.itemDefinitionRecordSize + 6;
    stateView(farmStateBytes).setUint16(offset, value & 0xffff, true);
  };
  writeDefinitionPrice(
    "commodityItemDefinitionOffset",
    "commodityItemDefinitionCount",
    price,
  );
  writeDefinitionPrice(
    "storedCropItemDefinitionOffset",
    "storedCropItemDefinitionCount",
    price,
  );
  writeDefinitionPrice(
    "seedItemDefinitionOffset",
    "seedItemDefinitionCount",
    Math.max(5, (price & 0xffff) >> 2),
  );
}

function applyCropProductionMarketEffect(slot) {
  if (!farmStateBytes || !saveData || slot < 0 || slot >= 16) return false;
  if (!marketRuntime.initialized) initializeMarketRuntime();
  const history = marketRuntime.history[slot];
  const price = history[29] & 0xffff;
  const signedPrice = price & 0x8000 ? price - 0x10000 : price;
  // CODE59:0a26 uses SAR before subtraction, so retain the signed 16-bit
  // behavior even though ordinary crop quotes remain positive.
  history[29] = (price - (signedPrice >> 2)) & 0xffff;
  return true;
}

function applyDisasterMarketEffect(eventType) {
  if (!farmStateBytes || !saveData) return false;
  const response =
    eventType === 2
      ? "drought"
      : eventType === 3
        ? "flood"
        : [5, 6].includes(eventType)
          ? "storm"
          : null;
  if (!response) return false;
  if (!marketRuntime.initialized) initializeMarketRuntime();
  let changed = false;
  for (let slot = 0; slot < 16; slot += 1) {
    const shifts = cropMarketDisasterShifts.get(cropSlotName(slot));
    const shift = shifts?.[response] ?? 0;
    if (shift === 0) continue;
    const history = marketRuntime.history[slot];
    let price = history[29] & 0xffff;
    price = (price + (price >>> shift)) & 0xffff;
    const maximum =
      ((cropMarketBasePrices.get(cropSlotName(slot)) ?? 0) << 2) & 0xffff;
    if (price > maximum) price = maximum;
    history[29] = price;
    changed = true;
  }
  return changed;
}

function advanceMarketWeek() {
  if (!farmStateBytes || !saveData) return false;
  if (!marketRuntime.initialized) initializeMarketRuntime();
  const trendRoll = nextSimSecondaryRandom() & 0x0f;
  if (trendRoll >= 13) marketRuntime.trend = nextSimSmallRandom(3);
  // CODE59 contains this thirteen-tick rollover even though the release has
  // no direct writer for its adjacent age byte; retain it for imported or
  // locally restored runtime state.
  if (marketRuntime.trendAge > 12) {
    marketRuntime.trend = (marketRuntime.trend + 1) % 3;
    marketRuntime.trendAge = 0;
  }
  for (let slot = 0; slot < 16; slot += 1) {
    const history = marketRuntime.history[slot];
    for (let sample = 0; sample < 29; sample += 1)
      history[sample] = history[sample + 1];
    let price = history[29] & 0xffff;
    const signedPrice = price & 0x8000 ? price - 0x10000 : price;
    const step = signedPrice >> 3;
    if (price === 0) price = 1;
    const randomClass = nextSimSecondaryRandom() & 7;
    const increaseThreshold = [3, 1, 5][marketRuntime.trend];
    const amount = (nextSimSecondaryRandom() & 3) * step;
    price =
      (price + (randomClass <= increaseThreshold ? amount : -amount)) & 0xffff;

    const basePrice = marketCropData(slot).basePrice & 0xffff;
    const maximum = (basePrice << 1) & 0xffff;
    const minimum = basePrice >>> 1;
    if (price > maximum) price = maximum;
    if (price < minimum) price = minimum;
    const signedResult = price & 0x8000 ? price - 0x10000 : price;
    if (signedResult < 10) {
      price = 10;
      marketRuntime.trend = 1;
    }
    history[29] = price;
    writeMarketQuote(slot, price);
  }
  return true;
}

function marketDisplayedValue(slot = marketRuntime.selectedCrop) {
  const crop = marketCropData(slot);
  if (!crop.item) return 0;
  return Math.imul(Math.floor(crop.item.price / 10), crop.quantity) & 0xffff;
}

function marketPlotY(value, basePrice) {
  const divisor = Math.max(1, basePrice >>> 3);
  let units;
  if ((value & 0xffff) < (basePrice & 0xffff)) {
    units =
      16 - Math.floor(((basePrice & 0xffff) - (value & 0xffff)) / divisor);
  } else {
    units =
      16 + Math.floor(((value & 0xffff) - (basePrice & 0xffff)) / divisor);
  }
  return Math.max(38, Math.min(172, 175 - units * 4));
}

function buyCategoryItems(categoryIndex) {
  const items = [];
  const category = buyCategories[categoryIndex];
  if (!category || !farmStateBytes) return items;
  const declaredCount = saveData.format[category.count];
  const count = Math.min(category.visibleCount ?? declaredCount, declaredCount);
  const indexes =
    category.order || Array.from({ length: count }, (_, index) => index);
  for (const index of indexes) {
    const item = itemDefinition(categoryIndex, index);
    if (item && item.price > 0) items.push(item);
  }
  return items;
}

function selectedBuyDefinition() {
  const items = buyCategoryItems(buyCategoryIndex);
  if (items.length === 0) return null;
  buyItemIndex = Math.max(0, Math.min(items.length - 1, buyItemIndex));
  return items[buyItemIndex];
}

function invalidateBuyPreview() {
  buyPreviewTiles = null;
}

function resetBuyWindowRuntime() {
  buyCategoryIndex = 2;
  buyItemIndex = 0;
  invalidateBuyPreview();
  buyCategoryBevelResidues.clear();
}

function selectBuyCategory(categoryIndex) {
  if (categoryIndex !== buyCategoryIndex) {
    // Raising a native 27x27 bevel leaves its two lower-left corner pixels
    // gray. Preserve that retail UI residue until the dialog is rebuilt.
    buyCategoryBevelResidues.add(buyCategoryIndex);
  }
  // ovl24_02b2 always calls FUN_8c19_0744 with the category's first table
  // index, even when the already-active category control is clicked again.
  buyCategoryIndex = categoryIndex;
  buyItemIndex = 0;
  invalidateBuyPreview();
}

function stepBuyItem(delta) {
  const count = buyCategoryItems(buyCategoryIndex).length;
  if (count < 1) return;
  buyItemIndex = (buyItemIndex + delta + count) % count;
  invalidateBuyPreview();
}

function selectedPurchaseDefinition() {
  if (!selectedPurchaseItem) return null;
  return itemDefinition(
    selectedPurchaseItem.categoryIndex,
    selectedPurchaseItem.itemIndex,
  );
}

function itemTextLines(textIndex) {
  const record = originalText?.itemtextRecords?.[textIndex];
  if (Array.isArray(record)) {
    return record.map((line) => line.replaceAll("~", "").trimEnd());
  }
  const lines = originalText?.itemtext || [];
  let start = textIndex * 8;
  for (
    let offset = 0;
    offset <= 2 && start + offset < lines.length;
    offset += 1
  ) {
    const line = lines[start + offset].trim();
    if (line.includes("~~") || line === "Not a Llama.") {
      start += offset;
      break;
    }
  }
  return lines
    .slice(start, start + 8)
    .map((line) => line.replaceAll("~", "").trimEnd());
}

function nativeItemTextSource(textIndex) {
  const record = originalText?.itemtextRecords?.[textIndex];
  if (Array.isArray(record)) return record.join(" ");
  return itemTextLines(textIndex).join(" ");
}

function nativeWrappedItemTextTokens(textIndex, x, y, width) {
  // Buy calls window-relative wrapper FUN_0636_03d2. It does not use the
  // authored ITEMTEXT line lengths; it looks ahead one word at a time,
  // measures every DOS glyph as eight pixels, and
  // reserves an eight-pixel separator before the word. Tilde is the native
  // hard-break marker; @ is a separator and ` is painted as a space glyph.
  const source = nativeItemTextSource(textIndex);
  const isWordCharacter = (character) => {
    if (!character) return false;
    const code = character.charCodeAt(0);
    return code > 0x20 && code < 0x7b && character !== "@";
  };
  const wordLengthAt = (start) => {
    let cursor = start;
    while (cursor < source.length && !isWordCharacter(source[cursor]))
      cursor += 1;
    let length = 0;
    while (cursor < source.length && isWordCharacter(source[cursor])) {
      cursor += 1;
      length += 1;
    }
    return length;
  };

  const tokens = [];
  let cursor = 0;
  let offsetX = 0;
  let lineY = y;
  while (cursor < source.length) {
    const wordLength = wordLengthAt(cursor);
    if (width < wordLength * 8 + offsetX + 8) {
      lineY += 8;
      offsetX = 0;
    }

    // The native routine paints an empty cell here before advancing. It is
    // visually inert on the already-cleared Buy description panel, but the
    // advance establishes the exact first-glyph and inter-word positions.
    offsetX += 8;
    while (
      cursor < source.length &&
      !isWordCharacter(source[cursor]) &&
      source[cursor] !== "~"
    ) {
      cursor += 1;
    }

    const tokenX = x + offsetX;
    let text = "";
    while (cursor < source.length && isWordCharacter(source[cursor])) {
      text += source[cursor] === "`" ? " " : source[cursor];
      offsetX += 8;
      cursor += 1;
    }
    if (text) tokens.push({ text, x: tokenX, y: lineY });

    if (source[cursor] === "~") {
      lineY += 8;
      offsetX = 0;
      cursor += 1;
    }
  }
  return tokens;
}

function terrainExamineTextIndex(tile) {
  const ranges = originalText?.itemtextTileRanges || [];
  for (let index = 0; index < ranges.length; index += 1) {
    const [start, count] = ranges[index];
    if (start <= tile && tile < start + count) return index;
  }
  return -1;
}

function townExamineBuildingKind(tile) {
  // 7e85:1092 recognizes ten 3x3 ranges laid out in three 40-tile rows;
  // 7e85:10e0 follows with four 3x2 ranges in the preceding two rows.
  if ((tile >= 0x0fe && tile <= 0x117) || (tile >= 0x126 && tile <= 0x13f)) {
    return 0;
  }
  for (let group = 0; group < 10; group += 1) {
    const left = group * 3;
    const x = tile % 0x28;
    const y = Math.floor(tile / 0x28);
    if (x >= left && x < left + 3 && y >= 8 && y < 11) return group + 2;
  }
  for (let group = 0; group < 4; group += 1) {
    const left = group * 3;
    const x = tile % 0x28;
    const y = Math.floor(tile / 0x28);
    if (x >= left && x < left + 3 && y >= 6 && y < 8) return group + 12;
  }
  return 0;
}

function wrappedExamineLines(value) {
  const result = [];
  let line = "";
  for (const word of value.trim().split(/\s+/)) {
    if (!line) line = word;
    else if (line.length + word.length + 1 <= 20) line += ` ${word}`;
    else {
      result.push(line);
      line = word;
    }
  }
  if (line) result.push(line);
  return result.slice(0, 14);
}

function itemTextExamineLines(textIndex) {
  const record = originalText?.itemtextRecords?.[textIndex];
  if (!Array.isArray(record)) return itemTextLines(textIndex);
  const source = record
    .map((line) => line.trim())
    .join(" ")
    .trim();
  const result = [];
  for (const segment of source.split("~")) {
    if (!segment.trim()) {
      result.push("");
      continue;
    }
    result.push(...wrappedExamineLines(segment));
  }
  while (result.length > 0 && !result[result.length - 1]) result.pop();
  return result.slice(0, 14);
}

function terrainExamineInfo(position, pointerX, pointerY) {
  const cell = position ? mapCell(position.x, position.y) : null;
  if (!cell || !farmStateBytes || !saveData) return null;
  const words = tileWords(cell);
  const baseTile = words.base & 0x07ff;
  const displayTile =
    ((words.base & 0x0800) !== 0 ? words.overlay : words.base) & 0x07ff;
  const makeInfo = (kind, artIndex, lines, textIndex = -1) => ({
    kind,
    artIndex,
    lines,
    textIndex,
    tile: displayTile,
    baseTile,
    x: position.x,
    y: position.y,
    pointerX,
    pointerY,
  });

  if ([0x49, 0x4a, 0x71, 0x72].includes(baseTile)) {
    return makeInfo(
      "crashed-aircraft",
      0x29,
      wrappedExamineLines("One very very badly damaged aircraft."),
    );
  }
  if (baseTile >= 0x53 && baseTile <= 0x56) {
    return makeInfo(
      "water-tower",
      0x32,
      wrappedExamineLines(
        "Inside of a water tower, the amount of blue shows how full the tower is.",
      ),
    );
  }
  if ((words.overlay & 0x4000) !== 0) {
    return makeInfo(
      "town-area",
      0x4a,
      wrappedExamineLines("Town area, boy does fun stuff happen here!"),
    );
  }

  const view = stateView(farmStateBytes);
  const homesteadX = view.getUint16(
    saveData.format.startupCoordinateXOffset,
    true,
  );
  const homesteadY = view.getUint16(
    saveData.format.startupCoordinateYOffset,
    true,
  );
  if (
    position.x >= homesteadX + 1 &&
    position.x <= homesteadX + 3 &&
    position.y >= homesteadY + 1 &&
    position.y <= homesteadY + 3
  ) {
    return makeInfo("homestead", 0x43, itemTextExamineLines(12), 12);
  }

  const townKind = townExamineBuildingKind(baseTile);
  if (townKind !== 0) {
    return makeInfo(
      townKind === 1 ? "town-residential" : "town-building",
      0x4a,
      wrappedExamineLines(
        townKind === 1 ? "Town Residential" : "Town building",
      ),
    );
  }
  if (displayTile === 0x0d9) {
    return makeInfo(
      "empty-storage",
      0x4a,
      wrappedExamineLines("Empty Storage Spot"),
    );
  }
  if (displayTile >= 0x394 && displayTile <= 0x39c) {
    return makeInfo(
      "programmer-car",
      0x4a,
      wrappedExamineLines(
        "Eric Albers heading home after a late night programming da farm",
      ),
    );
  }
  const textIndex = terrainExamineTextIndex(displayTile);
  if (textIndex < 0) {
    return makeInfo("unknown", 0x4a, wrappedExamineLines("NO TEXT FOR ITEM"));
  }
  return makeInfo("terrain", 0x4a, itemTextExamineLines(textIndex), textIndex);
}

function drawBuyWindow() {
  // BUYWNDO.BMP is the original clean client image. The screenshot-derived
  // former base baked in Cow, its category state, and its preview, causing
  // every other selection to retain stale pixels.
  context.drawImage(images.buy, 128, 112);
  const item = selectedBuyDefinition();
  if (!item) return;

  // FUN_8c19_0000 paints a 4x3 patch of random bare-terrain variants in
  // x-major order once per item repaint, then centers the item's real map
  // footprint over it.
  if (!buyPreviewTiles) {
    buyPreviewTiles = Array.from(
      { length: 12 },
      () => 0x13 + (nextSimRandom() & 3),
    );
  }
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      drawMapTile(
        buyPreviewTiles[column * 3 + row],
        304 + column * 16,
        128 + row * 16,
      );
    }
  }
  const previewRange = originalText?.itemtextTileRanges?.[item.textIndex];
  let previewTile = previewRange?.[0];
  if (Number.isInteger(previewTile)) {
    const previewX = 304 + Math.floor((64 - item.width * 16) / 2);
    const previewY = 128 + Math.floor((48 - item.height * 16) / 2);
    for (let row = 0; row < item.height; row += 1) {
      for (let column = 0; column < item.width; column += 1) {
        const x = previewX + column * 16;
        const y = previewY + row * 16;
        if (previewTile < 0x350) drawMapTile(previewTile, x, y);
        else drawMaskedMapTile(previewTile, x, y);
        previewTile += 1;
      }
    }
  }

  // The five category controls in BUYWNDO are spaced by 30 pixels. Their
  // generic widget bevel is 27x27 and offset inside each authored icon.
  drawDepressedEditButton(138, 118 + buyCategoryIndex * 30, 27, 27);
  context.fillStyle = "#828282";
  for (const categoryIndex of buyCategoryBevelResidues) {
    if (categoryIndex === buyCategoryIndex) continue;
    context.fillRect(140, 143 + categoryIndex * 30, 1, 1);
    context.fillRect(139, 144 + categoryIndex * 30, 1, 1);
  }

  context.drawImage(
    weatherAllTiles(),
    (item.artIndex % 8) * 112,
    Math.floor(item.artIndex / 8) * 64,
    112,
    64,
    176,
    120,
    112,
    64,
  );

  context.fillStyle = "#c3c3c3";
  context.fillRect(176, 208, 112, 72);
  for (const token of nativeWrappedItemTextTokens(
    item.textIndex,
    168,
    209,
    112,
  )) {
    drawText(token.text, token.x, token.y);
  }

  context.fillStyle = "#c3c3c3";
  context.fillRect(300, 240, 68, 8);
  context.fillRect(300, 272, 68, 8);
  drawText(String(item.price), 304, 240);
  drawText(String(item.own), 304, 272);
}

function itemDefinitionForKeyAndId(categoryKey, id) {
  const categoryIndex = buyCategories.findIndex(
    (category) => category.key === categoryKey,
  );
  if (categoryIndex >= 0) {
    const category = buyCategories[categoryIndex];
    const count = saveData.format[category.count];
    for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
      const item = itemDefinition(categoryIndex, itemIndex);
      if (item && item.id === id) return item;
    }
    return null;
  }
  const formatCategories = {
    commodity: [
      "commodityItemDefinitionOffset",
      "commodityItemDefinitionCount",
    ],
    "stored-crop": [
      "storedCropItemDefinitionOffset",
      "storedCropItemDefinitionCount",
    ],
  };
  const source = formatCategories[categoryKey];
  if (!source) return null;
  const count = saveData.format[source[1]];
  for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
    const item = formatItemDefinition(
      categoryKey,
      source[0],
      source[1],
      itemIndex,
    );
    if (item && item.id === id) return item;
  }
  return null;
}

function storedCropSalePrice(record) {
  const view = stateView(record);
  const id = view.getUint16(0, true);
  const quantity = view.getUint16(2, true);
  const quality = view.getUint16(4, true);
  if (id < 0xa8 || id > 0xb7 || quality > 51000) return 0;
  const commodity = itemDefinitionForKeyAndId("commodity", 0x80 + id - 0xa8);
  if (!commodity) return 0;
  const units = quantity * Math.floor(commodity.price / 10);
  return Math.floor((units * (0xffff - quality)) / 0x10000);
}

function machineConditionClass(record) {
  // The original divides damage byte 17 by 52. Quotients 0 and 1 are both
  // A/HIGH; subsequent quotients are B/FAIR, C/POOR, and X/BAD.
  return 3 - Math.min(3, Math.max(0, Math.floor(record[17] / 52) - 1));
}

function machineCurrentValue(record, definition) {
  return Math.floor(
    definition.price / (1 << (3 - machineConditionClass(record))),
  );
}

function sellInventory(categoryIndex = sellCategoryIndex) {
  if (!farmStateBytes || !saveData) return [];
  const categoryKey = sellCategoryKeys[categoryIndex];
  const entries = [];
  if (categoryKey === "stored-crop") {
    for (
      let slot = 1;
      slot < saveData.format.storageLotRecordCount;
      slot += 1
    ) {
      const record = storageLotRecord(slot);
      if ((record[10] & 0x20) === 0) continue;
      const id = stateView(record).getUint16(0, true);
      if (id < 0xa8 || id > 0xb7) continue;
      const definition = itemDefinitionForKeyAndId("stored-crop", id);
      if (definition) {
        entries.push({
          categoryKey,
          slot,
          record,
          definition,
          price: storedCropSalePrice(record),
        });
      }
    }
  } else if (categoryKey === "machine") {
    for (let slot = 1; slot < saveData.format.machineRecordCount; slot += 1) {
      const record = machineRecord(slot);
      const view = stateView(record);
      if ((view.getUint16(2, true) & 0x20) === 0) continue;
      const definition = itemDefinitionForKeyAndId(
        "machine",
        view.getUint16(0, true),
      );
      if (definition) {
        entries.push({
          categoryKey,
          slot,
          record,
          definition,
          price: machineCurrentValue(record, definition),
        });
      }
    }
  } else if (categoryKey === "livestock") {
    for (let slot = 1; slot < saveData.format.objectRecordCount; slot += 1) {
      const record = objectRecord(slot);
      const view = stateView(record);
      if ((view.getUint16(2, true) & 0x20) === 0) continue;
      const definition = itemDefinitionForKeyAndId(
        "livestock",
        view.getUint16(6, true),
      );
      if (definition) {
        entries.push({
          categoryKey,
          slot,
          record,
          definition,
          price: livestockCurrentValue(record, definition),
        });
      }
    }
  }
  return entries;
}

function selectedSellEntry() {
  const entries = sellInventory();
  if (entries.length === 0) {
    sellItemIndex = 0;
    sellScrollOffset = 0;
    return null;
  }
  sellItemIndex = Math.max(0, Math.min(entries.length - 1, sellItemIndex));
  sellScrollOffset = Math.max(
    0,
    Math.min(Math.max(0, entries.length - 3), sellScrollOffset),
  );
  if (sellItemIndex < sellScrollOffset) sellScrollOffset = sellItemIndex;
  if (sellItemIndex > sellScrollOffset + 2)
    sellScrollOffset = sellItemIndex - 2;
  return entries[sellItemIndex];
}

function resetSellWindowRuntime() {
  sellCategoryIndex = 0;
  sellItemIndex = 0;
  sellScrollOffset = 0;
  sellCategoryBevelResidues.clear();
  sellScrollbarHeld = false;
}

function selectSellCategory(categoryIndex) {
  if (categoryIndex !== sellCategoryIndex) {
    // The native 27x27 control leaves the same two lower-left bevel pixels
    // behind as Buy when its formerly active category is raised.
    sellCategoryBevelResidues.add(sellCategoryIndex);
  }
  sellCategoryIndex = categoryIndex;
  sellItemIndex = 0;
  sellScrollOffset = 0;
}

function stepSellItem(delta) {
  const entries = sellInventory();
  if (entries.length === 0) return;
  selectedSellEntry();
  const selectedRow = sellItemIndex - sellScrollOffset;
  if (delta < 0) {
    if (selectedRow > 0) sellItemIndex -= 1;
    else if (sellScrollOffset > 0) {
      sellScrollOffset -= 1;
      sellItemIndex -= 1;
    }
    return;
  }
  if (sellItemIndex >= entries.length - 1) return;
  sellItemIndex += 1;
  if (selectedRow >= 2) sellScrollOffset += 1;
}

function selectSellRow(row) {
  const index = sellScrollOffset + row;
  if (index < sellInventory().length) sellItemIndex = index;
}

function seekSellScrollbar(y) {
  const entries = sellInventory();
  if (entries.length <= 3) return;
  const selectedRow = sellItemIndex - sellScrollOffset;
  const trackOffset = Math.max(0, Math.min(48, y - 208));
  sellScrollOffset = Math.min(
    entries.length - 3,
    Math.floor((trackOffset * entries.length) / 48),
  );
  sellItemIndex = Math.min(entries.length - 1, sellScrollOffset + selectedRow);
}

function sellEntryTile(entry) {
  if (entry.categoryKey === "stored-crop") return -1;
  const x = entry.categoryKey === "machine" ? entry.record[5] : entry.record[0];
  const y = entry.categoryKey === "machine" ? entry.record[6] : entry.record[1];
  const cell = mapCell(x, y);
  if (cell) {
    const words = tileWords(cell);
    const tile = words.overlay & 0x07ff;
    if (tile >= 0x350) return tile;
  }
  if (entry.categoryKey === "machine") {
    return machineOverlayStarts.get(entry.definition.id) ?? 0x350;
  }
  return livestockInitialTiles.get(entry.definition.id) ?? 0x3c2;
}

function sellEntryConditionClass(entry) {
  if (entry.categoryKey === "livestock") return entry.record[8] >> 6;
  if (entry.categoryKey === "machine")
    return machineConditionClass(entry.record);
  const quality = stateView(entry.record).getUint16(4, true);
  return 3 - Math.min(3, quality >> 14);
}

function drawSellEntryFootprint(entry, x, y) {
  if (entry.categoryKey === "stored-crop") {
    const cropImage = weatherCropImage(entry.definition.id - 0xa8);
    if (cropImage) {
      // The Sell row helper requests CRP tile 40. Buy's catalog preview is
      // the adjacent tile 41, so the two superficially similar swatches are
      // intentionally not interchangeable.
      context.drawImage(cropImage, 80, 80, 16, 16, x, y + 8, 16, 16);
      return;
    }
  }
  let tile =
    originalText?.itemtextTileRanges?.[entry.definition.textIndex]?.[0];
  if (!Number.isInteger(tile)) tile = sellEntryTile(entry);
  const width = Math.max(1, entry.definition.width);
  const height = Math.max(1, entry.definition.height);
  const top = height === 1 ? y + 8 : y;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const drawX = x + column * 16;
      const drawY = top + row * 16;
      if (tile < 0x350) drawMapTile(tile, drawX, drawY);
      else drawMaskedMapTile(tile, drawX, drawY);
      tile += 1;
    }
  }
}

function drawPixelRectangle(x1, y1, x2, y2, color) {
  context.fillStyle = color;
  context.fillRect(x1, y1, x2 - x1 + 1, 1);
  context.fillRect(x1, y2, x2 - x1 + 1, 1);
  context.fillRect(x1, y1 + 1, 1, y2 - y1 - 1);
  context.fillRect(x2, y1 + 1, 1, y2 - y1 - 1);
}

function drawSellScrollbar(total) {
  for (let y = 208; y <= 256; y += 16) drawMapTile(5, 144, y);
  const divisor = Math.max(1, total);
  const thumbOffset = Math.max(
    0,
    Math.min(48, Math.floor((sellScrollOffset * 48) / divisor)),
  );
  drawMapTile(6, 144, 208 + thumbOffset);
}

function drawSellWindow() {
  // SELLWNDO.BMP is the original clean client below the separately painted
  // title bar. The former screenshot base baked in the empty warehouse,
  // category state, and scrollbar thumb.
  context.drawImage(images.sell, 128, 96);
  const entries = sellInventory();
  const entry = selectedSellEntry();
  drawDepressedEditButton(144, 98 + sellCategoryIndex * 30, 27, 27);
  context.fillStyle = "#828282";
  for (const categoryIndex of sellCategoryBevelResidues) {
    if (categoryIndex === sellCategoryIndex) continue;
    context.fillRect(146, 123 + categoryIndex * 30, 1, 1);
    context.fillRect(145, 124 + categoryIndex * 30, 1, 1);
  }
  drawSellScrollbar(entries.length);

  const portraitIndex = entry
    ? entry.definition.artIndex +
      (entry.categoryKey === "livestock" &&
      stateView(entry.record).getUint16(2, true) & 1
        ? 1
        : 0)
    : 0x30;

  context.drawImage(
    weatherAllTiles(),
    (portraitIndex % 8) * 112,
    Math.floor(portraitIndex / 8) * 64,
    112,
    64,
    184,
    104,
    112,
    64,
  );
  context.fillStyle = "#c3c3c3";
  context.fillRect(168, 192, 136, 96);
  if (!entry) {
    drawText("NOTHING", 168, 192);
    drawText("FOR SALE", 168, 200);
    return;
  }

  const textIndex = entry.definition.textIndex;
  // ITEMTEXT.DAT is partitioned into fixed 128-byte records. These ranges
  // begin on the LF half of a split CR/LF pair; Sell's 13-cell copier paints
  // that byte as one leading blank, unlike Buy's word-oriented wrapper.
  const leadingRecordCell =
    (textIndex >= 57 && textIndex <= 86) ||
    (textIndex >= 103 && textIndex <= 108) ||
    (textIndex >= 125 && textIndex <= 147);
  const title = itemTextLines(textIndex)[0].replaceAll("~", "");
  drawText(`${leadingRecordCell ? " " : ""}${title}`.slice(0, 13), 176, 176);

  for (let row = 0; row < 3; row += 1) {
    const index = sellScrollOffset + row;
    if (index >= entries.length) continue;
    const visible = entries[index];
    const y = 192 + row * 32;
    drawSellEntryFootprint(visible, 176, y);
    const conditionClass = sellEntryConditionClass(visible);
    drawFieldCropIcon(24 + (3 - conditionClass), 208, y);
    drawText(`$ ${visible.price}`, 240, y + 12);
  }
  for (let row = 0; row < 3; row += 1) {
    const y = 192 + row * 32;
    drawPixelRectangle(168, y, 304, y + 31, "#000000");
  }
  const selectedY = 192 + (sellItemIndex - sellScrollOffset) * 32;
  drawPixelRectangle(168, selectedY, 303, selectedY + 31, "#fff304");
  drawPixelRectangle(169, selectedY + 1, 302, selectedY + 30, "#fff304");
  drawText(`Item: ${sellItemIndex + 1} of ${entries.length}`, 168, 296);
}

function clearRenderedOccupancy(x, y) {
  const cell = mapCell(x, y);
  if (!cell) return;
  const base = stateView(cell).getUint16(0, true) & ~0x0800;
  cell[0] = base & 0xff;
  cell[1] = base >> 8;
}

function clearStructureStorageCell(x, y) {
  const structure = structureAtPosition({ x, y });
  if (!structure) return false;
  const relativeX = x - structure.record[4];
  const relativeY = y - structure.record[5];
  const storageSlot = relativeX * 3 + relativeY;
  if (storageSlot < 0 || storageSlot >= 12) return false;
  const view = stateView(structure.record);
  view.setUint16(10 + storageSlot * 2, 0x00d9, true);
  view.setUint16(34 + storageSlot * 2, 0xffff, true);
  structure.record[58 + storageSlot] = 0;
  refreshOpenStructureStorageCell(structure, storageSlot);
  return true;
}

function clearStoredMachineFootprint(x, y, machineSlot) {
  const structure = structureAtPosition({ x, y });
  if (!structure) return false;
  const view = stateView(structure.record);
  let cleared = false;
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
      if (structure.record[58 + storageSlot] !== machineSlot) continue;
      view.setUint16(10 + storageSlot * 2, 0x00d9, true);
      view.setUint16(34 + storageSlot * 2, 0xffff, true);
      structure.record[58 + storageSlot] = 0;
      refreshOpenStructureStorageCell(structure, storageSlot);
      cleared = true;
    }
  }
  return cleared;
}

function addTaxableSaleIncome(amount) {
  if (!farmStateBytes || amount <= 0) return;
  const view = stateView(farmStateBytes);
  const offset = saveData.format.taxableSaleIncomeOffset;
  state.taxableSaleIncome = (state.taxableSaleIncome + amount) >>> 0;
  view.setUint32(offset, state.taxableSaleIncome, true);
}

function sellInventoryEntry(entry) {
  if (!entry) return false;
  const saveView = stateView(farmStateBytes);
  const recordView = stateView(entry.record);
  const definitionView = stateView(entry.definition.record);

  if (entry.categoryKey === "stored-crop") {
    const x = entry.record[8];
    const y = entry.record[9];
    if (!clearStructureStorageCell(x, y)) clearRenderedOccupancy(x, y);
    entry.record[10] &= ~0x20;
    saveView.setUint16(
      saveData.format.storageLotCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.storageLotCountOffset, true) - 1,
      ),
      true,
    );
    saveView.setUint32(
      saveData.format.storedCropSaleIncomeOffset,
      saveView.getUint32(saveData.format.storedCropSaleIncomeOffset, true) +
        entry.price * 2,
      true,
    );
  } else if (entry.categoryKey === "machine") {
    const x = entry.record[5];
    const y = entry.record[6];
    const width = entry.record[53] || entry.definition.width;
    const height = entry.record[54] || entry.definition.height;
    if (entry.definition.id === 8) {
      for (let machineX = 0; machineX < 2; machineX += 1) {
        for (let machineY = 0; machineY < 2; machineY += 1) {
          const cell = mapCell(x + machineX, y + machineY);
          const view = stateView(cell);
          view.setUint16(0, (view.getUint16(0, true) & 0xf800) | 0x17, true);
        }
      }
      const airportX = x >> 3;
      const airportY = y >> 3;
      const airportAt =
        saveData.format.environmentalGridOffset +
        (airportX * 12 + airportY) * saveData.format.environmentalGridCellSize;
      if ((x & 7) === 3) farmStateBytes[airportAt] &= ~0x20;
      else if ((x & 7) === 5) farmStateBytes[airportAt] &= ~0x40;
    } else {
      for (let machineX = 0; machineX < width; machineX += 1) {
        for (let machineY = 0; machineY < height; machineY += 1) {
          clearRenderedOccupancy(x + machineX, y + machineY);
        }
      }
    }
    recordView.setUint16(2, recordView.getUint16(2, true) & ~0x20, true);
    saveView.setUint16(
      saveData.format.machineCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.machineCountOffset, true) - 1,
      ),
      true,
    );
    const currentValue = saveView.getUint32(
      saveData.format.machinePurchaseExpenseOffset1,
      true,
    );
    saveView.setUint32(
      saveData.format.machinePurchaseExpenseOffset1,
      Math.max(0, currentValue - entry.definition.price),
      true,
    );
    saveView.setUint32(
      saveData.format.machineSaleIncomeOffset,
      saveView.getUint32(saveData.format.machineSaleIncomeOffset, true) +
        entry.price,
      true,
    );
  } else if (entry.categoryKey === "livestock") {
    clearRenderedOccupancy(entry.record[0], entry.record[1]);
    recordView.setUint16(2, recordView.getUint16(2, true) & ~0x20, true);
    livestockAssetValue =
      ((livestockAssetValue >>> 0) - (entry.price >>> 0)) >>> 0;
    saveView.setUint16(
      saveData.format.objectCountOffset,
      Math.max(
        0,
        saveView.getUint16(saveData.format.objectCountOffset, true) - 1,
      ),
      true,
    );
    saveView.setUint32(
      saveData.format.livestockSaleIncomeOffset,
      saveView.getUint32(saveData.format.livestockSaleIncomeOffset, true) +
        entry.price,
      true,
    );
  } else {
    return false;
  }

  definitionView.setUint16(
    4,
    Math.max(0, definitionView.getUint16(4, true) - 1),
    true,
  );
  addTaxableSaleIncome(entry.price);
  state.funds += entry.price;
  selectedSellEntry();
  mapDirty = true;
  message = "";
  return true;
}

function sellSelectedInventoryItem() {
  return sellInventoryEntry(selectedSellEntry());
}
