// Indexed drawing, window composition, cursor, and complete frame rendering.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function indexedMapPaletteAtCanvasPixel(canvasX, canvasY) {
  if (!farmStateBytes || mapPaletteIndexSheets.size === 0) return -1;
  const editPosition = gameWindowPosition(editWindowSentinel);
  const viewportLeft = editPosition.x + 48;
  const viewportTop = editPosition.y + 32;
  const relativeX = canvasX - viewportLeft;
  const relativeY = canvasY - viewportTop;
  if (relativeX < 0 || relativeY < 0 || relativeX >= 544 || relativeY >= 368)
    return -1;
  const screenX = Math.floor(relativeX / 16);
  const screenY = Math.floor(relativeY / 16);
  const pixelX = relativeX & 15;
  const pixelY = relativeY & 15;
  const cell = mapCell(
    camera.x - 1 + screenX,
    Math.min(95, camera.y + screenY),
  );
  if (!cell) return -1;
  const words = tileWords(cell);
  let index = indexedBaseMapTilePixel(
    animatedMapTileIndex(words.base & 0x07ff),
    pixelX,
    pixelY,
  );
  if ((words.base & 0x0800) !== 0) {
    const overlayIndex =
      animatedMaskedTileIndex(words.overlay & 0x07ff) - 0x350;
    const columns = Math.floor(images.maskedTiles.width / 16);
    const rows = Math.floor(images.maskedTiles.height / 16);
    if (overlayIndex >= 0 && overlayIndex < columns * rows) {
      const overlay = indexedSheetPixel(
        "maskedTileIndexes",
        (overlayIndex % columns) * 16 + pixelX,
        Math.floor(overlayIndex / columns) * 16 + pixelY,
      );
      if (overlay >= 0) index = overlay;
    }
  }
  return index;
}

function paletteIndexForCursorXor(red, green, blue, sourceHint = -1) {
  if (sourceHint >= 0 && sourceHint <= 15) {
    const hintedColor = farMapPaletteColor(sourceHint);
    if (
      hintedColor[0] === red &&
      hintedColor[1] === green &&
      hintedColor[2] === blue
    ) {
      return sourceHint;
    }
  }
  return paletteIndexForCanvasPixel(red, green, blue);
}

function drawMapCellCursorOutline() {
  if (
    !pointerVisible ||
    stage !== "game" ||
    !editVisible ||
    activeWindow ||
    modalNotice ||
    currentMenu !== null ||
    toolPopup ||
    heldEditHelp ||
    selectedTool === "Move Object"
  )
    return false;
  const editPoint = gameWindowPoint(pointer, editWindowSentinel);
  const position = mapCellForPointer(editPoint);
  if (!position) return false;
  const editPosition = gameWindowPosition(editWindowSentinel);
  const tileX = editPosition.x + 64 + (position.x - camera.x) * 16;
  const tileY = editPosition.y + 32 + (position.y - camera.y) * 16;
  const span = selectedCropSlot === null ? 16 : 128;
  if (selectedCropSlot !== null && (position.x + 8 > 96 || position.y + 8 > 96))
    return false;
  const outlineLeft = tileX - 1;
  const outlineTop = tileY - 1;
  const viewportLeft = editPosition.x + 48;
  const viewportTop = editPosition.y + 32;
  const viewportRight = viewportLeft + 544;
  const viewportBottom = viewportTop + 368;
  const left = Math.max(0, viewportLeft, outlineLeft);
  const top = Math.max(0, viewportTop, outlineTop);
  const right = Math.min(WIDTH, viewportRight, outlineLeft + span + 1);
  const bottom = Math.min(HEIGHT, viewportBottom, outlineTop + span + 1);
  if (
    left >= right ||
    top >= bottom ||
    typeof context.getImageData !== "function" ||
    typeof context.putImageData !== "function"
  )
    return false;
  let pixels;
  try {
    pixels = context.getImageData(left, top, right - left, bottom - top);
  } catch (_error) {
    return false;
  }
  if (!pixels?.data) return false;
  const targets = new Set();
  const add = (x, y) => {
    const canvasX = outlineLeft + x;
    const canvasY = outlineTop + y;
    if (
      canvasX >= left &&
      canvasX < right &&
      canvasY >= top &&
      canvasY < bottom
    ) {
      targets.add((canvasY - top) * (right - left) + canvasX - left);
    }
  };
  for (let x = 1; x < span; x += 1) add(x, 0);
  for (let x = 2; x < span - 1; x += 1) add(x, span);
  for (let y = 1; y <= span; y += 1) {
    add(0, y);
    add(span, y);
  }
  for (let x = 2; x < span - 1; x += 1) {
    add(x, 1);
    add(x, span - 1);
  }
  for (let y = 2; y < span - 1; y += 1) {
    add(1, y);
    add(span - 1, y);
  }
  for (const target of targets) {
    const offset = target * 4;
    const canvasX = left + (target % (right - left));
    const canvasY = top + Math.floor(target / (right - left));
    const sourceIndex = paletteIndexForCursorXor(
      pixels.data[offset],
      pixels.data[offset + 1],
      pixels.data[offset + 2],
      indexedMapPaletteAtCanvasPixel(canvasX, canvasY),
    );
    if (sourceIndex < 0) continue;
    const color = farMapPaletteColor(sourceIndex ^ 15);
    pixels.data[offset] = color[0];
    pixels.data[offset + 1] = color[1];
    pixels.data[offset + 2] = color[2];
    pixels.data[offset + 3] = 255;
  }
  context.putImageData(pixels, left, top);
  return true;
}

