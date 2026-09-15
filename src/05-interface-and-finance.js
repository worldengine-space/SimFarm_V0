// Window drawing, crop dialogs, banking, evaluation, town budgets, and weather.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function drawDateAndFunds() {
  const displayed =
    townVoteDisplaySnapshot || townEventDisplaySnapshot || state;
  // The freshly painted native header already contains the recessed frames.
  // Clear their interiors only: the date and funds have different baselines
  // (21 and35), and1d75:074c prints funds at464,35, right-aligned to11 cells.
  context.fillStyle = "#c3c3c3";
  context.fillRect(463, 20, 172, 9);
  context.fillRect(463, 35, 172, 9);
  drawText(
    `Week ${displayed.week + 1} of ${months[displayed.month]} ${displayed.year}`,
    464,
    21,
  );
  drawText(String(displayed.funds).padStart(11, " "), 464, 35);
}

function drawMessage() {
  // Overlay 25 clears DS:5694 when the Edit client consumes the pending
  // QMESSAGE repaint. A blank record still clears the dirty flag.
  quickMessageDirty = false;
  if (!message || !state.options.Messages) return;
  context.fillStyle = "#c3c3c3";
  // Preserve the native Edit client's black separator on row79.
  context.fillRect(80, 64, 528, 15);
  //1d75:0acc prints QMESSAGE at Edit origin+(72,18), i.e.(88,66).
  drawText(message.slice(0, 64), 88, 66);
}

function drawToolCost() {
  if (selectedPurchaseItem) {
    const item = selectedPurchaseDefinition();
    if (!item) return;
    context.fillStyle = "#c3c3c3";
    context.fillRect(16, 48, 64, 16);
    drawText(`Costs: ${item.price}`, 16, 52);
    return;
  }
  if (selectedCropSlot !== null) {
    context.fillStyle = "#c3c3c3";
    context.fillRect(16, 48, 64, 16);
    drawText("Costs: 120", 16, 52);
    return;
  }
  const tool = paletteTools.find(
    (candidate) => candidate.name === selectedTool,
  );
  if (!tool || tool.cost === undefined) return;
  context.fillStyle = "#c3c3c3";
  context.fillRect(16, 48, 64, 16);
  drawText(`Costs: ${tool.cost}`, 16, 52);
}

function drawDepressedEditButton(x, y, width = 24, height = 24) {
  // Native generic buttons reverse only their two-pixel bevel; their icon
  // or label does not move. The same painter covers the Edit palette's
  // 24x24 tools and 48x22 Plant/Spray controls, plus Buy's 27x27 categories.
  context.fillStyle = "#828282";
  context.fillRect(x + 1, y + 1, width - 2, 1);
  context.fillRect(x + 1, y + 2, width - 3, 1);
  context.fillRect(x + 1, y + 3, 2, height - 4);
  context.fillRect(x + 1, y + height - 1, 1, 1);
  context.fillStyle = "#ffffff";
  context.fillRect(x + width - 1, y + 2, 1, height - 4);
  context.fillRect(x + width - 2, y + 3, 1, height - 5);
  context.fillRect(x + 3, y + height - 2, width - 3, 1);
  context.fillRect(x + 2, y + height - 1, width - 2, 1);
}

function drawEditToolPalette() {
  // EDITEASY.LZS is the original neutral 48x208 control bitmap. Starting
  // from it avoids baking the authored capture's initial Examine state into
  // every later selection.
  context.drawImage(images.editEasy, 16, 64);
  if (toolPopup === "plant") {
    drawDepressedEditButton(16, 208, 48, 22);
    return;
  }
  if (toolPopup === "spray" || selectedSprayAction) {
    drawDepressedEditButton(16, 230, 48, 22);
    return;
  }
  const tool = paletteTools.find(
    (candidate) => candidate.name === selectedTool,
  );
  if (tool) drawDepressedEditButton(tool.x, tool.y);
}

function drawToolPopup() {
  if (toolPopup === "plant") {
    context.drawImage(images.toolPlantMenu, 0, 0, 224, 160, 64, 112, 224, 160);
  } else if (toolPopup === "spray") {
    context.drawImage(images.toolSprayMenu, 0, 0, 112, 88, 64, 192, 112, 88);
  }
}

function drawHeldContextHelp() {
  if (heldEditHelp) {
    // The native palette control paints EDITHELP.BMP flush with its content
    // origin only for the duration of the mouse press.
    const position = gameWindowPosition(editWindowSentinel);
    context.drawImage(images.editHelp, position.x + 48, position.y + 16);
  } else if (heldMapHelp) {
    const position = gameWindowPosition("map");
    context.drawImage(images.mapHelp, position.x + 72, position.y + 16);
  } else if (heldBankHelp) {
    // Native button case 3 (5242:053a) blits BANKHELP.BMP at the Bank
    // window's outer origin plus (32,120), then waits for mouse release.
    const position = gameWindowPosition("bank");
    context.drawImage(images.bankHelp, position.x + 32, position.y + 120);
  }
}

function drawMenu() {
  if (currentMenu === null) return;
  const menu = menus[currentMenu];
  const height = menu.dropHeight;
  context.fillStyle = "#ffffff";
  context.fillRect(menu.dropX, 16, menu.dropWidth, height);
  context.strokeStyle = "#000000";
  context.strokeRect(menu.dropX, 16, menu.dropWidth - 1, height - 1);
  for (let index = 0; index < menu.items.length; index += 1) {
    const y = 16 + index * 12;
    const selected = menuHover === index;
    if (selected) {
      context.fillStyle = "#000000";
      context.fillRect(menu.dropX + 1, y, menu.dropWidth - 2, 12);
    }
    let checked = false;
    if (menu.name === "Options") checked = state.options[menu.items[index]];
    if (menu.name === "Speed") checked = state.speed === menu.items[index];
    if (menu.name === "Disasters" && menu.items[index] === "Disable")
      checked = state.disastersDisabled;
    if (checked)
      drawCheck(menu.dropX + 2, y + 2, selected ? "#ffffff" : "#000000");
    drawText(
      menu.items[index],
      menu.dropX + 8,
      y + 2,
      selected ? "white" : "black",
    );
  }
}

function drawCheck(x, y, color) {
  // The native menu primitive is a 14-pixel raster, not an antialiased
  // canvas path. Coordinates are relative to the historical x+2/y+2 call.
  context.fillStyle = color;
  for (const [dx, dy, width] of [
    [5, 3, 1],
    [4, 4, 2],
    [-1, 5, 1],
    [3, 5, 2],
    [-1, 6, 2],
    [2, 6, 2],
    [0, 7, 3],
    [1, 8, 1],
  ])
    context.fillRect(x + dx, y + dy, width, 1);
}

function drawTitleBar(x, y, width, title, active = true) {
  const tileSheet = weatherTileSheet();
  const middleTile = active ? 1 : 118;
  const rightTile = active ? 2 : 119;
  context.drawImage(tileSheet, 0, 0, 16, 16, x, y, 16, 16);
  for (let offset = 16; offset < width - 16; offset += 16) {
    context.drawImage(
      tileSheet,
      (middleTile % 20) * 16,
      Math.floor(middleTile / 20) * 16,
      16,
      16,
      x + offset,
      y,
      16,
      16,
    );
  }
  context.drawImage(
    tileSheet,
    (rightTile % 20) * 16,
    Math.floor(rightTile / 20) * 16,
    16,
    16,
    x + width - 16,
    y,
    16,
    16,
  );
  // The native helper centers the middle glyph for odd-length titles and
  // the gap between the two middle glyphs for even-length titles.
  const titleX = x + Math.floor(width / 2) - Math.floor(title.length / 2) * 8;
  drawText(title, Math.max(x + 16, titleX), y + 4, "white");
}

function drawStandardWindow(definition) {
  const image = images[definition.image];
  if (definition.composite) {
    context.drawImage(image, definition.x, definition.y);
    return;
  }
  drawTitleBar(definition.x, definition.y, image.width, definition.title);
  context.drawImage(image, definition.x, definition.y + 16);
}

function drawAboutWindow() {
  const definition = windowDefinitions.about;
  drawTitleBar(
    definition.x,
    definition.y,
    images.about.width,
    definition.title,
  );
  context.drawImage(images.about, definition.x, definition.y + 16);
  if (aboutCreditsPhase === "opening") {
    context.drawImage(images.lizardLogo, 360, 176);
    [
      "    Concept",
      "  Programming",
      "      And",
      "    Design",
      "      By",
      "  Eric Albers",
      "Leaping Lizard",
      "   Software",
    ].forEach((line, index) => drawText(line, 240, 184 + index * 9));
  } else {
    aboutCreditPage().lines.forEach((line, index) => {
      drawText(line, 240, 184 + index * 8);
    });
  }
  drawText("Eric Albers", 256, 312);
}

function aboutCreditPage(line = aboutCreditsLine) {
  const credits = originalText?.credits || [];
  const lines = [];
  let final = false;
  for (let index = 0; index < aboutCreditLinesPerPage; index += 1) {
    const value = credits[line + index] ?? "`";
    if (value.startsWith("`")) {
      final = true;
      break;
    }
    lines.push(value);
  }
  return { lines, final };
}

function resetAboutCredits(now = Date.now()) {
  aboutCreditsPhase = "opening";
  aboutCreditsLine = 0;
  aboutCreditsLastTick = biosClockTick(now);
}

function advanceAboutCredits(now = Date.now()) {
  if (activeWindow !== "about") return false;
  const tick = biosClockTick(now);
  const elapsed = (tick - aboutCreditsLastTick) & 0xffff;
  if (aboutCreditsPhase === "opening") {
    if (elapsed < aboutOpeningDurationTicks) return false;
    aboutCreditsPhase = "page";
    aboutCreditsLine = 0;
    aboutCreditsLastTick = tick;
    return true;
  }
  if (elapsed < aboutPageDurationTicks) return false;
  if (aboutCreditPage().final) {
    aboutCreditsPhase = "opening";
    aboutCreditsLine = 0;
  } else {
    const nextLine = aboutCreditsLine + aboutCreditLinesPerPage;
    const next = aboutCreditPage(nextLine);
    if (next.final && next.lines.length === 0) {
      aboutCreditsPhase = "opening";
      aboutCreditsLine = 0;
    } else {
      aboutCreditsLine = nextLine;
    }
  }
  aboutCreditsLastTick = tick;
  return true;
}

function cropCatalogEntry(index = loadCropFileIndex) {
  return cropData.crops[index] || null;
}

function cropCatalogKey(entry) {
  return entry?.file?.replace(/\.crp$/i, "").toLowerCase() || "";
}

function cropCatalogDisplayName(entry) {
  return entry?.name || cropMarketDisplayNames.get(cropCatalogKey(entry)) || "";
}

function drawLoadCropScrollbarThumb() {
  const maximum = Math.max(0, cropData.crops.length - 16);
  const thumbY =
    176 + (maximum === 0 ? 0 : Math.round((loadCropScroll * 80) / maximum));
  context.fillStyle = "#000000";
  context.fillRect(448, thumbY, 16, 16);
  context.fillStyle = "#c3c3c3";
  context.fillRect(449, thumbY + 1, 14, 14);
  context.fillStyle = "#ffffff";
  context.fillRect(449, thumbY + 1, 13, 1);
  context.fillRect(449, thumbY + 2, 12, 1);
  context.fillRect(449, thumbY + 3, 2, 10);
  context.fillRect(449, thumbY + 13, 1, 1);
  context.fillStyle = "#828282";
  context.fillRect(462, thumbY + 2, 1, 1);
  context.fillRect(461, thumbY + 3, 2, 10);
  context.fillRect(451, thumbY + 13, 12, 1);
  context.fillRect(450, thumbY + 14, 13, 1);
}

function drawLoadCropWindow() {
  const windowX = 160;
  const windowY = 96;
  drawTitleBar(windowX, windowY, 320, "LOAD CROP");
  context.drawImage(images.chooseCrop, windowX, windowY + 16);
  drawText(
    cropMarketDisplayNames.get(cropSlotName(loadCropSlot)) || "",
    176,
    136,
  );
  const selectedFile = cropCatalogEntry();
  drawText(selectedFile?.file?.toUpperCase() || "", 320, 136);
  for (let slot = 0; slot < 16; slot += 1) {
    drawFieldCropIcon(
      slot,
      176 + (slot & 3) * 32,
      160 + Math.floor(slot / 4) * 32,
    );
  }
  const selectedIconX = 176 + (loadCropSlot & 3) * 32;
  const selectedIconY = 160 + Math.floor(loadCropSlot / 4) * 32;
  context.fillStyle = "#fff304";
  context.fillRect(selectedIconX, selectedIconY, 32, 1);
  context.fillRect(selectedIconX, selectedIconY + 31, 32, 1);
  context.fillRect(selectedIconX, selectedIconY + 1, 1, 30);
  context.fillRect(selectedIconX + 31, selectedIconY + 1, 1, 30);
  const selectedRow = loadCropFileIndex - loadCropScroll;
  if (selectedRow >= 0 && selectedRow < 16) {
    context.fillStyle = "#c30404";
    context.fillRect(320, 160 + selectedRow * 8, 96, 8);
  }
  for (let row = 0; row < 16; row += 1) {
    const index = loadCropScroll + row;
    const entry = cropCatalogEntry(index);
    if (!entry) break;
    drawText(
      cropCatalogDisplayName(entry).slice(0, 16),
      320,
      160 + row * 8,
      index === loadCropFileIndex ? "white" : "black",
    );
  }
  drawLoadCropScrollbarThumb();
}