function drawScrollbars() {
  if (!cameraMoved()) return;
  const generated = markerIndex === null && generatedWorldActive;
  if (markerIndex === null && !generated) return;
  const source = generated ? images.genericMain : images[`main${markerIndex}`];
  // The clean native captures supply the scrollbar thumb artwork.
  const [initialHorizontal, initialVertical] = generated
    ? [240, 416]
    : scenarioScrollbarStarts[markerIndex];

  // Both tracks use repeating 16-pixel cells in the original skin. Restore
  // the track from an unobstructed cell before moving the captured thumb.
  for (let x = 32; x < 592; x += 16) {
    context.drawImage(source, 32, 448, 16, 16, x, 448, 16, 16);
  }
  for (let y = 80; y < 432; y += 16) {
    context.drawImage(source, 608, 80, 16, 16, 608, y, 16, 16);
  }

  //1d75:1846 uses absolute native origins and integer division, not a
  // rounded displacement from the startup thumb. Edit is608x416 with a
  //544x368 client: horizontal denominator96-34=62, vertical96-23=73.
  const horizontal =
    32 + Math.floor((Math.max(0, Math.min(62, camera.x - 1)) * 34) / 62) * 16;
  const vertical =
    80 + Math.floor((Math.max(0, Math.min(73, camera.y)) * 21) / 73) * 16;
  context.drawImage(
    source,
    initialHorizontal,
    448,
    16,
    16,
    horizontal,
    448,
    16,
    16,
  );
  context.drawImage(
    source,
    608,
    initialVertical,
    16,
    16,
    608,
    vertical,
    16,
    16,
  );
}

function drawTownEventModal() {
  if (!pendingTownEventPrompt) return false;
  context.drawImage(
    pendingTownEventPrompt.question
      ? images.townEventQuestion
      : images.townEventResult,
    192,
    150,
  );
  context.fillStyle = "#c3c3c3";
  context.fillRect(216, 244, 216, 56);
  pendingTownEventPrompt.lines.forEach((line, index) => {
    drawText(line.slice(0, 27), 216, 245 + index * 8);
  });
  return true;
}

function drawPropertySaleNotice() {
  const record =
    modalNotice === "property-sale-homestead"
      ? 13
      : modalNotice === "property-sale-field"
        ? 14
        : null;
  const lines = record === null ? null : genericEventLines(record);
  if (!lines) return false;
  // Both Property refusals use the same farmer portrait and OK furniture as
  // the original crop-duster notice; only the four-line client text differs.
  // The captured reusable client is the native 254-pixel interior but its
  // first source row belongs to the old background one pixel above the
  // dialog. Rebuild the true 256x192 exterior at 192,150, then copy only
  // source rows 1..191 into the one-pixel frame. The upper-right corner is
  // the native dark-gray continuation rather than black.
  context.fillStyle = "#000000";
  context.fillRect(192, 150, 256, 192);
  context.drawImage(
    images.cropDusterWarning,
    0,
    1,
    254,
    191,
    193,
    150,
    254,
    191,
  );
  context.fillStyle = "#414141";
  context.fillRect(447, 150, 1, 1);
  context.fillStyle = "#c3c3c3";
  context.fillRect(216, 245, 216, 56);
  lines.forEach((line, index) => drawText(line, 216, 246 + index * 8));
  return true;
}