function drawLoadCropNotice() {
  context.drawImage(images.popup, 192, 150);
  genericEventLines(43).forEach((line, index) =>
    drawText(line, 216, 246 + index * 8),
  );
  context.drawImage(images.buttons, 0, 0, 48, 24, 296, 306, 48, 24);
}

function drawSaveGameWindow() {
  drawTitleBar(160, 96, 208, "SAVE GAME");
  context.drawImage(images.filegenr, 160, 112);
  context.fillStyle = "#c3c3c3";
  context.fillRect(184, 136, 96, 8);
  drawText(saveDialogName.slice(0, 8), 184, 136);
  context.drawImage(images.buttons, 12 * 48, 0, 48, 24, 304, 136, 48, 24);
  context.drawImage(images.buttons, 15 * 48, 0, 48, 24, 304, 168, 48, 24);
}

function drawQuitSaveNotice() {
  context.drawImage(images.popup, 192, 150);
  ["Would you like to save your", "game before exiting", "SimFarm?"].forEach(
    (line, index) => drawText(line, 216, 246 + index * 8),
  );
  context.drawImage(images.buttons, 10 * 48, 0, 48, 24, 232, 306, 48, 24);
  context.drawImage(images.buttons, 3 * 48, 0, 48, 24, 296, 306, 48, 24);
  context.drawImage(images.buttons, 11 * 48, 0, 48, 24, 360, 306, 48, 24);
}

function drawNewGameConfirmation() {
  // File > New Game requests EVENTS.DAT record 45, not Quit's save prompt.
  // The user must CANCEL and save separately before abandoning this farm.
  context.drawImage(images.popup, 192, 150);
  context.drawImage(weatherAllTiles(), 224, 576, 112, 64, 264, 174, 112, 64);
  genericEventLines(45).forEach((line, index) =>
    drawText(line, 216, 246 + index * 8),
  );
  context.drawImage(images.buttons, 3 * 48, 0, 48, 24, 232, 306, 48, 24);
  context.drawImage(images.buttons, 10 * 48, 0, 48, 24, 360, 306, 48, 24);
  context.fillStyle = "#828282";
  for (const x of [232, 360]) {
    context.fillRect(x + 48, 308, 1, 22);
    context.fillRect(x + 2, 330, 47, 1);
  }
}

function drawSaveSuccessNotice() {
  context.drawImage(images.popup, 192, 150);
  drawText("Game saved successfully as", 216, 246);
  drawText(`${saveDialogSavedName.toLowerCase()}.`, 216, 254);
  context.drawImage(images.buttons, 0, 0, 48, 24, 296, 306, 48, 24);
}

function drawDebugCommandNotice() {
  let artIndex;
  let lines;
  if (modalNotice === "debug-llama") {
    artIndex = 0x19;
    lines = ['"The Llama is a quadruped"', "- Will Wright"];
  } else if (modalNotice === "debug-fund") {
    artIndex = 0x4b;
    lines = [
      "You just donated $10000 to",
      "the town. The mayor and his",
      "new car thank you!",
    ];
  } else {
    return false;
  }
  context.drawImage(images.popup, 192, 150);
  context.drawImage(
    weatherAllTiles(),
    (artIndex % 8) * 112,
    Math.floor(artIndex / 8) * 64,
    112,
    64,
    264,
    175,
    112,
    64,
  );
  lines.forEach((line, index) => drawText(line, 216, 246 + index * 8));
  context.drawImage(images.buttons, 0, 0, 48, 24, 296, 306, 48, 24);
  return true;
}

function drawHomesteadNotice() {
  const upgrade = modalNotice === "homestead-upgrade";
  const downgrade = modalNotice === "homestead-downgrade";
  if (!upgrade && !downgrade) return false;
  context.drawImage(images.popup, 192, 150);
  const artIndex = upgrade ? 0x4b : 0x4a;
  context.drawImage(
    weatherAllTiles(),
    (artIndex % 8) * 112,
    Math.floor(artIndex / 8) * 64,
    112,
    64,
    264,
    174,
    112,
    64,
  );
  const lines = upgrade
    ? [
        "You are doing VERY",
        "well! Your cash on",
        "hand is very high.",
        "Home improvements are",
        "under way!",
      ]
    : [
        "Your cash on hand is",
        "dropping rapidly! Home",
        "improvements are going to",
        "have to wait!",
      ];
  const textX = upgrade ? 208 : 216;
  lines.forEach((line, index) => drawText(line, textX, 246 + index * 8));
  if (upgrade && homesteadNoticeAnimation) {
    const { variant, sequenceIndex } = homesteadNoticeAnimation;
    const frameIndex = homesteadCowmanSequences[variant][sequenceIndex];
    context.drawImage(
      images[`cowman${variant}`],
      frameIndex * 65,
      0,
      64,
      88,
      376,
      182,
      64,
      88,
    );
  }
  context.drawImage(images.buttons, 0, 0, 48, 24, 296, 306, 48, 24);
  // FUN_0636_0e6a adds the widget's exterior dark right/bottom bevel beyond
  // the 48x24 BUTTONS.TIL bitmap.
  context.fillStyle = "#828282";
  context.fillRect(344, 308, 1, 22);
  context.fillRect(298, 330, 47, 1);
  return true;
}

function genericEventArtIndex(record) {
  if ([2, 6, 7, 10, 15, 17, 31, 32, 35, 36, 39, 50, 52, 53].includes(record)) {
    return 0x4c;
  }
  if ([22, 23, 29, 37, 40, 42].includes(record)) return 0x4b;
  return 0x4a;
}

function genericEventLines(record) {
  const start = record * 8;
  // EVENTS.DAT stores eight padded 30-column source rows, but the dialog
  // feeds them to a 27-column word-wrapping text widget. Ordinary row ends
  // are spaces rather than hard breaks. A tilde forces a break (used after
  // warning headings), and backticks are indentation spaces that survive
  // the widget's ordinary leading-whitespace trim.
  const stream = originalText.events
    .slice(start, start + 8)
    .map((line) => line.trim())
    .join(" ");
  const lines = [];
  for (const rawSegment of stream.split("~")) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    const indent = segment.match(/^`+/)?.[0].length || 0;
    const words = segment.replace(/`/g, " ").trim().split(/\s+/);
    let line = " ".repeat(indent);
    for (const word of words) {
      if (line.trim().length === 0) {
        line += word;
      } else if (line.length + 1 + word.length <= 27) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line.trim()) lines.push(line);
  }
  return lines;
}

function drawGenericEventNotice() {
  if (modalNotice !== "event-card" || genericEventRecord === null) return false;
  const artIndex = genericEventArtIndex(genericEventRecord);
  // The stadium-capacity result (record 60) is the one native switch-table
  // case whose card is raised by 32 pixels. All of its child coordinates
  // move with the popup.
  const originY = genericEventRecord === 60 ? 118 : 150;
  context.drawImage(images.popup, 192, originY);
  context.drawImage(
    weatherAllTiles(),
    (artIndex % 8) * 112,
    Math.floor(artIndex / 8) * 64,
    112,
    64,
    264,
    originY + 24,
    112,
    64,
  );
  genericEventLines(genericEventRecord).forEach((line, index) => {
    drawText(line, 216, originY + 96 + index * 8);
  });
  context.drawImage(images.buttons, 0, 0, 48, 24, 296, originY + 156, 48, 24);
  return true;
}

function expertCardRecord(number = expertCard) {
  return helpData.cards.find((card) => card.number === number) || null;
}

function expertCropRecord(slot) {
  const name = cropSlotName(slot);
  if (!name) return null;
  return (
    cropData.crops.find((crop) => crop.file.toLowerCase() === `${name}.crp`) ||
    null
  );
}

function wrappedExpertLines(value, pixelWidth) {
  // The native text command reserves one glyph cell at the right edge.
  // Tildes in livestock cards are hard line breaks; ordinary prose wraps
  // only at spaces.
  const maximum = Math.max(1, Math.floor(pixelWidth / 8) - 1);
  const lines = [];
  for (const explicitLine of value.replace(/\r?\n/g, "~").split("~")) {
    if (explicitLine.length === 0) {
      lines.push("");
      continue;
    }
    const words = explicitLine.trim().split(/\s+/);
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maximum) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function expertCropDetailLines(crop) {
  // CRP detailed help uses one or more '@' bytes as a single alignment
  // delimiter before CR/LF. Extraction preserves those bytes as spaces, so
  // fold each resulting run back to the one glyph cell painted by opcode
  // 0x89 without disturbing line breaks.
  return crop.detailHelp.split(/\r?\n/).map((line) => line.replace(/ +/g, " "));
}

function drawExpertItem(index, x, y) {
  // HC command 0x86 addresses the fixed ALLTILES BTL library. Crop CRP
  // graphics are a separate 42-tile field sheet and are not illustrations.
  context.drawImage(
    weatherAllTiles(),
    (index % 8) * 112,
    Math.floor(index / 8) * 64,
    112,
    64,
    x,
    y,
    112,
    64,
  );
}

function drawExpertMainTiles(start, columns, rows, x, y) {
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tile = start + row * columns + column;
      // HC opcode 0x8c enters the ordinary main-tile dispatcher. This is
      // significant for Card 2's slots 539..542: the crop loader replaces
      // those four EGA placeholders with the live slot-zero CRP quadrants.
      drawMapTile(tile, x + column * 16, y + row * 16);
    }
  }
}

function drawExpertButton(tile, x, y) {
  context.drawImage(images.buttons, tile * 48, 0, 48, 24, x, y, 48, 24);
  // FUN_0636_0e6a adds this exterior right/bottom bevel beyond BUTTONS.TIL.
  context.fillStyle = "#828282";
  context.fillRect(x + 48, y + 2, 1, 22);
  context.fillRect(x + 2, y + 24, 47, 1);
}

function drawExpertWindow() {
  const definition = windowDefinitions.expert;
  const card = expertCardRecord();
  drawTitleBar(definition.x, definition.y, 400, "FARM EXPERT");
  context.drawImage(images.expert, definition.x, definition.y + 16);
  // The native client setup clears FARMBURO's inner-left guide pixel before
  // the HC stream paints. Its decorative bottom frame begins at row 216.
  context.fillStyle = "#c3c3c3";
  context.fillRect(definition.x + 8, definition.y + 16, 1, 216);
  if (!card) return;
  for (const command of card.commands) {
    const args = command.arguments || [];
    if (command.name === "itemArt") {
      drawExpertItem(args[0], definition.x + args[1], definition.y + args[2]);
    } else if (command.name === "cardButton") {
      drawExpertButton(args[2], definition.x + args[0], definition.y + args[1]);
    } else if (command.name === "closeButton") {
      drawExpertButton(15, definition.x + args[0], definition.y + args[1]);
    } else if (command.name === "text") {
      wrappedExpertLines(command.value, args[2]).forEach((line, lineIndex) => {
        // Native opcode 0x87 reserves its leading eight-pixel text inset.
        drawText(
          line,
          definition.x + args[0] + 8,
          definition.y + args[1] + lineIndex * 8,
        );
      });
    } else if (command.name === "cropDetail") {
      const crop = expertCropRecord(args[0]);
      if (crop) {
        expertCropDetailLines(crop).forEach((line, lineIndex) => {
          drawText(
            line,
            definition.x + args[1] + 8,
            definition.y + args[2] + lineIndex * 8,
          );
        });
      }
    } else if (command.name === "mainTiles") {
      drawExpertMainTiles(
        args[4],
        args[2],
        args[3],
        definition.x + args[0],
        definition.y + args[1],
      );
    }
  }
}

function handleExpertClick(point) {
  const definition = windowDefinitions.expert;
  const card = expertCardRecord();
  if (!card) {
    if (inside(point, ...definition.close)) closeActiveWindow();
    return;
  }
  for (const command of card.commands) {
    const args = command.arguments || [];
    if (
      command.name === "cardHotspot" &&
      inside(
        point,
        definition.x + args[0],
        definition.y + args[1],
        args[2] - args[0],
        args[3] - args[1],
      )
    ) {
      expertCard = args[4];
      play();
      return;
    }
    if (
      command.name === "cardButton" &&
      inside(point, definition.x + args[0], definition.y + args[1], 48, 24)
    ) {
      expertCard = args[3];
      play();
      return;
    }
    if (
      command.name === "closeButton" &&
      inside(point, definition.x + args[0], definition.y + args[1], 48, 24)
    ) {
      closeActiveWindow();
      play();
      return;
    }
    if (
      command.name === "soundHotspot" &&
      inside(
        point,
        definition.x + args[0],
        definition.y + args[1],
        args[2] - args[0],
        args[3] - args[1],
      )
    ) {
      play(command.value.toLowerCase().replace(/\.voc$/, ""));
      return;
    }
  }
}

function computeBankCreditLimit() {
  if (!farmStateBytes || !saveData) {
    state.bankCreditLimit = Math.max(0, state.bankCreditLimit ?? 48432);
    return state.bankCreditLimit;
  }
  const format = saveData.format;
  const view = stateView(farmStateBytes);
  // The additional value selected by the segmented native routine is the
  // structure-collateral accumulator, not a similarly addressed cash-flow
  // field in the serialized finance segment. Scenario 2 proves
  // their opening contribution is zero: its owned-land sum is $475,404 and
  // the original reports exactly floor($475,404 / 3) = $158,468 credit.
  let securedValue = state.bankStructureCollateral ?? 0;
  for (let x = 0; x < format.parcelGridWidth; x += 1) {
    for (let y = 0; y < format.parcelGridHeight; y += 1) {
      if (parcelStatus(x, y) === 1) securedValue += parcelLandValue(x, y);
    }
  }
  const grossCredit = Math.floor(securedValue / 3);
  state.bankCreditLimit =
    state.bankDebt >= grossCredit ? 0 : grossCredit - state.bankDebt;
  view.setUint32(format.bankCreditLimitOffset, state.bankCreditLimit, true);
  return state.bankCreditLimit;
}

function bankLoanPayment(amount, term = 5, interest = state.bankInterestRate) {
  if (amount === 0) return 0;
  const payment = Math.floor(
    (amount + Math.floor((amount * interest) / 100)) / (term * 4),
  );
  return Math.max(1, payment);
}

function appendBankDigit(digit, keypadZero = false) {
  // The native bank keyboard callback plays COMPBEEP before applying any
  // clipping, including for a digit that leaves the displayed value intact.
  play("compbeep");
  const available = computeBankCreditLimit();
  let next = bankLoanInput * 10 + digit;
  if (next > available) next = available;
  const cashRoom = Math.max(0, 9999999 - state.funds);
  if (next > cashRoom) {
    // The keypad's zero control uses the original's six-digit typo only
    // in this overflow branch; keyboard entry and every other key use the
    // intended seven-digit ceiling.
    next = keypadZero ? Math.max(0, 999999 - state.funds) : cashRoom;
  }
  bankLoanInput = next;
}

function clearBankLoanInput() {
  play("compbeep");
  bankLoanInput = 0;
}

function commitBankLoan() {
  play("compbeep");
  const amount = bankLoanInput;
  if (amount === 0) {
    closeActiveWindow();
    return;
  }
  state.funds += amount;
  state.bankDebt += amount;
  state.bankCreditLimit = Math.max(0, state.bankCreditLimit - amount);
  state.bankQuarterlyPayment += bankLoanPayment(amount);
  bankLoanInput = 0;
  if (farmStateBytes) writeDateAndFunds(farmStateBytes);
  computeBankCreditLimit();
}

function repayBankLoan() {
  // The original bank choice control uses the same dedicated terminal beep.
  play("compbeep");
  const amount = state.bankDebt;
  if (state.funds < amount) {
    message = "Warning! Not enough money to pay LOAN!";
    return;
  }
  state.funds -= amount;
  state.bankDebt = 0;
  state.bankQuarterlyPayment = 0;
  state.townReserve += Math.floor(amount / 2);
  bankLoanInput = 0;
  if (farmStateBytes) {
    const view = stateView(farmStateBytes);
    const format = saveData.format;
    const expense = view.getUint32(format.bankRepaymentExpenseOffset, true);
    view.setUint32(format.bankRepaymentExpenseOffset, expense + amount, true);
    const townShare = view.getUint32(format.bankTownQuarterShareOffset, true);
    view.setUint32(
      format.bankTownQuarterShareOffset,
      townShare + Math.floor(amount / 4),
      true,
    );
    writeDateAndFunds(farmStateBytes);
  }
  computeBankCreditLimit();
}

function processBankQuarterlyPayment() {
  const amount = state.bankQuarterlyPayment;
  if (amount === 0) return true;
  if (state.funds < amount) {
    // Native FUN_19ab_089a arms a four-month retry/foreclosure countdown
    // and retains the missed payment amount when the common charge helper
    // cannot collect the complete installment.
    state.bankDefaultCountdown = 4;
    state.bankMissedPayment = amount;
    state.bankLastNotice = "bank-payment-warning";
    message = "Not enough money to pay bank loan!";
    requestGenericEvent(0xa6);
    return false;
  }

  state.funds -= amount;
  state.bankDebt = amount < state.bankDebt ? state.bankDebt - amount : 0;
  state.townReserve += Math.floor(amount / 2);
  if (farmStateBytes) {
    const view = stateView(farmStateBytes);
    const format = saveData.format;
    view.setUint32(
      format.bankRepaymentExpenseOffset,
      view.getUint32(format.bankRepaymentExpenseOffset, true) + amount,
      true,
    );
    view.setUint32(
      format.bankTownQuarterShareOffset,
      view.getUint32(format.bankTownQuarterShareOffset, true) +
        Math.floor(amount / 4),
      true,
    );
  }
  if (state.bankDebt === 0) state.bankQuarterlyPayment = 0;
  state.bankCreditLimit += amount;
  state.bankDefaultCountdown = 0;
  state.bankMissedPayment = 0;
  if (farmStateBytes) writeDateAndFunds(farmStateBytes);
  return true;
}

function collectOutstandingPayment(amount, expenseOffset) {
  if (amount === 0 || state.funds < amount) {
    setQuickMessage(0x2a);
    return false;
  }
  state.funds -= amount;
  if (farmStateBytes && expenseOffset !== null) {
    const view = stateView(farmStateBytes);
    view.setUint32(
      expenseOffset,
      view.getUint32(expenseOffset, true) + amount,
      true,
    );
    writeDateAndFunds(farmStateBytes);
  }
  return true;
}

function collectMissedBankPayment(expenseOffset) {
  return collectOutstandingPayment(state.bankMissedPayment, expenseOffset);
}

function captureFinanceEventDisplay(messageAtEntry = message) {
  genericEventDisplaySnapshot = {
    bytes: farmStateBytes ? farmStateBytes.slice() : null,
    state: {
      ...state,
      options: { ...state.options },
      weatherDays: [...state.weatherDays],
      nextWeatherDays: [...state.nextWeatherDays],
    },
    message: messageAtEntry,
  };
  genericEventDisplayReleaseRecord = null;
}

function clearGenericEventDisplaySnapshot() {
  genericEventDisplaySnapshot = null;
  genericEventDisplayReleaseRecord = null;
}

function forcedAssetAuction(amount) {
  const collect = () =>
    collectOutstandingPayment(
      amount,
      saveData.format.machinePurchaseExpenseOffset2,
    );

  // FUN_2a66_0f06 walks these three record tables in slot order. Stored
  // crops precede livestock, livestock precedes machinery, and machinery
  // marked with bit 0x40 is not eligible for the auction.
  for (let slot = 1; slot < saveData.format.storageLotRecordCount; slot += 1) {
    const record = storageLotRecord(slot);
    const id = stateView(record).getUint16(0, true);
    if ((record[10] & 0x20) === 0 || id < 0xa8 || id > 0xbf) continue;
    const definition = itemDefinitionForKeyAndId("stored-crop", id);
    if (!definition) continue;
    sellInventoryEntry({
      categoryKey: "stored-crop",
      slot,
      record,
      definition,
      price: storedCropSalePrice(record),
    });
    if (collect()) return true;
  }

  for (let slot = 1; slot < saveData.format.objectRecordCount; slot += 1) {
    const record = objectRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    const definition = itemDefinitionForKeyAndId(
      "livestock",
      view.getUint16(6, true),
    );
    if (!definition) continue;
    sellInventoryEntry({
      categoryKey: "livestock",
      slot,
      record,
      definition,
      price: livestockCurrentValue(record, definition),
    });
    if (collect()) return true;
  }

  for (let slot = 1; slot < saveData.format.machineRecordCount; slot += 1) {
    const record = machineRecord(slot);
    const view = stateView(record);
    const status = view.getUint16(2, true);
    if ((status & 0x20) === 0 || (status & 0x40) !== 0) continue;
    const definition = itemDefinitionForKeyAndId(
      "machine",
      view.getUint16(0, true),
    );
    if (!definition) continue;
    sellInventoryEntry({
      categoryKey: "machine",
      slot,
      record,
      definition,
      price: machineCurrentValue(record, definition),
    });
    if (collect()) return true;
  }

  // 2a66:11d4 plays EXPLODE exactly once when forced liquidation exhausts
  // crops, livestock, and machinery and falls through to land. Structure
  // removal during each parcel sale can layer its own EXPLODE calls.
  play("explode");
  const view = stateView(farmStateBytes);
  const protectedX = view.getUint16(
    saveData.format.startupCoordinateReducedXOffset,
    true,
  );
  const protectedY = view.getUint16(
    saveData.format.startupCoordinateReducedYOffset,
    true,
  );
  for (
    let parcelX = 0;
    parcelX < saveData.format.parcelGridWidth;
    parcelX += 1
  ) {
    for (
      let parcelY = 0;
      parcelY < saveData.format.parcelGridHeight;
      parcelY += 1
    ) {
      if (
        parcelStatus(parcelX, parcelY) !== 1 ||
        (parcelX === protectedX && parcelY === protectedY)
      )
        continue;
      clearParcelStructures(parcelX, parcelY);
      // FUN_4753_1e22 receives a false taxable-sale flag from the forced
      // auction, even though ordinary player land sales are taxable.
      sellParcel(parcelX, parcelY, false);
      if (collect()) return true;
    }
  }

  state.bankruptcyState = 2;
  return false;
}

function completeBankForeclosureAuction() {
  pendingFinanceAuction = null;
  const paid = forcedAssetAuction(state.bankMissedPayment);
  if (paid) {
    state.bankDefaultCountdown = 0;
    state.bankMissedPayment = 0;
    state.bankLastNotice = "bank-foreclosure-paid";
    message = "The bank sold enough assets to pay the missed installment.";
    requestGenericEvent(0xa8);
    genericEventDisplayReleaseRecord = 40;
    return true;
  }
  pendingBankruptcySource = "bank";
  bankruptcyPromptArmed = true;
  return false;
}

function bankForeclosureAuction(messageAtEntry) {
  // The common forced-sale wrapper receives ordinary record 39. Its opening
  // card is Messages-gated and blocks before liquidation. The successful
  // record-40 follow-up is forced by the monthly caller and is painted over
  // the same pre-auction background.
  captureFinanceEventDisplay(messageAtEntry);
  const foreclosureShown = requestGenericEvent(39);
  if (foreclosureShown) {
    pendingFinanceAuction = "bank";
    return false;
  }
  return completeBankForeclosureAuction();
}

function answerBankruptcyPrompt(startNewGame) {
  if (modalNotice !== "bankruptcy-question" || !pendingBankruptcySource)
    return false;
  const source = pendingBankruptcySource;
  pendingBankruptcySource = null;
  bankruptcyPromptArmed = false;
  state.bankruptcyState = 0;
  if (startNewGame) {
    modalNotice = null;
    queuedModalNotice = null;
    pendingFinanceAuction = null;
    pendingMonthBoundary = null;
    clearGenericEventDisplaySnapshot();
    clearGameWindows();
    currentMenu = null;
    enterNewGameRegion();
    message = "";
    return true;
  }

  // Choosing NO is an original quirk: the caller treats the rejected new
  // game as a successful forced sale, clears the delinquency, and opens the
  // normal paid-in-full notice even though liquidation was insufficient.
  if (source === "bank") {
    state.bankDefaultCountdown = 0;
    state.bankMissedPayment = 0;
    state.bankLastNotice = "bank-foreclosure-paid";
    modalNotice = null;
    requestGenericEvent(0xa8);
    genericEventDisplayReleaseRecord = 40;
  } else {
    state.propertyTaxCountdown = 0;
    state.propertyTaxDue = 0;
    state.propertyTaxLastNotice = "property-tax-auction-paid";
    modalNotice = null;
    message = "The Tax Board sold enough assets to pay the overdue taxes.";
    requestGenericEvent(0xa5);
    genericEventDisplayReleaseRecord = 37;
  }
  return true;
}

function processBankMonthlyDefault() {
  if (state.bankDefaultCountdown === 0 || state.bankMissedPayment === 0)
    return false;
  const messageAtEntry = message;
  if (collectMissedBankPayment(saveData.format.bankRepaymentExpenseOffset)) {
    state.bankDefaultCountdown = 0;
    state.bankMissedPayment = 0;
    state.bankLastNotice = "bank-late-payment-paid";
    message = "Bank loan payment made.";
    requestGenericEvent(0xaa);
    return true;
  }

  state.bankDefaultCountdown -= 1;
  if (state.bankDefaultCountdown !== 0) {
    state.bankLastNotice = "bank-payment-overdue";
    requestGenericEvent(0xa9);
    return false;
  }

  state.bankLastNotice = "bank-foreclosure";
  return bankForeclosureAuction(messageAtEntry);
}

function totalOwnedParcelValue() {
  if (!farmStateBytes || !saveData) return 0;
  let total = 0;
  for (
    let parcelX = 0;
    parcelX < saveData.format.parcelGridWidth;
    parcelX += 1
  ) {
    for (
      let parcelY = 0;
      parcelY < saveData.format.parcelGridHeight;
      parcelY += 1
    ) {
      if (parcelStatus(parcelX, parcelY) === 1) {
        total += parcelLandValue(parcelX, parcelY);
      }
    }
  }
  return total;
}

function estimatedPropertyTax() {
  const divisor = state.funds < 150000 ? 10 : state.funds < 500000 ? 5 : 3;
  return (
    Math.floor(state.taxableSaleIncome / divisor) +
    state.propertyTaxDue +
    Math.floor(totalOwnedParcelValue() / 99)
  );
}

function countParcelsWithStatus(status) {
  if (!farmStateBytes || !saveData) return 0;
  let total = 0;
  for (
    let parcelX = 0;
    parcelX < saveData.format.parcelGridWidth;
    parcelX += 1
  ) {
    for (
      let parcelY = 0;
      parcelY < saveData.format.parcelGridHeight;
      parcelY += 1
    ) {
      if (parcelStatus(parcelX, parcelY) === status) total += 1;
    }
  }
  return total;
}