function openGameWindow(name) {
  if (!name) return;
  if (name === "about") resetAboutCredits();
  gameWindowPosition(name);
  // The DOS UI is an ordered child-window workspace. Selecting a new child
  // leaves every existing child underneath it; selecting an existing child
  // removes that instance from its old depth and brings it to the front.
  const ordered = [...windowStack];
  if (activeWindow) ordered.push(activeWindow);
  else if (editVisible && !ordered.includes(editWindowSentinel)) {
    ordered.push(editWindowSentinel);
  }
  windowStack = ordered.filter((candidate) => candidate !== name);
  activeWindow = name;
}

function closeActiveWindow() {
  if (activeWindow === "save-game") endNativeFileDialogPause();
  if (windowDragState?.name === activeWindow) windowDragState = null;
  const revealed = windowStack.length > 0 ? windowStack.pop() : null;
  activeWindow = revealed === editWindowSentinel ? null : revealed;
}

function clearGameWindows() {
  windowStack = [];
  activeWindow = null;
  windowDragState = null;
}

function setOnlyGameWindow(name) {
  if (name === "about") resetAboutCredits();
  windowStack = name && editVisible ? [editWindowSentinel] : [];
  activeWindow = name || null;
  if (activeWindow) gameWindowPosition(activeWindow);
  windowDragState = null;
}

function removeGameWindow(name) {
  const ordered = [...windowStack];
  if (activeWindow) ordered.push(activeWindow);
  const remaining = ordered.filter((candidate) => candidate !== name);
  const revealed = remaining.pop() || null;
  activeWindow = revealed === editWindowSentinel ? null : revealed;
  windowStack = remaining;
  if (windowDragState?.name === name) windowDragState = null;
}

function gameWindowPosition(name) {
  const chrome = windowChromeDefinitions[name];
  if (!chrome) return null;
  if (!windowPositions.has(name))
    windowPositions.set(name, { x: chrome.x, y: chrome.y });
  return windowPositions.get(name);
}

function gameWindowPoint(point, name = activeWindow) {
  const chrome = windowChromeDefinitions[name];
  const position = gameWindowPosition(name);
  if (!chrome || !position) return point;
  return {
    x: point.x - (position.x - chrome.x),
    y: point.y - (position.y - chrome.y),
  };
}

function pointInsideGameWindow(point, name) {
  const chrome = windowChromeDefinitions[name];
  const position = gameWindowPosition(name);
  return Boolean(
    (name !== editWindowSentinel || editVisible) &&
      chrome &&
      position &&
      inside(point, position.x, position.y, chrome.width, chrome.height),
  );
}

function activateExposedChildAtPoint(point) {
  if (
    stage !== "game" ||
    modalNotice ||
    bankruptcyPromptArmed ||
    currentMenu !== null ||
    !activeWindow ||
    pointInsideGameWindow(point, activeWindow)
  )
    return false;
  for (let index = windowStack.length - 1; index >= 0; index -= 1) {
    const name = windowStack[index];
    if (name === editWindowSentinel) {
      if (pointInsideGameWindow(point, name)) {
        activateEditWindow();
        return true;
      }
      break;
    }
    if (!pointInsideGameWindow(point, name)) continue;
    // Clicking an exposed ancestor child unwinds its descendants. The
    // descriptor itself becomes active and keeps its last coordinates.
    windowStack = windowStack.slice(0, index);
    activeWindow = name;
    windowDragState = null;
    return true;
  }
  return false;
}

function activateEditWindow() {
  const ordered = windowStack.filter((name) => name !== editWindowSentinel);
  if (activeWindow) ordered.push(activeWindow);
  windowStack = ordered;
  activeWindow = null;
  editVisible = true;
  windowDragState = null;
}

function closeEditWindow() {
  if (!editVisible || activeWindow !== null) return false;
  editVisible = false;
  let revealed = windowStack.length > 0 ? windowStack.pop() : null;
  if (revealed === editWindowSentinel) revealed = null;
  activeWindow = revealed;
  return true;
}