function totalMachineryAssetValue() {
  if (!farmStateBytes || !saveData) return 0;
  let total = 0;
  const liveCount = stateView(farmStateBytes).getUint16(
    saveData.format.machineCountOffset,
    true,
  );
  let activeSeen = 0;
  for (
    let slot = 1;
    slot < saveData.format.machineRecordCount && activeSeen < liveCount;
    slot += 1
  ) {
    const record = machineRecord(slot);
    const view = stateView(record);
    const status = view.getUint16(2, true);
    if ((status & 0x20) === 0) continue;
    activeSeen += 1;
    // Leased machinery remains visible and usable but is not a farm asset.
    if ((status & 0x40) !== 0) continue;
    const definition = itemDefinitionForKeyAndId(
      "machine",
      view.getUint16(0, true),
    );
    // Balance/Productivity helper 1d5f:2222 calls 1d5f:213e, whose discount
    // is damage byte 17 >> 6. This intentionally differs from Sell's
    // damage/52 condition classes: damage 52..63 is still full asset value,
    // while damage 64 begins the half-price asset bracket.
    if (definition) total += definition.price >> (record[17] >> 6);
  }
  return total;
}

function totalStructureAssetValue() {
  if (!farmStateBytes || !saveData) return 0;
  let total = 0;
  for (let slot = 1; slot < saveData.format.structureRecordCount; slot += 1) {
    const record = structureRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    const definition = itemDefinitionForKeyAndId(
      "structure",
      view.getUint16(0, true),
    );
    if (definition) total += definition.price;
  }
  return total;
}

function totalFuturesAssetValue() {
  if (!farmStateBytes || !saveData) return 0;
  let total = 0;
  const liveCount = stateView(farmStateBytes).getUint16(
    saveData.format.fieldCountOffset,
    true,
  );
  let activeSeen = 0;
  for (
    let slot = 1;
    slot < saveData.format.fieldRecordCount && activeSeen < liveCount;
    slot += 1
  ) {
    const record = fieldRecord(slot);
    if (!record || (record[7] & 1) === 0) continue;
    activeSeen += 1;
    const contractPrice = fieldRecordView(record).getUint16(48, true);
    if (contractPrice !== 0)
      total += harvestValueAtPrice(record, contractPrice);
  }
  return total;
}

function totalLivestockAssetValue() {
  if (!farmStateBytes || !saveData) return 0;
  let total = 0;
  const liveCount = stateView(farmStateBytes).getUint16(
    saveData.format.objectCountOffset,
    true,
  );
  let activeSeen = 0;
  for (
    let slot = 1;
    slot < saveData.format.objectRecordCount && activeSeen < liveCount;
    slot += 1
  ) {
    const record = objectRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    activeSeen += 1;
    const definition = itemDefinitionForKeyAndId(
      "livestock",
      view.getUint16(6, true),
    );
    if (definition) total += livestockCurrentValue(record, definition);
  }
  return total;
}

function balanceSheetValues() {
  if (!farmStateBytes || !saveData) return null;
  const format = saveData.format;
  const view = stateView(farmStateBytes);
  const assets = {
    cash: state.funds,
    machinery: totalMachineryAssetValue(),
    land: totalOwnedParcelValue(),
    futures: totalFuturesAssetValue(),
    livestock: totalLivestockAssetValue(),
  };
  assets.total =
    assets.cash +
    assets.machinery +
    assets.land +
    assets.futures +
    assets.livestock;
  const revenue = {
    cropSales: view.getUint32(format.storedCropSaleIncomeOffset, true),
    machinerySales: view.getUint32(format.machineSaleIncomeOffset, true),
    landSales: view.getUint32(format.landSaleIncomeOffset, true),
    futuresSold: view.getUint32(format.contractGainIncomeOffset, true),
    animalSales: view.getUint32(format.livestockSaleIncomeOffset, true),
  };
  revenue.total =
    revenue.cropSales +
    revenue.machinerySales +
    revenue.landSales +
    revenue.futuresSold +
    revenue.animalSales;
  const expenses = {
    seed: view.getUint32(format.seedPurchaseExpenseOffset, true),
    machinery: view.getUint32(format.machinePurchaseExpenseOffset2, true),
    landPurchases: view.getUint32(format.landPurchaseExpenseOffset1, true),
    futuresLosses: view.getUint32(format.contractLossExpenseOffset, true),
    // The original Balance Sheet labels its second land-purchase ledger
    // "Structures" even though both serialized land ledgers receive land buys.
    structures: view.getUint32(format.landPurchaseExpenseOffset2, true),
    livestock: view.getUint32(format.livestockPurchaseExpenseOffset2, true),
    chemicals: view.getUint32(format.chemicalPurchaseExpenseOffset, true),
    loanInterest: view.getUint32(format.bankRepaymentExpenseOffset, true),
    leasedMachines: view.getUint32(format.machineLeaseExpenseOffset, true),
    taxes: priorYearPropertyTaxExpense,
    miscellaneous: view.getUint32(format.machineOperatingExpenseOffset, true),
  };
  expenses.total =
    expenses.seed +
    expenses.machinery +
    expenses.landPurchases +
    expenses.futuresLosses +
    expenses.structures +
    expenses.livestock +
    expenses.chemicals +
    expenses.loanInterest +
    expenses.leasedMachines +
    expenses.taxes +
    expenses.miscellaneous;
  return {
    assets,
    revenue,
    expenses,
    profitLoss: revenue.total - expenses.total,
    estimatedTaxes: estimatedPropertyTax(),
    quarterlyLoanPayment: state.bankQuarterlyPayment,
  };
}

function evaluationProsperity() {
  if (!farmStateBytes || !saveData) return 0;
  const view = stateView(farmStateBytes);
  const gross =
    totalOwnedParcelValue() +
    view.getUint32(saveData.format.machinePurchaseExpenseOffset1, true) +
    (state.bankStructureCollateral ?? 0) +
    totalFuturesAssetValue() +
    livestockAssetValue;
  return Math.max(0, Math.floor(gross / 3) - state.bankDebt);
}

function evaluationProductivityClass() {
  const basis = evaluationProsperity();
  if (basis < 4000) return 0;
  if (basis < 15000) return 1;
  if (basis < 50000) return 2;
  if (basis < 100000) return 3;
  if (basis < 200000) return 4;
  if (basis < 300000) return 5;
  if (basis < 500000) return 6;
  if (basis < 1000000) return 7;
  // Above the final bracket the native decision tree falls through with AX
  // still holding the basis' low word instead of assigning another class.
  return basis & 0xffff;
}

function evaluationFieldSummary() {
  let problemFlags = 0;
  let fieldCount = 0;
  let soilCount = 0;
  let environmentCount = 0;
  for (const { record } of activeFieldRecords()) {
    const flags = fieldRecordView(record).getUint16(54, true);
    problemFlags |= flags;
    if ((flags & 0x80) !== 0) soilCount += 1;
    if ((flags & 0x04) !== 0) environmentCount += 1;
    fieldCount += 1;
  }
  return {
    fieldCount,
    soilCount,
    environmentCount,
    problemFlags: problemFlags & 0xff,
    problemSlots: Array.from({ length: 8 }, (_, bit) => bit).filter(
      (bit) => (problemFlags & (1 << bit)) !== 0,
    ),
  };
}

function suggestedCropSlots() {
  if (!farmStateBytes || !saveData) return [];
  const format = saveData.format;
  const start =
    (((state.weatherPrecipitationCycle ?? 0) * format.weatherMonthsPerCycle +
      state.month) *
      format.weatherWeeksPerMonth +
      state.week) %
    format.weatherRecordCount;
  let rainfall = 0;
  let growingHeat = 0;
  let winterChill = 0;
  for (let week = 0; week < 16; week += 1) {
    const index = (start + week) % format.weatherRecordCount;
    rainfall +=
      weatherRecordByteByIndex(
        index,
        format.weatherPrecipitationOffset,
        true,
      ) ?? 0;
    const temperature =
      weatherRecordByteByIndex(index, format.weatherTemperatureOffset, true) ??
      0;
    if (temperature > 50) growingHeat += temperature * 7 - 350;
    if (temperature < 45) winterChill += 45 - temperature;
  }
  rainfall = (rainfall & 0xffff) >>> 1;
  const suggestions = [];
  for (let cropSlot = 0; cropSlot < 16; cropSlot += 1) {
    const requirement = cropEvaluationRequirements.get(cropSlotName(cropSlot));
    if (!requirement) continue;
    const [chillRequirement, heatRequirement, rainfallRequirement] =
      requirement;
    if (
      heatRequirement <= growingHeat &&
      Math.floor(chillRequirement / 7) <= winterChill &&
      rainfallRequirement <= rainfall
    )
      suggestions.push(cropSlot);
  }
  return suggestions;
}

function updateAnnualEvaluation() {
  const summary = evaluationFieldSummary();
  const ownedParcels = countParcelsWithStatus(1);
  const townParcels = countParcelsWithStatus(2);
  evaluationRuntime.previousFarmTotal = evaluationRuntime.farmTotal;
  evaluationRuntime.farmTotal = ownedParcels;
  evaluationRuntime.previousTownTotal = evaluationRuntime.townTotal;
  evaluationRuntime.townTotal = townParcels;
  evaluationRuntime.previousFarmGrowth = evaluationRuntime.farmGrowth;
  evaluationRuntime.farmGrowth = ownedParcels - evaluationRuntime.farmGrowth;
  evaluationRuntime.previousTownGrowth = evaluationRuntime.townGrowth;
  evaluationRuntime.townGrowth = townParcels - evaluationRuntime.townGrowth;
  evaluationRuntime.previousProductivity = evaluationRuntime.productivity;
  evaluationRuntime.productivity =
    evaluationProductivityClass() - evaluationRuntime.productivity;
  evaluationRuntime.previousSoilCount = evaluationRuntime.soilCount;
  evaluationRuntime.soilCount = summary.soilCount;
  evaluationRuntime.previousEnvironmentCount =
    evaluationRuntime.environmentCount;
  evaluationRuntime.environmentCount = summary.environmentCount;
  return { ...evaluationRuntime };
}

function populationCount8(value) {
  let bits = value & 0xff;
  let count = 0;
  while (bits !== 0) {
    count += bits & 1;
    bits >>>= 1;
  }
  return count;
}

function farmConditionMusicName(problemFlags, funds = state.funds) {
  const distinctProblems = populationCount8(problemFlags);
  // 2c78:07a7..07f4 compares the 32-bit cash words as unsigned values.
  // This includes the original quirk where negative cash can satisfy the
  // FFARM high-cash branch when at most one problem bit is present.
  const unsignedFunds = Math.trunc(funds) >>> 0;
  if (distinctProblems >= 4 && unsignedFunds < 5000) return "dfarm";
  if (distinctProblems <= 1 && unsignedFunds > 500000) return "ffarm";
  return null;
}

function playFarmConditionMusic() {
  const name = farmConditionMusicName(evaluationFieldSummary().problemFlags);
  if (name) playMusic(name);
  return name;
}

function homesteadImprovementTierForFunds(funds = state.funds) {
  const unsignedFunds = Math.trunc(funds) >>> 0;
  if (unsignedFunds < 60000) return 0;
  if (unsignedFunds < 200000) return 1;
  if (unsignedFunds < 400000) return 2;
  if (unsignedFunds < 550000) return 3;
  if (unsignedFunds < 750000) return 4;
  if (unsignedFunds < 1000000) return 5;
  return null;
}

function writeHomesteadImprovementTile(originX, originY, x, y, tile) {
  const cell = mapCell(originX + x, originY + y);
  if (cell) writeMapBaseWord(cell, tile);
}

function resetHomesteadImprovementTiles(originX, originY) {
  for (const [x, y] of [
    [1, 1],
    [2, 1],
    [3, 1],
    [3, 2],
    [3, 3],
  ]) {
    writeHomesteadImprovementTile(originX, originY, x, y, 0x004f);
  }
  mapDirty = true;
}

function finishHomesteadImprovementTiles(tier) {
  if (!farmStateBytes || !saveData || tier < 0 || tier > 5) return false;
  const view = stateView(farmStateBytes);
  const format = saveData.format;
  const originX = view.getUint16(format.startupCoordinateXOffset, true);
  const originY = view.getUint16(format.startupCoordinateYOffset, true);
  const houseTile = tier === 0 ? 0x00fc : tier === 1 ? 0x0110 : 0x0112;
  if (tier >= 3) writeHomesteadImprovementTile(originX, originY, 1, 1, 0x0208);
  if (tier >= 4) {
    writeHomesteadImprovementTile(originX, originY, 2, 1, 0x0209);
    writeHomesteadImprovementTile(originX, originY, 3, 1, 0x020a);
  }
  if (tier >= 5) {
    writeHomesteadImprovementTile(originX, originY, 3, 2, 0x020b);
    writeHomesteadImprovementTile(originX, originY, 3, 3, 0x020c);
  }
  writeHomesteadImprovementTile(originX, originY, 1, 2, houseTile);
  writeHomesteadImprovementTile(originX, originY, 2, 2, houseTile + 1);
  writeHomesteadImprovementTile(originX, originY, 1, 3, houseTile + 0x28);
  writeHomesteadImprovementTile(originX, originY, 2, 3, houseTile + 0x29);
  mapDirty = true;
  return true;
}

function beginHomesteadNotice(kind, previousTier, nextTier, now = Date.now()) {
  pendingHomesteadImprovement = { previousTier, nextTier };
  modalNotice = `homestead-${kind}`;
  if (kind === "upgrade") {
    let variant = nextSimRandom() & 3;
    if (variant === 0) variant = 1;
    homesteadNoticeAnimation = { variant, sequenceIndex: 0 };
    nextHomesteadNoticeAnimationAt = now + homesteadNoticeAnimationInterval;
  } else {
    homesteadNoticeAnimation = null;
    nextHomesteadNoticeAnimationAt = 0;
  }
}

function updateAnnualHomesteadAudio(now = Date.now()) {
  const nextTier = homesteadImprovementTierForFunds();
  // 19ab:1264 does not call the homestead updater for cash >= $1,000,000.
  if (nextTier === null || nextTier === homesteadImprovementTier) return false;
  const previousTier = homesteadImprovementTier;
  if (farmStateBytes && saveData) {
    const view = stateView(farmStateBytes);
    resetHomesteadImprovementTiles(
      view.getUint16(saveData.format.startupCoordinateXOffset, true),
      view.getUint16(saveData.format.startupCoordinateYOffset, true),
    );
  }
  // The first annual classification uses the native 0xff sentinel and is
  // silent. Its map rewrite and class assignment still occur immediately.
  if (previousTier === 0xff) {
    homesteadImprovementTier = nextTier;
    finishHomesteadImprovementTiles(nextTier);
    return false;
  }
  if (nextTier < previousTier) {
    play("boos");
    beginHomesteadNotice("downgrade", previousTier, nextTier, now);
    return true;
  }
  if (nextTier === 0) {
    homesteadImprovementTier = nextTier;
    finishHomesteadImprovementTiles(nextTier);
    return false;
  }
  play("cheers");
  playMusic("cowman");
  beginHomesteadNotice("upgrade", previousTier, nextTier, now);
  return true;
}

function finishPendingHomesteadImprovement() {
  if (!pendingHomesteadImprovement) return false;
  homesteadImprovementTier = pendingHomesteadImprovement.nextTier;
  finishHomesteadImprovementTiles(homesteadImprovementTier);
  pendingHomesteadImprovement = null;
  homesteadNoticeAnimation = null;
  nextHomesteadNoticeAnimationAt = 0;
  return true;
}

function advanceHomesteadNoticeAnimation(now = Date.now()) {
  if (
    modalNotice !== "homestead-upgrade" ||
    !homesteadNoticeAnimation ||
    now < nextHomesteadNoticeAnimationAt
  )
    return false;
  const sequence = homesteadCowmanSequences[homesteadNoticeAnimation.variant];
  homesteadNoticeAnimation.sequenceIndex =
    (homesteadNoticeAnimation.sequenceIndex + 1) % sequence.length;
  nextHomesteadNoticeAnimationAt = now + homesteadNoticeAnimationInterval;
  return true;
}

function nativeEvaluationBar(value) {
  const signed = Math.trunc(value);
  // The executable's JBE compares the signed division result as an unsigned
  // word; a negative annual delta therefore takes the same full-bar path as
  // an oversized positive result.
  return signed < 0 || signed > 80 ? 80 : signed;
}

function evaluationScores(summary = evaluationFieldSummary()) {
  const farmDenominator = evaluationRuntime.previousFarmTotal || 1;
  const townDenominator = evaluationRuntime.previousTownTotal || 1;
  const fieldDenominator = summary.fieldCount || 1;
  let soil = Math.trunc((summary.soilCount * 80) / fieldDenominator);
  let environment = Math.trunc(
    (summary.environmentCount * 80) / fieldDenominator,
  );
  if (soil === 0) soil = 80;
  if (environment === 0) environment = 80;
  return {
    farmGrowth: nativeEvaluationBar(
      (evaluationRuntime.farmGrowth * 80) / farmDenominator,
    ),
    townGrowth: nativeEvaluationBar(
      (evaluationRuntime.townGrowth * 80) / townDenominator,
    ),
    productivity: nativeEvaluationBar(evaluationRuntime.productivity * 12),
    soilQuality: nativeEvaluationBar(soil),
    environmentQuality: nativeEvaluationBar(environment),
  };
}

function townDevelopmentUnits() {
  if (!farmStateBytes || !saveData) return 0;
  let units = 0;
  for (
    let parcelX = 0;
    parcelX < saveData.format.parcelGridWidth;
    parcelX += 1
  ) {
    for (
      let parcelY = 0;
      parcelY < saveData.format.parcelGridHeight;
      parcelY += 1
    ) {
      const record = parcelRecord(parcelX, parcelY);
      if (record?.[saveData.format.parcelStatusOffset] === 2)
        units += record[0] >> 4;
    }
  }
  return units;
}

function townDebugValues() {
  if (!farmStateBytes || !saveData) return null;
  const format = saveData.format;
  const view = stateView(farmStateBytes);
  const seasonalRevenue = state.taxableSaleIncome | 0;
  const residentialLevel = townDevelopmentUnits();
  const playerLandValue = totalOwnedParcelValue();
  return {
    taxRevenue: signedWord(readTownBudget()),
    seasonalRevenue,
    // 4753:027a uses a two-word arithmetic right shift and then supplies
    // only the low word to `%d`.
    amountOwed: signedWord(seasonalRevenue >> 2),
    taxesPastDue: state.propertyTaxDue | 0,
    yearsPastDue: signedByte(state.propertyTaxPenaltyCount ?? 0),
    playerLandValue,
    taxesPerYear: Math.floor(playerLandValue / 1000),
    parcelsOwned: signedWord(countParcelsWithStatus(2)),
    residentialLevel: signedWord(residentialLevel),
    townMaintenanceCost: signedWord(residentialLevel << 3),
    expansionFund: state.townReserve | 0,
    prosperity: evaluationProsperity() | 0,
    currentSectionX: signedByte(farmStateBytes[format.townCursorXOffset]),
    currentSectionY: signedByte(farmStateBytes[format.townCursorYOffset]),
    centerX: signedWord(view.getUint16(format.townCenterXOffset, true)),
    centerY: signedWord(view.getUint16(format.townCenterYOffset, true)),
  };
}

function townDebugLines() {
  const values = townDebugValues();
  if (!values) return [];
  // The native text control is exactly 40 glyphs wide, so the right-hand
  // values in its two long rows are intentionally clipped.
  return [
    `Tax Revenue: ${values.taxRevenue}`,
    `Seasonal Revenue: ${values.seasonalRevenue}  Amt Owed: ${values.amountOwed}`,
    `Taxes Past Due: ${values.taxesPastDue}`,
    `Years past due: ${values.yearsPastDue}`,
    `Player Land Val: ${values.playerLandValue}, Taxes/year: ${values.taxesPerYear}`,
    `Parcels Owned: ${values.parcelsOwned}`,
    `Total Residential Level: ${values.residentialLevel}, Town Maint cost: ${values.townMaintenanceCost}`,
    "",
    `Expansion_Fund: ${values.expansionFund}`,
    `Prosperity : ${values.prosperity}`,
    `cursec= ${values.currentSectionX}, cursecy=${values.currentSectionY},centerx=${values.centerX},centery=${values.centerY}`,
  ].map((line) => line.slice(0, 40));
}

function normalizeLoadedTownParcels() {
  if (!farmStateBytes || !saveData) return;
  for (
    let parcelX = 0;
    parcelX < saveData.format.parcelGridWidth;
    parcelX += 1
  ) {
    for (
      let parcelY = 0;
      parcelY < saveData.format.parcelGridHeight;
      parcelY += 1
    ) {
      const record = parcelRecord(parcelX, parcelY);
      if (record?.[saveData.format.parcelStatusOffset] !== 2) continue;
      const type = record[0] & 0x0f;
      // FUN_4753_0000 rebuilds the two pre-authored town templates at
      // development level ten when an SFM/SSM is loaded. Airport bit 0x40
      // is also the second Crop Duster parking flag; native controlled
      // loads retain it instead of reopening an occupied bay.
      if (type === 0) record[0] = 0xa0;
      else if (type === 5) record[0] = 0xa5 | (record[0] & 0x40);
    }
  }
}

function townLayoutTile(type, localX, localY) {
  return saveData?.townLayouts?.[type]?.[localX * 8 + localY] ?? 0;
}

function writeTownBaseCell(cell, tile, preserveHighFlags = false) {
  const word = preserveHighFlags
    ? (((cell[1] << 8) | cell[0]) & 0xf800) | (tile & 0x07ff)
    : tile;
  cell[0] = word & 0xff;
  cell[1] = (word >> 8) & 0xff;
}

function markTownCell(cell) {
  // 4753:0167 ORs the town bit into the separate overlay plane, retaining
  // every unrelated flag already present on the map cell.
  cell[3] |= 0x40;
}

const townEventTileBase = 0x1e3;
const townEventDefaultCells = [
  [3, 2, 9],
  [2, 1, 1],
  [1, 3, 14],
  [1, 5, 28],
  [3, 3, 16],
  [5, 2, 11],
];
const townEventFairTiles = [0x20e, 0x20f, 0x210, 0x210, 0x211, 0x211];
const townEventAnimalNames = ["Rascal", "Missy", "Stella", "Bogie"];
const townEventAnimalSpecies = ["Horse", "Cow", "Pig", "Sheep"];

function townEventFormatOffset(name, fallback) {
  return saveData?.format?.[name] ?? fallback;
}

function townEventMode() {
  return (
    farmStateBytes?.[townEventFormatOffset("townEventModeOffset", 0x2167a)] ?? 0
  );
}

function setTownEventModeRaw(mode) {
  if (farmStateBytes) {
    farmStateBytes[townEventFormatOffset("townEventModeOffset", 0x2167a)] =
      mode & 0xff;
  }
}

function townEventPhase() {
  return (
    farmStateBytes?.[townEventFormatOffset("townEventPhaseOffset", 0x2167b)] ??
    0
  );
}

function setTownEventPhase(phase) {
  if (farmStateBytes) {
    farmStateBytes[townEventFormatOffset("townEventPhaseOffset", 0x2167b)] =
      phase & 0xff;
  }
}

function townEventSelection() {
  return (
    farmStateBytes?.[
      townEventFormatOffset("townEventSelectionOffset", 0x21677)
    ] ?? 0xff
  );
}

function setTownEventSelection(selection) {
  if (farmStateBytes) {
    farmStateBytes[townEventFormatOffset("townEventSelectionOffset", 0x21677)] =
      selection & 0xff;
  }
}

function townEventResult() {
  if (!farmStateBytes) return 0;
  return stateView(farmStateBytes).getUint16(
    townEventFormatOffset("townEventResultOffset", 0x21678),
    true,
  );
}

function setTownEventResult(result) {
  if (!farmStateBytes) return;
  stateView(farmStateBytes).setUint16(
    townEventFormatOffset("townEventResultOffset", 0x21678),
    result & 0xffff,
    true,
  );
}

function stadiumCount() {
  return Math.min(
    7,
    farmStateBytes?.[townEventFormatOffset("stadiumCountOffset", 0x21673)] ?? 0,
  );
}

function stadiumCoordinates() {
  if (!farmStateBytes) return [];
  const offset = townEventFormatOffset("stadiumCoordinateOffset", 0x21663);
  return Array.from({ length: stadiumCount() }, (_, index) => ({
    x: farmStateBytes[offset + index * 2],
    y: farmStateBytes[offset + index * 2 + 1],
  }));
}

function townParcelCount() {
  if (!farmStateBytes || !saveData) return 0;
  let count = 0;
  for (let x = 0; x < saveData.format.parcelGridWidth; x += 1) {
    for (let y = 0; y < saveData.format.parcelGridHeight; y += 1) {
      if (parcelStatus(x, y) === 2) count += 1;
    }
  }
  return count;
}

function registerTownStadium(parcelX, parcelY) {
  if (!farmStateBytes) return false;
  const count = stadiumCount();
  if (count >= 7) return false;
  if (count * 16 >= townParcelCount()) {
    // The original calls the forced EVENTS.DAT dispatcher synchronously
    // from the still-open town-choice callback. Release that browser modal
    // while its event-card continuation owns input.
    modalNotice = null;
    requestGenericEvent(0xbc);
    return false;
  }
  const coordinateOffset = townEventFormatOffset(
    "stadiumCoordinateOffset",
    0x21663,
  );
  farmStateBytes[coordinateOffset + count * 2] = parcelX << 3;
  farmStateBytes[coordinateOffset + count * 2 + 1] = parcelY << 3;
  farmStateBytes[townEventFormatOffset("stadiumCountOffset", 0x21673)] =
    count + 1;
  return true;
}

function restoreTownEventFairCells(useFairTiles = false) {
  const tiles = useFairTiles ? townEventFairTiles : null;
  for (const stadium of stadiumCoordinates()) {
    townEventDefaultCells.forEach(([dx, dy, offset], index) => {
      const cell = mapCell(stadium.x + dx, stadium.y + dy);
      if (cell)
        writeTownBaseCell(
          cell,
          tiles ? tiles[index] : townEventTileBase + offset,
        );
    });
  }
  mapDirty = true;
}

function startTownEventMode(mode) {
  if (stadiumCount() === 0) return false;
  const previousMode = townEventMode();
  if (previousMode === 1) {
    for (const stadium of stadiumCoordinates()) {
      for (let dx = 2; dx <= 3; dx += 1) {
        for (let dy = 3; dy <= 4; dy += 1) {
          const cell = mapCell(stadium.x + dx, stadium.y + dy);
          if (cell) cell[1] &= 0xf7;
        }
      }
    }
  } else if (previousMode === 2) {
    restoreTownEventFairCells(false);
  }
  if (mode === 0) restoreTownEventFairCells(false);
  setTownEventModeRaw(mode);
  mapDirty = true;
  return true;
}