function closeWindowFromTitleAtPoint(point) {
  if (
    stage !== "game" ||
    modalNotice ||
    currentMenu !== null ||
    activeWindow === "about"
  ) {
    return false;
  }
  if (activeWindow === null) {
    const position = gameWindowPosition(editWindowSentinel);
    return Boolean(
      position &&
        inside(point, position.x, position.y, 16, 16) &&
        closeEditWindow(),
    );
  }
  const chrome = windowChromeDefinitions[activeWindow];
  const position = gameWindowPosition(activeWindow);
  if (!chrome || !position || !inside(point, position.x, position.y, 16, 16)) {
    return false;
  }
  closeActiveWindow();
  selectedFieldSlot = null;
  return true;
}

function beginWindowDrag(point) {
  if (
    stage !== "game" ||
    modalNotice ||
    currentMenu !== null ||
    activeWindow === "about"
  )
    return false;
  const dragWindow = activeWindow || (editVisible ? editWindowSentinel : null);
  if (!dragWindow) return false;
  const chrome = windowChromeDefinitions[dragWindow];
  const position = gameWindowPosition(dragWindow);
  if (
    !chrome ||
    !position ||
    !inside(point, position.x, position.y, chrome.width, 16)
  ) {
    return false;
  }
  const grabX = point.x - position.x;
  const grabY = point.y - position.y;
  // 1c43:06df reserves the first 17 title pixels for the close control.
  if (grabX <= 16) return false;
  windowDragState = {
    name: dragWindow,
    grabX,
    grabY,
    x: position.x,
    y: position.y,
  };
  return true;
}

function moveWindowDrag(point) {
  if (!windowDragState) return false;
  const chrome = windowChromeDefinitions[windowDragState.name];
  if (!chrome) return false;
  windowDragState.x = Math.max(
    0,
    Math.min(WIDTH - chrome.width, point.x - windowDragState.grabX),
  );
  windowDragState.y = Math.max(
    48,
    Math.min(HEIGHT - chrome.height, point.y - windowDragState.grabY),
  );
  return true;
}

function finishWindowDrag() {
  if (!windowDragState) return false;
  const position = gameWindowPosition(windowDragState.name);
  if (position) {
    // 42e9:0273 masks the low coordinate nibbles after release.
    position.x = windowDragState.x & 0xfff0;
    position.y = windowDragState.y & 0xfff0;
  }
  windowDragState = null;
  return true;
}

function drawGameWindow(name) {
  if (name === "save-game") drawSaveGameWindow();
  else if (name === "load-crop") drawLoadCropWindow();
  else if (name === "map") drawMapWindow();
  else if (name === "buy") drawBuyWindow();
  else if (name === "sell") drawSellWindow();
  else if (name === "field-status") drawFieldStatusWindow();
  else if (name === "airplane") drawAirplaneWindow();
  else if (name === "bank") drawBankWindow();
  else if (name === "evaluation") drawEvaluationWindow();
  else if (name === "balance") drawBalanceSheetWindow();
  else if (name === "market") drawMarketValueWindow();
  else if (name === "expert") drawExpertWindow();
  else if (name === "weather") drawWeatherWindow();
  else if (name === "about") drawAboutWindow();
  else if (windowDefinitions[name]) drawStandardWindow(windowDefinitions[name]);
}

function drawGameWindowTitle(name, active) {
  const chrome = windowChromeDefinitions[name];
  if (!chrome) return;
  drawTitleBar(chrome.x, chrome.y, chrome.width, chrome.title, active);
}