function advanceTownEventAnimationTick(now = Date.now(), force = false) {
  if (!farmStateBytes || stadiumCount() === 0) return false;
  const mode = townEventMode();
  if (mode !== 1 && mode !== 2) return false;
  const view = stateView(farmStateBytes);
  const tickOffset = townEventFormatOffset("townEventLastTickOffset", 0x21675);
  const tick = biosClockTick(now);
  const lastTick = view.getUint16(tickOffset, true);
  if (!force && ((tick - lastTick) & 0xffff) < 8) return false;
  view.setUint16(tickOffset, tick, true);
  if (mode === 1) {
    const frameOffset = townEventFormatOffset(
      "townEventAnimationFrameOffset",
      0x21674,
    );
    for (const stadium of stadiumCoordinates()) {
      for (let dx = 2; dx <= 3; dx += 1) {
        for (let dy = 3; dy <= 4; dy += 1) {
          const cell = mapCell(stadium.x + dx, stadium.y + dy);
          if (cell) cell[1] &= 0xf7;
        }
      }
      farmStateBytes[frameOffset] = (farmStateBytes[frameOffset] + 1) & 3;
      if (farmStateBytes[frameOffset] === 0) {
        townEventRandomX = nextSimRandom() & 1;
        townEventRandomY = nextSimRandom() & 1;
      }
      const cell = mapCell(
        stadium.x + 2 + townEventRandomX,
        stadium.y + 3 + townEventRandomY,
      );
      if (cell) {
        const overlay = ((cell[3] << 8) | cell[2]) & 0xf800;
        const tile = 0x3a9 + (nextSimRandom() & 7);
        cell[2] = (overlay | tile) & 0xff;
        cell[3] = (overlay | tile) >> 8;
        cell[1] |= 0x08;
      }
    }
  } else if (mode === 2) {
    for (const stadium of stadiumCoordinates()) {
      const fairFrame = (nextSimRandom() & 1) !== 0;
      townEventDefaultCells.forEach(([dx, dy, offset], index) => {
        const cell = mapCell(stadium.x + dx, stadium.y + dy);
        if (cell)
          writeTownBaseCell(
            cell,
            fairFrame ? townEventFairTiles[index] : townEventTileBase + offset,
          );
      });
    }
  } else {
    return false;
  }
  mapDirty = true;
  return true;
}

function reconnectTownRoadCells(cells, rule, connectionRules = [rule]) {
  const reconnect = new Map();
  for (const { x, y } of cells) {
    reconnect.set(`${x},${y}`, { x, y });
    const cell = mapCell(x, y);
    const current = (cell[1] << 8) | cell[0];
    // The native placement helper is entered after clearing base flags
    // 0x1000 and 0x2000, then retains the remaining high-word flags.
    const word = (current & 0xc800) | rule.straightTile;
    cell[0] = word & 0xff;
    cell[1] = word >> 8;
  }
  for (const { x, y } of cells) {
    for (const neighbor of cardinalNeighbors) {
      const neighborX = x + neighbor.dx;
      const neighborY = y + neighbor.dy;
      if (neighborX < 0 || neighborX >= 96 || neighborY < 0 || neighborY >= 96)
        continue;
      const tile = tileWords(mapCell(neighborX, neighborY)).base & 0x07ff;
      if (isLinearToolTile(tile, rule)) {
        reconnect.set(`${neighborX},${neighborY}`, {
          x: neighborX,
          y: neighborY,
        });
      }
    }
  }
  for (const { x, y } of reconnect.values()) {
    writeLinearToolTile(x, y, rule, connectionRules);
  }
}

function initializeTownParcelLayout(parcelX, parcelY, type) {
  if (type === 4 && !registerTownStadium(parcelX, parcelY)) return false;
  if (type === 5) {
    const airportCountOffset =
      saveData.format.townAirportCountOffset ?? 0x21712;
    farmStateBytes[airportCountOffset] =
      (farmStateBytes[airportCountOffset] + 1) & 0xff;
  }
  const roads = [];
  for (let localX = 0; localX < 8; localX += 1) {
    for (let localY = 0; localY < 8; localY += 1) {
      const x = parcelX * 8 + localX;
      const y = parcelY * 8 + localY;
      const cell = mapCell(x, y);
      const oldTile = tileWords(cell).base & 0x07ff;
      if (![0x47, 0x48, 0x6f, 0x70].includes(oldTile)) {
        const layoutTile = townLayoutTile(type, localX, localY);
        if (type === 5) {
          // The airport initializer retains the preexisting top five base
          // flags after clearing the two construction-state bits.
          const current = (cell[1] << 8) | cell[0];
          cell[1] = ((current & 0xc800) >> 8) & 0xff;
          writeTownBaseCell(cell, layoutTile, true);
        } else if (
          isLinearToolTile(layoutTile, linearTerrainTools["Dirt Road"])
        ) {
          roads.push({ x, y });
        } else {
          // Level-zero residential/commercial/recreational parcels expose
          // only their street plan; building placeholders are restored to
          // the native town terrain family using the saved terrain band.
          writeTownBaseCell(cell, 0x15 + (cell[4] >> 2));
        }
      }
      // Even protected water cells are marked as belonging to the town.
      markTownCell(cell);
    }
  }
  if (roads.length > 0)
    reconnectTownRoadCells(roads, linearTerrainTools["Dirt Road"]);
  mapDirty = true;
  return true;
}

function renderTownDevelopment(parcelX, parcelY) {
  const record = parcelRecord(parcelX, parcelY);
  if (!record || record[saveData.format.parcelStatusOffset] !== 2) return false;
  const type = record[0] & 0x0f;
  const level = record[0] >> 4;
  const writeFixedTemplate = (roadRule) => {
    const roads = [];
    for (let localX = 0; localX < 8; localX += 1) {
      for (let localY = 0; localY < 8; localY += 1) {
        const x = parcelX * 8 + localX;
        const y = parcelY * 8 + localY;
        const cell = mapCell(x, y);
        const oldTile = tileWords(cell).base & 0x07ff;
        if ([0x47, 0x48, 0x6f, 0x70].includes(oldTile)) continue;
        const tile = townLayoutTile(type, localX, localY);
        if (isLinearToolTile(tile, linearTerrainTools["Dirt Road"]))
          roads.push({ x, y });
        else writeTownBaseCell(cell, tile);
      }
    }
    reconnectTownRoadCells(roads, roadRule);
    return true;
  };

  // The type-zero layout promotes its road plan to the paved family.
  if (type === 0) {
    return writeFixedTemplate(linearTerrainTools["Paved Road"]);
  }

  // Airport and recreational templates use a fixed layout at every level.
  // The airport's first weekly renderer promotes its authored street cells
  // to the paved family; recreational parcels retain dirt roads.
  if (type === 5) return writeFixedTemplate(linearTerrainTools["Paved Road"]);
  if (type === 4) return writeFixedTemplate(linearTerrainTools["Dirt Road"]);

  if (level === 0) {
    initializeTownParcelLayout(parcelX, parcelY, type);
    return true;
  }

  if (level >= 1 && level <= 7) {
    const roads = [];
    const halfLevel = Math.floor(level / 2);
    for (let localX = 0; localX < 8; localX += 1) {
      for (let localY = 0; localY < 8; localY += 1) {
        const tile = townLayoutTile(type, localX, localY);
        if (tile >= 0xfc && tile <= 0x118) {
          if ((tile & 1) !== 0) continue;
          const randomOffset = (nextSimRandom() & 3) * 2;
          const x = parcelX * 8 + localX;
          const y = parcelY * 8 + localY;
          const levelOffset = halfLevel * 2 + randomOffset;
          writeTownBaseCell(mapCell(x, y), 0xfc + levelOffset);
          writeTownBaseCell(mapCell(x + 1, y), 0xfd + levelOffset);
          writeTownBaseCell(mapCell(x, y + 1), 0x124 + levelOffset);
          writeTownBaseCell(mapCell(x + 1, y + 1), 0x125 + levelOffset);
          continue;
        }
        if (tile >= 0x124 && tile <= 0x140) continue;
        const x = parcelX * 8 + localX;
        const y = parcelY * 8 + localY;
        if (isLinearToolTile(tile, linearTerrainTools["Dirt Road"]))
          roads.push({ x, y });
        else writeTownBaseCell(mapCell(x, y), tile);
      }
    }
    reconnectTownRoadCells(roads, linearTerrainTools["Dirt Road"]);
    return true;
  }

  if (level === 8) {
    const roads = [];
    for (let localX = 0; localX < 8; localX += 1) {
      for (let localY = 0; localY < 8; localY += 1) {
        const x = parcelX * 8 + localX;
        const y = parcelY * 8 + localY;
        const tile = townLayoutTile(type, localX, localY);
        if (isLinearToolTile(tile, linearTerrainTools["Dirt Road"]))
          roads.push({ x, y });
        else writeTownBaseCell(mapCell(x, y), tile);
      }
    }
    reconnectTownRoadCells(roads, linearTerrainTools["Dirt Road"]);
    return true;
  }

  if (level >= 9 && level <= 12) {
    // The last four growth stages pave one 4x4 quadrant of the authored
    // street plan at a time: upper-left, lower-left, upper-right, then
    // lower-right in the native x-major coordinate order.
    const quadrant = {
      9: [0, 4, 0, 4],
      10: [4, 8, 0, 4],
      11: [0, 4, 4, 8],
      12: [4, 8, 4, 8],
    }[level];
    const roads = [];
    for (let localX = quadrant[0]; localX < quadrant[1]; localX += 1) {
      for (let localY = quadrant[2]; localY < quadrant[3]; localY += 1) {
        if (
          !isLinearToolTile(
            townLayoutTile(type, localX, localY),
            linearTerrainTools["Dirt Road"],
          )
        )
          continue;
        roads.push({ x: parcelX * 8 + localX, y: parcelY * 8 + localY });
      }
    }
    reconnectTownRoadCells(roads, linearTerrainTools["Paved Road"], [
      linearTerrainTools["Paved Road"],
      linearTerrainTools["Dirt Road"],
    ]);
    return true;
  }
  return false;
}

function selectNextTownDevelopmentCursor(parcelX, parcelY) {
  const format = saveData.format;
  const view = stateView(farmStateBytes);
  const centerX = view.getUint16(format.townCenterXOffset, true);
  const centerY = view.getUint16(format.townCenterYOffset, true);
  for (let radius = 1; radius < 7; radius += 1) {
    for (let x = parcelX - radius; x < parcelX + radius; x += 1) {
      for (let y = parcelY - radius; y < parcelY + radius; y += 1) {
        if (
          x < 0 ||
          x >= format.parcelGridWidth ||
          y < 0 ||
          y >= format.parcelGridHeight
        )
          continue;
        if (parcelStatus(x, y) !== 2 || x === centerX || y === centerY)
          continue;
        farmStateBytes[format.townCursorXOffset] = x;
        farmStateBytes[format.townCursorYOffset] = y;
        return true;
      }
    }
  }
  farmStateBytes[format.townCursorXOffset] = centerX;
  farmStateBytes[format.townCursorYOffset] = centerY;
  return false;
}

function removeTownParcel(parcelX, parcelY) {
  const format = saveData.format;
  const view = stateView(farmStateBytes);
  const centerX = view.getUint16(format.townCenterXOffset, true);
  const centerY = view.getUint16(format.townCenterYOffset, true);
  if (parcelX === centerX && parcelY === centerY) return false;
  const record = parcelRecord(parcelX, parcelY);
  record[format.parcelStatusOffset] = 0;
  selectNextTownDevelopmentCursor(parcelX, parcelY);
  for (let x = parcelX * 8; x < parcelX * 8 + 8; x += 1) {
    for (let y = parcelY * 8; y < parcelY * 8 + 8; y += 1) {
      const cell = mapCell(x, y);
      cell[3] &= 0xb7;
      const word = (cell[1] << 8) | cell[0];
      const tile = word & 0x07ff;
      // 0860/099f identify the sixteen native tree-family tiles, which
      // survive town removal. Every other base returns to regional soil.
      if (tile >= 0x83 && tile < 0x93) continue;
      writeTownBaseCell(cell, 0x15 + (cell[4] >> 2), true);
    }
  }
  mapDirty = true;
  return true;
}

function changeTownDevelopmentAtCursor(delta) {
  if (!farmStateBytes || !saveData || delta === 0) return false;
  const format = saveData.format;
  const parcelX = farmStateBytes[format.townCursorXOffset];
  const parcelY = farmStateBytes[format.townCursorYOffset];
  const record = parcelRecord(parcelX, parcelY);
  if (!record || record[format.parcelStatusOffset] !== 2) return false;
  const level = record[0] >> 4;
  const type = record[0] & 0x0f;
  if (delta > 0) {
    // The 16-entry type table at 8d91:9cac contains 0x0d in every slot.
    if (level >= 13) return false;
    record[0] = ((level + 1) << 4) | type;
  } else if (level > 0) {
    record[0] = ((level - 1) << 4) | type;
  } else {
    removeTownParcel(parcelX, parcelY);
    // 4753:080c deliberately reports failure after the level-zero removal;
    // the weekly caller therefore does not refund $25 to the town budget.
    return false;
  }
  if (record[format.parcelStatusOffset] === 2)
    renderTownDevelopment(parcelX, parcelY);
  mapDirty = true;
  return true;
}

function processWeeklyTownGrowth() {
  const townBudget = readTownBudget();
  if (townBudget >= 25) {
    if (!changeTownDevelopmentAtCursor(1)) return false;
    writeTownBudget(townBudget - 25);
    return true;
  }
  if (townBudget < 0) {
    if (!changeTownDevelopmentAtCursor(-1)) return false;
    writeTownBudget(Math.min(0, townBudget + 25));
    return true;
  }
  return false;
}

function townParcelCanBePurchased(parcelX, parcelY) {
  if (parcelStatus(parcelX, parcelY) !== 0) return false;
  for (let cellX = parcelX * 8; cellX < parcelX * 8 + 8; cellX += 1) {
    for (let cellY = parcelY * 8; cellY < parcelY * 8 + 8; cellY += 1) {
      const cell = mapCell(cellX, cellY);
      if (!cell || (((cell[1] << 8) | cell[0]) & 0x3000) !== 0) return false;
    }
  }
  return true;
}

function findAnnualTownParcel() {
  if (!farmStateBytes || !saveData) return null;
  const format = saveData.format;
  const view = stateView(farmStateBytes);
  const centerX = view.getUint16(format.townCenterXOffset, true);
  const centerY = view.getUint16(format.townCenterYOffset, true);
  for (let radius = 1; radius <= 11; radius += 1) {
    for (
      let parcelX = centerX - radius;
      parcelX <= centerX + radius;
      parcelX += 1
    ) {
      for (
        let parcelY = centerY - radius;
        parcelY <= centerY + radius;
        parcelY += 1
      ) {
        if (
          parcelX < 0 ||
          parcelX >= format.parcelGridWidth ||
          parcelY < 0 ||
          parcelY >= format.parcelGridHeight
        )
          continue;
        if (townParcelCanBePurchased(parcelX, parcelY))
          return { x: parcelX, y: parcelY };
      }
    }
  }
  return null;
}

function beginAnnualTownAnnex(displaySnapshot = null) {
  const parcel = findAnnualTownParcel();
  if (!parcel || state.townReserve < townParcelAcquisitionCost) return false;
  const record = parcelRecord(parcel.x, parcel.y);
  state.townReserve -= townParcelAcquisitionCost;
  record[saveData.format.parcelStatusOffset] = 2;
  farmStateBytes[saveData.format.townCursorXOffset] = parcel.x;
  farmStateBytes[saveData.format.townCursorYOffset] = parcel.y;
  pendingTownVote = parcel;
  townVoteDisplaySnapshot = displaySnapshot || {
    week: state.week,
    month: state.month,
    year: state.year,
    funds: state.funds,
  };
  modalNotice = "town-vote";
  mapDirty = true;
  return true;
}

function completeTownVote(type) {
  if (!pendingTownVote || modalNotice !== "town-vote") return false;
  const record = parcelRecord(pendingTownVote.x, pendingTownVote.y);
  if (!record || record[saveData.format.parcelStatusOffset] !== 2) return false;
  const previousType = record[0];
  record[0] = type === 5 ? 0xa5 : type & 0x0f;
  if (!initializeTownParcelLayout(pendingTownVote.x, pendingTownVote.y, type)) {
    record[0] = previousType;
    return false;
  }
  pendingTownVote = null;
  townVoteDisplaySnapshot = null;
  modalNotice = null;
  openGameWindow("evaluation");
  mapDirty = true;
  completePendingMonthBoundary();
  return true;
}

function chooseTownVoteAtPoint(point) {
  if (point.y < 128 || point.y >= 200) return false;
  if (point.x >= 112 && point.x < 184) {
    return completeTownVote((nextSimRandom() & 7) + 6);
  }
  if (point.x >= 200 && point.x < 272) {
    return completeTownVote(Math.min((nextSimRandom() & 3) + 1, 3));
  }
  if (point.x >= 288 && point.x < 360) return completeTownVote(5);
  if (point.x >= 376 && point.x < 448) return completeTownVote(4);
  return false;
}

function readTownBudget() {
  if (!farmStateBytes) return 0;
  return stateView(farmStateBytes).getInt32(
    saveData.format.townBudgetOffset,
    true,
  );
}

function writeTownBudget(value) {
  if (!farmStateBytes) return;
  stateView(farmStateBytes).setInt32(
    saveData.format.townBudgetOffset,
    value,
    true,
  );
}

function processPropertyTaxMonthlyDefault() {
  if (state.propertyTaxCountdown === 0 || state.propertyTaxDue === 0)
    return false;
  const messageAtEntry = message;
  if (
    collectOutstandingPayment(
      state.propertyTaxDue,
      saveData.format.propertyTaxExpenseOffset,
    )
  ) {
    state.propertyTaxDue = 0;
    state.propertyTaxCountdown = 0;
    state.propertyTaxLastNotice = "property-tax-paid";
    message = "Taxes paid in full.";
    requestGenericEvent(0xa3);
    return true;
  }

  state.propertyTaxCountdown -= 1;
  if (state.propertyTaxCountdown !== 0) {
    state.propertyTaxLastNotice = "property-tax-overdue";
    requestGenericEvent(0xa2);
    return false;
  }

  state.propertyTaxLastNotice = "property-tax-auction";
  captureFinanceEventDisplay(messageAtEntry);
  const auctionShown = requestGenericEvent(36);
  if (auctionShown) {
    pendingFinanceAuction = "tax";
    return false;
  }
  return completePropertyTaxAuction();
}

function completePropertyTaxAuction() {
  pendingFinanceAuction = null;
  if (forcedAssetAuction(state.propertyTaxDue)) {
    state.propertyTaxDue = 0;
    state.propertyTaxCountdown = 0;
    state.propertyTaxLastNotice = "property-tax-auction-paid";
    message = "The Tax Board sold enough assets to pay the overdue taxes.";
    requestGenericEvent(0xa5);
    genericEventDisplayReleaseRecord = 37;
    return true;
  }
  pendingBankruptcySource = "tax";
  bankruptcyPromptArmed = true;
  return false;
}

function processPropertyTaxEstimateWarning() {
  if (state.propertyTaxCountdown !== 0 || ![6, 9].includes(state.month))
    return false;
  if (state.funds >= estimatedPropertyTax()) return false;
  state.propertyTaxLastNotice = "property-tax-estimate-warning";
  message = "Not enough cash for estimated taxes due at the end of the year.";
  requestGenericEvent(0xa1);
  return true;
}

function processAnnualPropertyTax(displaySnapshot = null) {
  const bill = estimatedPropertyTax();
  const priorDue = state.propertyTaxDue;
  state.taxableSaleIncome = 0;
  if (farmStateBytes) {
    stateView(farmStateBytes).setUint32(
      saveData.format.taxableSaleIncomeOffset,
      0,
      true,
    );
  }

  if (
    !collectOutstandingPayment(bill, saveData.format.propertyTaxExpenseOffset)
  ) {
    state.propertyTaxDue =
      priorDue + Math.floor(priorDue / 4) + bill + Math.floor(bill / 4);
    state.propertyTaxCountdown = 3;
    state.propertyTaxPenaltyCount += 1;
    state.propertyTaxLastNotice = "property-tax-payment-warning";
    writeTownBudget(-bill);
    message = "Unable to pay taxes; a three month grace period has begun.";
    requestGenericEvent(0x9f);
    return false;
  }

  state.propertyTaxDue = 0;
  state.propertyTaxCountdown = 0;
  state.propertyTaxLastNotice = "";
  const townCost = townDevelopmentUnits() * 200;
  let townBudget = readTownBudget() + bill;
  if (townBudget >= townCost) {
    const reserveShare = Math.floor(bill / 4);
    state.townReserve += reserveShare;
    townBudget -= reserveShare + townCost;
    writeTownBudget(townBudget);
    beginAnnualTownAnnex(displaySnapshot);
    return true;
  }

  const combined = townBudget + state.townReserve;
  if (combined < townCost) {
    writeTownBudget(combined - townCost);
    state.townReserve = 0;
  } else {
    state.townReserve += townBudget - townCost;
    writeTownBudget(0);
  }
  return false;
}

function resetAnnualCashFlowLedgers() {
  if (!farmStateBytes) return;
  const format = saveData.format;
  const view = stateView(farmStateBytes);
  // 1a66:0b36 preserves only the just-finished year's tax expense for the
  // Balance Sheet, then clears the live tax ledger with every other annual
  // cash-flow accumulator. Its DS:2412 write is the rainfall-event word.
  priorYearPropertyTaxExpense = view.getUint32(
    format.propertyTaxExpenseOffset,
    true,
  );
  resetAnnualRainfallEvents();
  for (const offset of new Set([
    format.storedCropSaleIncomeOffset,
    format.machineSaleIncomeOffset,
    format.landSaleIncomeOffset,
    format.contractGainIncomeOffset,
    format.livestockSaleIncomeOffset,
    format.seedPurchaseExpenseOffset,
    format.machinePurchaseExpenseOffset2,
    format.landPurchaseExpenseOffset1,
    format.landPurchaseExpenseOffset2,
    format.contractLossExpenseOffset,
    format.livestockPurchaseExpenseOffset2,
    format.chemicalPurchaseExpenseOffset,
    format.bankRepaymentExpenseOffset,
    format.machineLeaseExpenseOffset,
    format.propertyTaxExpenseOffset,
    format.machineOperatingExpenseOffset,
  ])) {
    view.setUint32(offset, 0, true);
  }
}

function resetBankWindowRuntime(menuRepaint = false) {
  bankLoanInput = 0;
  bankReleasedControls.clear();
  // The toolbar initially shows the untouched BANKTERM client. The menu
  // opening/repaint path additionally raises REPAY; subsequent button
  // releases leave their bevel residues until the next client creation.
  if (menuRepaint) bankReleasedControls.add("repay");
}

function openBankWindow() {
  openGameWindow("bank");
  resetBankWindowRuntime();
  computeBankCreditLimit();
}

function drawBankWindow() {
  computeBankCreditLimit();
  const windowX = 176;
  const windowY = 96;
  // BANKTERM.BMP is the clean 288x224 client. The native window manager
  // supplies the title bar, while overlay 5242:0198 repaints every live
  // numeric field with its own disassembled width.
  context.drawImage(images.bank, windowX, windowY + 16);
  context.fillStyle = "#414141";
  context.fillRect(windowX + 192, windowY + 40, 64, 8);
  for (const relativeY of [56, 72, 88, 104]) {
    context.fillRect(windowX + 192, windowY + relativeY, 56, 8);
  }
  context.fillRect(windowX + 176, windowY + 144, 72, 8);
  // ovl23:041a redraws released controls, but its keyboard callback only
  // repaints numeric fields. Preserve each mouse release's two lower-left
  // bevel pixels instead of unconditionally raising REPAY on every frame.
  context.fillStyle = "#828282";
  for (const name of bankReleasedControls) {
    const relativeY = name === "repay" ? 189 : 213;
    context.fillRect(windowX + 146, windowY + relativeY, 1, 1);
    context.fillRect(windowX + 145, windowY + relativeY + 1, 1, 1);
  }
  drawText(String(state.funds), windowX + 192, windowY + 40, "white");
  drawText(String(state.bankDebt), windowX + 192, windowY + 56, "white");
  drawText(String(state.bankCreditLimit), windowX + 192, windowY + 72, "white");
  drawText(
    String(state.bankInterestRate),
    windowX + 192,
    windowY + 88,
    "white",
  );
  drawText(
    String(state.bankQuarterlyPayment),
    windowX + 192,
    windowY + 104,
    "white",
  );
  drawText(String(bankLoanInput), windowX + 176, windowY + 144, "white");
}

function calendarSeasonForDate(month = state.month, week = state.week) {
  // 19ab:0bde changes DAT_6190_1250 at the original irregular week
  // boundaries: 10, 23, 34, and 45 in the 48-week calendar.
  const absoluteWeek = month * 4 + week;
  if (absoluteWeek >= 45 || absoluteWeek < 10) return 0;
  if (absoluteWeek <= 22) return 1;
  if (absoluteWeek <= 33) return 2;
  return 3;
}

function weatherSeason() {
  // Unlike the displayed date, the season is its own serialized native
  // word (DS:1250). Raw calendar debug keys can therefore leave it out of
  // sync with month/week until the next normal week boundary.
  return Number.isFinite(state.season)
    ? Math.trunc(state.season)
    : calendarSeasonForDate();
}

function weatherWeeksTillNextSeason() {
  // Preserve 2b98:026c's comparisons, including its boundary quirks.
  const absoluteWeek = state.month * 4 + state.week;
  if (absoluteWeek >= 45) return 57 - absoluteWeek;
  if (absoluteWeek <= 10) return 10 - absoluteWeek;
  if (absoluteWeek < 23) return 23 - absoluteWeek;
  if (absoluteWeek < 34) return 34 - absoluteWeek;
  return 45 - absoluteWeek;
}

function weatherAverageRainfall() {
  if (!farmStateBytes || !saveData) return 0;
  const format = saveData.format;
  const cycle = Math.max(0, Math.min(4, state.weatherPrecipitationCycle ?? 0));
  let total = 0;
  for (let week = 0; week < 48; week += 1) {
    // The native painter tests the selected cycle, but deliberately adds
    // the corresponding byte from cycle zero (2b98:0166..0192).
    const selected =
      weatherRecordByteByIndex(
        cycle * 48 + week,
        format.weatherPrecipitationOffset,
        true,
      ) ?? 0;
    if (selected > 0) {
      total +=
        weatherRecordByteByIndex(
          week,
          format.weatherPrecipitationOffset,
          true,
        ) ?? 0;
    }
  }
  return (total & 0xffff) >>> 2;
}

function weatherRainfallToDate() {
  const offset = saveData?.format?.annualRainfallEventCountOffset;
  if (!farmStateBytes || offset === undefined) return 0;
  return stateView(farmStateBytes).getInt16(offset, true) >> 2;
}

function weatherDisplayedTemperature() {
  return Number.isFinite(state.currentTemperature)
    ? Math.trunc(state.currentTemperature)
    : currentWeatherTemperature();
}