function drawActiveWindow() {
  // The base Edit image is painted before this routine. Children below the
  // Edit sentinel are therefore fully occluded; children above it remain
  // visible in back-to-front order. When Edit itself is active, every child
  // descriptor is behind it and no child repaint is visible.
  const editIndex = windowStack.lastIndexOf(editWindowSentinel);
  const visibleWindows =
    activeWindow === null
      ? []
      : windowStack
          .slice(editIndex + 1)
          .filter((name) => name !== editWindowSentinel);
  if (activeWindow) visibleWindows.push(activeWindow);
  for (const name of visibleWindows) {
    const chrome = windowChromeDefinitions[name];
    const position = gameWindowPosition(name);
    context.save();
    if (chrome && position) {
      context.translate(position.x - chrome.x, position.y - chrome.y);
    }
    drawGameWindow(name);
    drawGameWindowTitle(name, activeWindow === name);
    context.restore();
  }
  if (modalNotice === "quit-save") {
    drawQuitSaveNotice();
  } else if (modalNotice === "new-game-confirm") {
    drawNewGameConfirmation();
  } else if (modalNotice === "save-success") {
    drawSaveSuccessNotice();
  } else if (modalNotice === "load-crop-in-use") {
    drawLoadCropNotice();
  } else if (modalNotice?.startsWith("debug-") && drawDebugCommandNotice()) {
    // The date-gated LLAMA/FUND commands use the original popup and art.
  } else if (modalNotice?.startsWith("homestead-") && drawHomesteadNotice()) {
    // Annual class changes share POPUP.BMP; upgrades add animated COWMAN art.
  } else if (modalNotice === "event-card" && drawGenericEventNotice()) {
    // Generic EVENTS.DAT cards share the native popup and ALLTILES portrait.
  } else if (modalNotice === "town-vote") {
    context.drawImage(images.townChoice, 96, 96);
  } else if (modalNotice?.startsWith("town-") && drawTownEventModal()) {
    // drawTownEventModal owns all native town-event and stadium notices.
  } else if (
    modalNotice?.startsWith("property-sale-") &&
    drawPropertySaleNotice()
  ) {
    // The Property window stays visible below its blocking sale refusal.
  } else if (modalNotice === "bulldoze-structure-question") {
    context.drawImage(images.bulldozeQuestion, 192, 150);
  } else if (modalNotice === "bulldoze-field-question") {
    context.drawImage(images.bulldozeFieldQuestion, 192, 150);
  } else if (modalNotice === "bulldoze-field-busy") {
    context.drawImage(images.bulldozeFieldBusy, 192, 150);
  } else if (modalNotice === "tornado-warning") {
    context.drawImage(images.tornadoWarning, 192, 150);
  } else if (modalNotice === "locust-warning") {
    context.drawImage(images.locustWarning, 192, 150);
  } else if (modalNotice === "drought-warning") {
    context.drawImage(images.droughtWarning, 192, 150);
  } else if (modalNotice === "drought-ended") {
    context.drawImage(images.droughtEnded, 192, 150);
  } else if (modalNotice === "flood-warning") {
    context.drawImage(images.floodWarning, 192, 150);
  } else if (modalNotice === "flood-ended") {
    context.drawImage(images.floodEnded, 192, 150);
  } else if (modalNotice === "frost-warning") {
    context.drawImage(images.frostWarning, 192, 150);
  } else if (modalNotice === "windstorm-warning") {
    context.drawImage(images.windstormWarning, 192, 150);
  } else if (modalNotice === "windstorm-ended") {
    context.drawImage(images.windstormEnded, 192, 150);
  } else if (modalNotice === "close-encounter") {
    context.drawImage(images.closeEncounter, 192, 150);
  } else if (modalNotice === "toxicity-warning") {
    context.drawImage(images.toxicityWarning, 192, 150);
  } else if (modalNotice === "bank-foreclosure") {
    context.drawImage(images.bankForeclosure, 192, 150);
  } else if (modalNotice === "bankruptcy-question") {
    context.drawImage(images.bankruptcyQuestion, 192, 150);
  } else if (modalNotice === "bank-foreclosure-paid") {
    context.drawImage(images.bankForeclosurePaid, 192, 150);
  }
}

function drawWindowDragOutline() {
  if (!windowDragState) return;
  const chrome = windowChromeDefinitions[windowDragState.name];
  if (!chrome) return;
  // 42e9:007e..0105 draws a palette-15 outline while the event loop is
  // blocked; the child itself remains at its old coordinates until release.
  context.fillStyle = "#ffffff";
  context.fillRect(windowDragState.x, windowDragState.y, chrome.width + 1, 1);
  context.fillRect(
    windowDragState.x,
    windowDragState.y + chrome.height,
    chrome.width + 1,
    1,
  );
  context.fillRect(windowDragState.x, windowDragState.y, 1, chrome.height + 1);
  context.fillRect(
    windowDragState.x + chrome.width,
    windowDragState.y,
    1,
    chrome.height + 1,
  );
}

function drawTownDebugWindow() {
  if (!townDebugVisible) return;
  // Descriptor DS:7520 creates a 608x128 window at (16,160). The client is
  // the original bright-green palette entry and contains eleven 40-column
  // diagnostic rows, including the deliberate blank eighth row.
  drawTitleBar(16, 160, 608, "TOWN");
  context.fillStyle = "#00aa04";
  context.fillRect(16, 176, 608, 112);
  townDebugLines().forEach((line, index) =>
    drawText(line, 24, 176 + index * 8),
  );
}

function livestockCurrentValue(record, definition) {
  const ageFactors = new Map([
    [0xa0, 3],
    [0xa1, 5],
    [0xa2, 3],
    [0xa3, 2],
  ]);
  const id = stateView(record).getUint16(6, true);
  const healthClass = record[8] >> 6;
  const ageValue =
    stateView(record).getUint16(10, true) * (ageFactors.get(id) || 0);
  return Math.floor((definition.price + ageValue) / (1 << (3 - healthClass)));
}

function drawHeldLivestockInfo() {
  if (!heldLivestockInfo) return;
  const record = objectRecord(heldLivestockInfo.slot);
  if (!record) return;
  const view = stateView(record);
  if ((view.getUint16(2, true) & 0x20) === 0) return;
  const definition = itemDefinitionForKeyAndId(
    "livestock",
    view.getUint16(6, true),
  );
  if (!definition) return;
  const windowX = heldLivestockInfo.pointerX >= WIDTH / 2 ? 32 : 320;
  const windowY = heldLivestockInfo.pointerY >= HEIGHT / 2 ? 32 : 240;
  context.drawImage(images.examine, windowX, windowY);
  const portrait =
    definition.artIndex + ((view.getUint16(2, true) & 1) !== 0 ? 1 : 0);
  context.drawImage(
    weatherAllTiles(),
    (portrait % 8) * 112,
    Math.floor(portrait / 8) * 64,
    112,
    64,
    windowX + 48,
    windowY + 24,
    112,
    64,
  );
  const name = itemTextLines(definition.textIndex)[0].trim();
  drawText(name, windowX + 24, windowY + 96);
  drawMaskedMapTile(
    livestockInitialTiles.get(definition.id),
    windowX + 32,
    windowY + 112,
  );
  const healthClass = record[8] >> 6;
  drawFieldCropIcon(24 + 3 - healthClass, windowX + 56, windowY + 104);
  drawText(
    `$${livestockCurrentValue(record, definition)}`,
    windowX + 96,
    windowY + 112,
  );
}

function drawHeldMachineInfo() {
  if (!heldMachineInfo) return;
  const record = machineRecord(heldMachineInfo.slot);
  if (!record) return;
  const view = stateView(record);
  if ((view.getUint16(2, true) & 0x20) === 0) return;
  const definition = itemDefinitionForKeyAndId(
    "machine",
    view.getUint16(0, true),
  );
  if (!definition || definition.id === 8) return;
  const windowX = heldMachineInfo.pointerX >= WIDTH / 2 ? 32 : 320;
  const windowY = heldMachineInfo.pointerY >= HEIGHT / 2 ? 32 : 240;
  context.drawImage(images.examine, windowX, windowY);
  context.drawImage(
    weatherAllTiles(),
    (definition.artIndex % 8) * 112,
    Math.floor(definition.artIndex / 8) * 64,
    112,
    64,
    windowX + 48,
    windowY + 24,
    112,
    64,
  );
  const name = itemTextLines(definition.textIndex)[0].trim();
  drawText(name, windowX + 24, windowY + 96);
  drawMaskedMapTile(
    machineOverlayStarts.get(definition.id),
    windowX + 32,
    windowY + 112,
  );
  drawFieldCropIcon(
    24 + 3 - machineConditionClass(record),
    windowX + 56,
    windowY + 104,
  );
  drawText(
    `$${machineCurrentValue(record, definition)}`,
    windowX + 96,
    windowY + 112,
  );
}