function weatherGaugeFrame(temperature = weatherDisplayedTemperature()) {
  // 2b98:008f treats DS:43dc as a signed byte, shifts it arithmetically by
  // five, then adds 15 before selecting one 48x24 FLDGRPH record.
  const signedTemperature = ((Math.trunc(temperature) + 128) & 0xff) - 128;
  return (signedTemperature >> 5) + 15;
}

function weatherEvaporationLabel(temperature = weatherDisplayedTemperature()) {
  // The original masks to 32-degree bands, then indexes five eight-byte
  // labels at DS:3fb6. Normal authored temperatures reach the first four.
  let offset = (temperature & 0xe3) >> 2;
  if ((offset & 0x20) !== 0) offset -= 0x40;
  const labels = new Map([
    [0, "Slow"],
    [8, "Slow"],
    [16, "Average"],
    [24, "Fast"],
    [32, "Fast"],
  ]);
  return labels.get(offset) || (temperature < 64 ? "Slow" : "Fast");
}

function weatherForecastConditions() {
  const days = [...(state.weatherDays || []), ...(state.nextWeatherDays || [])];
  const day = Math.max(0, state.day ?? 0);
  return Array.from({ length: 5 }, (_, index) => days[day + index] ?? 0);
}

function drawDepressedControlButton(index) {
  const x = index * 32;
  context.fillStyle = "#828282";
  context.fillRect(x + 1, 17, 29, 1);
  context.fillRect(x + 1, 18, 28, 1);
  context.fillRect(x + 1, 19, 2, 27);
  context.fillRect(x + 1, 46, 1, 1);
  context.fillStyle = "#ffffff";
  context.fillRect(x + 30, 18, 1, 1);
  context.fillRect(x + 29, 19, 2, 26);
  context.fillRect(x + 3, 45, 28, 1);
  context.fillRect(x + 2, 46, 29, 1);
}

function depressedControlButtonIndexes() {
  const visibleWindows = [...windowStack];
  if (activeWindow) visibleWindows.push(activeWindow);
  const depressed = new Set(
    visibleWindows
      .map((name) => controlBarWindowButtons.get(name))
      .filter((index) => index !== undefined),
  );
  if (editVisible) depressed.add(7);
  return [...depressed].sort((left, right) => left - right);
}

function drawControlBar() {
  context.drawImage(images.controlBar, 0, 16);
  weatherForecastConditions()
    .slice(0, 3)
    .forEach((forecast, index) => {
      drawMapTile(0xcc + forecast, 328 + index * 16, 24);
    });
  for (const index of depressedControlButtonIndexes())
    drawDepressedControlButton(index);
}

function weatherVaneInterval() {
  // DAT_6190_4086 is indexed by signed wind speed >> 3 and stores game
  // timer ticks. The authored table begins 64,64,60,8,8,4,4,4,2,2,2,2.
  const intervals = [64, 64, 60, 8, 8, 4, 4, 4, 2, 2, 2, 2];
  const index = Math.max(
    0,
    Math.min(
      intervals.length - 1,
      Math.trunc((state.currentWindSpeed ?? 5) / 8),
    ),
  );
  return intervals[index] * nativeClockTickMilliseconds;
}

function resetWeatherVaneTimer(now = Date.now()) {
  weatherVaneLastTick = now;
}

function advanceWeatherVaneTick(now = Date.now()) {
  if (
    activeWindow !== "weather" ||
    now - weatherVaneLastTick <= weatherVaneInterval()
  ) {
    return false;
  }
  weatherVaneFrame = (weatherVaneFrame + 1) & 1;
  weatherVaneLastTick = now;
  return true;
}

function drawWeatherWindow() {
  const definition = windowDefinitions.weather;
  const { x, y } = definition;
  drawTitleBar(x, y, 336, definition.title);
  context.drawImage(images.weather, x, y + 16);

  const season = weatherSeason();
  drawMapTile(0xc8 + season, x + 16, y + 21);
  drawMapTile(0xc8 + ((season + 1) & 3), x + 304, y + 21);

  drawText(`Week ${state.week + 1} of ${months[state.month]}`, x + 40, y + 26);
  const weeksTill = weatherWeeksTillNextSeason();
  drawText(
    `${weeksTill} Week${weeksTill === 1 ? "" : "s"} Till`,
    x + 184,
    y + 26,
  );

  const averageRainfall = weatherAverageRainfall();
  const rainfallToDate = weatherRainfallToDate();
  const temperature = weatherDisplayedTemperature();
  drawText(String(averageRainfall), x + 304, y + 64);
  drawText(String(rainfallToDate), x + 304, y + 96);
  drawText(String(temperature), x + 24, y + 64);
  drawText(String((temperature - 32) >> 1), x + 24, y + 80);
  drawText(`${Math.trunc(state.currentWindSpeed ?? 5)} Mph`, x + 264, y + 190);
  drawText(weatherEvaporationLabel(temperature), x + 16, y + 190);

  let condition =
    state.currentWeatherCondition ?? state.weatherDays?.[state.day] ?? 0;
  if (condition === 4) condition = 3;
  condition = Math.max(0, Math.min(3, Math.trunc(condition)));
  context.drawImage(
    images.weatherSky,
    condition * 112,
    0,
    112,
    32,
    x + 112,
    y + 64,
    112,
    32,
  );
  context.drawImage(
    images.weatherGround,
    season * 112,
    0,
    112,
    32,
    x + 112,
    y + 96,
    112,
    32,
  );
  const gaugeFrame = weatherGaugeFrame(temperature);
  context.drawImage(
    images.fieldGraph,
    gaugeFrame * 48,
    0,
    48,
    24,
    x + 24,
    y + 120,
    48,
    24,
  );

  const thermometerHeight = Math.trunc(temperature / 3);
  context.fillStyle = "#ffffff";
  context.fillRect(x + 72, y + 52, 8, 44);
  context.fillStyle = "#c30404";
  context.fillRect(x + 72, y + 96 - thermometerHeight, 8, thermometerHeight);
  context.fillStyle = "#ffffff";
  context.fillRect(x + 248, y + 52, 8, 55);
  context.fillStyle = "#0000eb";
  context.fillRect(x + 248, y + 107 - rainfallToDate, 8, rainfallToDate);

  weatherForecastConditions().forEach((forecast, index) => {
    drawMapTile(0xcc + forecast, x + 112 + index * 24, y + 152);
  });
  context.drawImage(
    images.weatherVane,
    weatherVaneFrame * 32,
    0,
    32,
    32,
    x + 272,
    y + 120,
    32,
    32,
  );
}

function drawEvaluationWindow() {
  const windowX = 128;
  const windowY = 128;
  // EVALUATE.BMP is the clean 352x192 client. The native window manager
  // owns the 16-pixel title bar and overlay 2c78 paints every live field.
  context.drawImage(images.evaluation, windowX, windowY + 16);

  const summary = evaluationFieldSummary();
  summary.problemSlots.forEach((problemSlot) => {
    const column = Math.floor(problemSlot / 2);
    const row = problemSlot % 2;
    drawFieldCropIcon(
      16 + problemSlot,
      windowX + 16 + column * 32,
      windowY + 128 + row * 32,
    );
  });
  suggestedCropSlots()
    .slice(0, 8)
    .forEach((cropSlot, index) => {
      const column = Math.floor(index / 2);
      const row = index % 2;
      drawLoadedCropIcon(
        cropSlot,
        windowX + 152 + column * 32,
        windowY + 128 + row * 32,
      );
    });

  const seasonNames = ["Winter", "Spring", "Summer", "Fall"];
  const season = weatherSeason();
  drawMapTile(0xc8 + season, windowX + 304, windowY + 32);
  drawText(seasonNames[season], windowX + 288, windowY + 56);

  const scores = evaluationScores(summary);
  const bars = [
    [scores.farmGrowth, 24, "#00aa04"],
    [scores.townGrowth, 40, "#00aa04"],
    [scores.productivity, 56, "#00aa04"],
    [scores.soilQuality, 72, summary.soilCount === 0 ? "#00aa04" : "#c30404"],
    [
      scores.environmentQuality,
      88,
      summary.environmentCount === 0 ? "#00aa04" : "#c30404",
    ],
  ];
  for (const [score, relativeY, color] of bars) {
    context.fillStyle = "#414141";
    context.fillRect(windowX + 192, windowY + relativeY, 80, 8);
    if (score > 0) {
      context.fillStyle = color;
      context.fillRect(windowX + 192, windowY + relativeY, score, 8);
    }
  }
  [
    ["Farm Growth", 24],
    ["Town Growth", 40],
    ["Productivity", 56],
    ["Soil Quality", 72],
    ["Environment Quality", 88],
  ].forEach(([label, relativeY]) =>
    drawText(label, windowX + 16, windowY + relativeY),
  );
}

function drawBalanceSheetWindow() {
  const windowX = 128;
  const windowY = 96;
  context.drawImage(images.cashflow, windowX, windowY + 16);
  const values = balanceSheetValues();
  if (!values) return;
  const drawNumber = (
    value,
    relativeX,
    relativeY,
    width,
    background = "#c3c3c3",
  ) => {
    context.fillStyle = background;
    context.fillRect(windowX + relativeX, windowY + relativeY, width * 8, 8);
    drawText(
      String(Math.trunc(value)).padStart(width, " "),
      windowX + relativeX,
      windowY + relativeY,
    );
  };

  [
    values.assets.cash,
    values.assets.machinery,
    values.assets.land,
    values.assets.futures,
    values.assets.livestock,
  ].forEach((value, index) =>
    drawNumber(
      value,
      144,
      40 + index * 8,
      7,
      index % 2 === 0 ? "#c3c3c3" : "#ffffff",
    ),
  );
  drawNumber(values.assets.total, 136, 104, 8, "#828282");
  [
    values.revenue.cropSales,
    values.revenue.machinerySales,
    values.revenue.landSales,
    values.revenue.futuresSold,
    values.revenue.animalSales,
  ].forEach((value, index) =>
    drawNumber(
      value,
      144,
      136 + index * 8,
      7,
      index % 2 === 0 ? "#c3c3c3" : "#ffffff",
    ),
  );
  drawNumber(values.revenue.total, 136, 184, 8, "#828282");

  [
    values.expenses.seed,
    values.expenses.machinery,
    values.expenses.landPurchases,
    values.expenses.futuresLosses,
    values.expenses.structures,
    values.expenses.livestock,
    values.expenses.chemicals,
    values.expenses.loanInterest,
    values.expenses.leasedMachines,
    values.expenses.taxes,
    values.expenses.miscellaneous,
  ].forEach((value, index) =>
    drawNumber(
      value,
      320,
      40 + index * 8,
      7,
      index % 2 === 0 ? "#c3c3c3" : "#ffffff",
    ),
  );
  drawNumber(values.expenses.total, 312, 168, 8, "#828282");
  drawNumber(values.profitLoss, 312, 184, 8, "#828282");
  drawNumber(values.estimatedTaxes, 192, 200, 7);
  drawNumber(values.quarterlyLoanPayment, 192, 208, 7, "#ffffff");
}

function drawMarketValueWindow() {
  const windowX = 144;
  const windowY = 112;
  context.drawImage(images.futures, windowX, windowY + 16);
  if (!farmStateBytes || !saveData) return;
  if (!marketRuntime.initialized) initializeMarketRuntime();

  const crop = marketCropData();
  const history = marketRuntime.history[crop.slot];
  context.fillStyle = "#c3c3c3";
  context.fillRect(windowX + 24, windowY + 36, 121, 141);
  context.fillStyle = "#c30404";
  for (let sample = 0; sample < 30; sample += 1) {
    const y = marketPlotY(history[sample], crop.basePrice);
    context.fillRect(windowX + 25 + sample * 4, windowY + y, 4, 176 - y);
  }
  context.fillStyle = "#414141";
  for (let x = 24; x < 148; x += 4) {
    context.fillRect(windowX + x, windowY + 36, 1, 141);
  }
  for (let y = 36; y <= 176; y += 4) {
    context.fillRect(windowX + 24, windowY + y, 121, 1);
  }
  context.fillStyle = "#fff304";
  context.fillRect(windowX + 24, windowY + 108, 120, 2);

  for (let slot = 0; slot < 16; slot += 1) {
    drawLoadedCropIcon(
      slot,
      windowX + 176 + (slot & 3) * 32,
      windowY + 24 + Math.floor(slot / 4) * 32,
    );
  }
  const selectedX = windowX + 176 + (crop.slot & 3) * 32;
  const selectedY = windowY + 24 + Math.floor(crop.slot / 4) * 32;
  context.fillStyle = "#00aa04";
  context.fillRect(selectedX, selectedY, 32, 1);
  context.fillRect(selectedX + 1, selectedY + 1, 30, 1);
  context.fillRect(selectedX, selectedY + 31, 32, 1);
  context.fillRect(selectedX + 1, selectedY + 30, 30, 1);
  context.fillRect(selectedX, selectedY, 1, 32);
  context.fillRect(selectedX + 1, selectedY + 1, 1, 30);
  context.fillRect(selectedX + 31, selectedY, 1, 32);
  context.fillRect(selectedX + 30, selectedY + 1, 1, 30);

  context.fillStyle = "#c3c3c3";
  context.fillRect(windowX + 200, windowY + 163, 104, 8);
  context.fillRect(windowX + 200, windowY + 176, 48, 8);
  context.fillRect(windowX + 120, windowY + 198, 24, 8);
  drawText(crop.name.slice(0, 13), windowX + 200, windowY + 163);
  drawText(
    String(marketDisplayedValue()).slice(0, 6),
    windowX + 200,
    windowY + 176,
  );
  drawText(
    String(crop.item?.own ?? 0).slice(0, 3),
    windowX + 120,
    windowY + 198,
  );
}