function drawHeldStructureInfo() {
  if (!heldStructureInfo) return;
  const record = structureRecord(heldStructureInfo.slot);
  if (!record) return;
  const view = stateView(record);
  if ((view.getUint16(2, true) & 0x20) === 0) return;
  const definition = itemDefinitionForKeyAndId(
    "structure",
    view.getUint16(0, true),
  );
  if (!definition) return;
  const windowX = heldStructureInfo.pointerX >= WIDTH / 2 ? 32 : 320;
  const windowY = heldStructureInfo.pointerY >= HEIGHT / 2 ? 32 : 240;
  context.drawImage(images.examine, windowX, windowY);
  context.drawImage(
    weatherAllTiles(),
    (definition.artIndex % 8) * 112,
    Math.floor(definition.artIndex / 8) * 64,
    112,
    64,
    windowX + 48,
    windowY + 24,
    112,
    64,
  );
  drawText(
    itemTextLines(definition.textIndex)[0].trim(),
    windowX + 24,
    windowY + 96,
  );
  drawText("Damage:", windowX + 24, windowY + 112);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      const storageSlot = column * 3 + row;
      const tile = view.getUint16(10 + storageSlot * 2, true);
      if (tile === 0x00d9) continue;
      const x = windowX + 24 + column * 16;
      const y = windowY + 120 + row * 16;
      if (tile >= 0x350) drawMaskedMapTile(tile, x, y);
      else drawMapTile(tile, x, y);
    }
  }
}

function drawHeldTerrainInfo() {
  if (!heldTerrainInfo) return;
  const windowX = heldTerrainInfo.pointerX >= WIDTH / 2 ? 32 : 320;
  const windowY = heldTerrainInfo.pointerY >= HEIGHT / 2 ? 32 : 240;
  context.drawImage(images.examine, windowX, windowY);
  context.drawImage(
    weatherAllTiles(),
    (heldTerrainInfo.artIndex % 8) * 112,
    Math.floor(heldTerrainInfo.artIndex / 8) * 64,
    112,
    64,
    windowX + 48,
    windowY + 24,
    112,
    64,
  );
  heldTerrainInfo.lines.forEach((line, index) => {
    drawText(line, windowX + 24, windowY + 96 + index * 8);
  });
}

function drawCursor() {
  if (!pointerVisible || pointer.x < -15 || pointer.y < -15) return;
  let cursorIndex = -1;
  if (
    stage === "game" &&
    !activeWindow &&
    !modalNotice &&
    currentMenu === null &&
    pointInsideGameWindow(pointer, editWindowSentinel)
  ) {
    if (selectedPurchaseItem) cursorIndex = 4;
    else if (selectedSprayAction) cursorIndex = 5;
    else if (selectedTool === "Examine") cursorIndex = 2;
    else if (selectedTool === "Move Object")
      cursorIndex = movingMachineSlot === 0 ? 0 : 1;
  }
  // 0416:1d02 draws at raw DS:171b/171d, exactly the same coordinates
  // delivered by the mouse callback. The reference host's (320,240)
  // request actually delivers (312,232); that projection is not a cursor
  // hotspot. Browser coordinates are already raw canvas coordinates.
  const destinationX = Math.round(pointer.x);
  const destinationY = Math.round(pointer.y);
  const left = Math.max(0, destinationX);
  const top = Math.max(0, destinationY);
  const right = Math.min(WIDTH, destinationX + 16);
  const bottom = Math.min(HEIGHT, destinationY + 16);
  if (left >= right || top >= bottom) return;
  let pixels;
  try {
    pixels =
      typeof context.getImageData === "function"
        ? context.getImageData(left, top, right - left, bottom - top)
        : null;
  } catch (_error) {
    pixels = null;
  }
  if (!pixels?.data || typeof context.putImageData !== "function") {
    // Minimal-canvas test doubles do not expose framebuffer pixels. Keep a
    // source-backed fallback for those environments; production canvases
    // always take the native monochrome compositor above.
    const sourceTile = cursorIndex < 0 ? 0 : cursorIndex * 2;
    context.drawImage(
      images.cursors,
      sourceTile * 16,
      0,
      16,
      16,
      destinationX,
      destinationY,
      16,
      16,
    );
    return;
  }
  const shapeRows = cursorIndex < 0 ? null : nativeCursorPairs[cursorIndex][0];
  const whiteRows = cursorIndex < 0 ? null : nativeCursorPairs[cursorIndex][1];
  for (let canvasY = top; canvasY < bottom; canvasY += 1) {
    const sourceY = canvasY - destinationY;
    for (let canvasX = left; canvasX < right; canvasX += 1) {
      const sourceX = canvasX - destinationX;
      let color = null;
      if (cursorIndex < 0) {
        const operation = nativeArrowCursor[sourceY][sourceX];
        if (operation === "x") color = [0, 0, 0];
        else if (operation === "#") color = [255, 255, 255];
      } else if ((shapeRows[sourceY] & (1 << sourceX)) !== 0) {
        color =
          (whiteRows[sourceY] & (1 << sourceX)) !== 0
            ? [255, 255, 255]
            : [0, 0, 0];
      }
      if (!color) continue;
      const offset = ((canvasY - top) * (right - left) + canvasX - left) * 4;
      pixels.data[offset] = color[0];
      pixels.data[offset + 1] = color[1];
      pixels.data[offset + 2] = color[2];
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, left, top);
}

function applyGenericEventDisplaySnapshot() {
  if (!genericEventDisplaySnapshot) return null;
  const live = {
    bytes: farmStateBytes,
    state: { ...state },
    message,
  };
  if (genericEventDisplaySnapshot.bytes)
    farmStateBytes = genericEventDisplaySnapshot.bytes;
  Object.assign(state, genericEventDisplaySnapshot.state);
  message = genericEventDisplaySnapshot.message;
  return live;
}

function restoreGenericEventDisplaySnapshot(live) {
  if (!live) return;
  farmStateBytes = live.bytes;
  Object.assign(state, live.state);
  message = live.message;
}

function render() {
  synchronizePointerGeometry();
  context.imageSmoothingEnabled = false;
  if (!ready) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    return;
  }
  if (stage === "presents") context.drawImage(images.presents, 0, 0);
  else if (stage === "title") context.drawImage(images.title, 0, 0);
  else if (stage === "region") drawRegion();
  else if (stage === "designer") drawDesigner();
  else if (stage === "game") {
    const liveDisplay = applyGenericEventDisplaySnapshot();
    try {
      const mainImage =
        markerIndex === null
          ? images.genericMain
          : images[`main${markerIndex}`];
      context.drawImage(mainImage, 0, 0);
      // Captured startup backgrounds include a cursor at(7,7). Repaint
      // the menu strip from its font, so moving the real cursor leaves no
      // second arrow embedded in File.
      context.fillStyle = "#414141";
      context.fillRect(0, 0, WIDTH, 16);
      for (const menu of menus)
        drawText(menu.name, Math.max(8, menu.x), 4, "white");
      drawControlBar();
      if (editVisible) {
        const editPosition = gameWindowPosition(editWindowSentinel);
        context.fillStyle = "#000000";
        context.fillRect(0, 48, WIDTH, HEIGHT - 48);
        context.drawImage(
          mainImage,
          16,
          48,
          608,
          432,
          editPosition.x,
          editPosition.y,
          608,
          432,
        );
        context.save();
        context.translate(editPosition.x - 16, editPosition.y - 48);
        drawTitleBar(16, 48, 608, "EDIT", activeWindow === null);
        drawEditToolPalette();
        if (shouldDrawDecodedViewport()) drawDecodedViewport();
        drawLocustEvent();
        drawTornadoEvent();
        drawCropDusterFlight();
        drawScrollbars();
        drawToolCost();
        drawMessage();
        context.restore();
      } else {
        context.fillStyle = "#000000";
        context.fillRect(0, 48, WIDTH, HEIGHT - 48);
      }
      drawDateAndFunds();
      drawActiveWindow();
      drawWindowDragOutline();
      drawTownDebugWindow();
      drawHeldLivestockInfo();
      drawHeldMachineInfo();
      drawHeldStructureInfo();
      drawHeldTerrainInfo();
      if (editVisible) {
        const editPosition = gameWindowPosition(editWindowSentinel);
        context.save();
        context.translate(editPosition.x - 16, editPosition.y - 48);
        drawToolPopup();
        context.restore();
      }
      drawHeldContextHelp();
      drawMenu();
    } finally {
      restoreGenericEventDisplaySnapshot(liveDisplay);
    }
  }
  if (selectorButtonHeld && selectorButtonHeld.stage === stage) {
    drawDesignerToggle(...selectorButtonHeld.bevel, true);
  }
  if (stage !== "presents" && activeWindow !== "about") {
    drawMapCellCursorOutline();
    drawCursor();
  }
}
