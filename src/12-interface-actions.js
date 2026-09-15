// Window activation, menu commands, and game click handling.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function activateWindow(name, menuRepaint = false) {
  const names = {
    Buy: "buy",
    Sell: "sell",
    Evaluation: "evaluation",
    Map: "map",
    Weather: "weather",
    "Balance Sheet": "balance",
    Bank: "bank",
    "Market Value": "market",
    "Farm Expert": "expert",
  };
  if (name === "Edit") {
    if (activeWindow === null && editVisible) closeEditWindow();
    else activateEditWindow();
    return;
  }
  const selectedWindow = names[name];
  openGameWindow(selectedWindow);
  if (selectedWindow === "map") {
    mapMode = -1;
    selectedParcel = null;
  } else if (selectedWindow === "sell") {
    resetSellWindowRuntime();
  } else if (selectedWindow === "bank") {
    resetBankWindowRuntime(menuRepaint);
    computeBankCreditLimit();
  } else if (selectedWindow === "weather") {
    resetWeatherVaneTimer();
  } else if (selectedWindow === "expert") {
    expertCard = 2;
  }
}

function openLoadCropWindow() {
  openGameWindow("load-crop");
  loadCropSlot = 0;
  loadCropFileIndex = 0;
  loadCropScroll = 0;
  modalNotice = null;
  message = "";
}

function activateMenuItem(menu, item) {
  play();
  if (menu.name === "File") {
    if (item === "About SimFarm") openGameWindow("about");
    else if (item === "New Game") {
      modalNotice = "new-game-confirm";
    } else if (item === "Save") saveSfmFile(false);
    else if (item === "Save As") saveSfmFile(true);
    else if (item === "Load Game") requestLoadGame();
    else if (item === "Load Crop") openLoadCropWindow();
    else if (item === "Quit") modalNotice = "quit-save";
  } else if (menu.name === "Options") {
    if (item === "Music") setMusicEnabled(!state.options.Music);
    else state.options[item] = !state.options[item];
  } else if (menu.name === "Speed") {
    const wasPaused = state.speed === "Pause";
    state.speed = item;
    if (item === "Ultra") disasterEventIntervalTicks = 1;
    else if (item === "Fast") disasterEventIntervalTicks = 2;
    else if (item === "Normal") disasterEventIntervalTicks = 4;
    if (livestockTickThresholds[item] !== undefined) {
      livestockIntervalTicks = livestockTickThresholds[item];
    }
    writeSpeedRuntimeState(item);
    if (item === "Pause") setQuickMessage(0x3c);
    else if (wasPaused) setQuickMessage(0x44);
    // Native speed changes do not reset calendarLastTick. Faster settings
    // therefore use the already elapsed wrapping interval.
  } else if (menu.name === "Windows") {
    activateWindow(item, true);
  } else if (menu.name === "Disasters") {
    if (item === "Disable") {
      state.disastersDisabled = !state.disastersDisabled;
    } else if (!state.disastersDisabled) {
      const alerts = {
        Tornado: "A TORNADO is blowing your WAY!",
        Locusts: "Locusts are swarming",
        Drought: "A Severe Drought is in Progress",
        Flood: "Severe Flooding",
        Frost: "A Severe Frost is in Progress",
        Windstorm: "A Windstorm is in Progress",
      };
      if (item === "Tornado") requestTornadoEvent();
      else if (item === "Locusts") requestLocustEvent();
      else if (item === "Drought") requestDroughtEvent();
      else if (item === "Flood") requestFloodEvent();
      else if (item === "Frost") requestFrostEvent();
      else if (item === "Windstorm") requestWindstormEvent();
      else {
        message = alerts[item];
        play(item.toLowerCase());
      }
    }
  }
  currentMenu = null;
  menuHover = -1;
}

function dismissModalNotice() {
  const notice = modalNotice;
  if (
    notice === "bulldoze-structure-question" ||
    notice === "bulldoze-field-question"
  ) {
    answerBulldozePrompt(false);
    return;
  }
  if (notice === "save-success") {
    modalNotice = null;
    if (activeWindow === "save-game") closeActiveWindow();
    if (saveDialogExitAfter) quitToTitle();
    return;
  }
  if (notice === "bank-foreclosure") {
    if (queuedModalNotice) {
      modalNotice = queuedModalNotice;
      queuedModalNotice = null;
    } else {
      modalNotice = null;
      bankruptcyPromptArmed = pendingBankruptcySource !== null;
    }
    return;
  }
  if (notice === "bank-foreclosure-paid") {
    modalNotice = null;
    queuedModalNotice = null;
    return;
  }
  if (notice === "homestead-upgrade" || notice === "homestead-downgrade") {
    modalNotice = null;
    play("click");
    finishPendingHomesteadImprovement();
    completePendingMonthBoundary();
    return;
  }
  if (notice?.startsWith("town-") && dismissTownEventNotice()) return;
  if (notice === "event-card") {
    const dismissedRecord = genericEventRecord;
    genericEventRecord = null;
    modalNotice = null;
    if (dismissedRecord === 60 && pendingTownVote) {
      modalNotice = "town-vote";
      return;
    }
    if (
      (dismissedRecord === 39 && pendingFinanceAuction === "bank") ||
      (dismissedRecord === 36 && pendingFinanceAuction === "tax")
    ) {
      const source = pendingFinanceAuction;
      const paid =
        source === "bank"
          ? completeBankForeclosureAuction()
          : completePropertyTaxAuction();
      if (!paid) {
        queuedGenericEventRecords = [];
        bankruptcyPromptArmed = true;
      }
      return;
    }
    if (dismissedRecord === genericEventDisplayReleaseRecord) {
      clearGenericEventDisplaySnapshot();
    }
    // An exhausted forced sale enters the homestead question only after its
    // ordinary auction/foreclosure card returns. With Messages off that card
    // is skipped and the auction routine arms this state immediately.
    if (
      (dismissedRecord === 36 || dismissedRecord === 39) &&
      pendingBankruptcySource !== null
    ) {
      queuedGenericEventRecords = [];
      bankruptcyPromptArmed = true;
      return;
    }
    if (queuedGenericEventRecords.length > 0) {
      genericEventRecord = queuedGenericEventRecords.shift();
      modalNotice = "event-card";
    } else {
      completePendingMonthBoundary();
    }
    return;
  }
  modalNotice = null;
  if (notice === "tornado-warning") startTornadoEvent();
  else if (notice === "locust-warning") startLocustEvent();
  else if (notice === "drought-warning") startDroughtEvent();
  else if (notice === "flood-warning") startFloodEvent();
  else if (notice === "frost-warning") startFrostEvent();
  else if (notice === "windstorm-warning") startWindstormEvent();
  else if (notice === "close-encounter") startCloseEncounterEvent();
}

function handleGameClick(point) {
  if (dusterFlight) return;
  if (bankruptcyPromptArmed && !modalNotice) {
    bankruptcyPromptArmed = false;
    modalNotice = "bankruptcy-question";
    return;
  }
  if (modalNotice) {
    if (modalNotice === "new-game-confirm") {
      if (inside(point, 232, 306, 49, 25)) modalNotice = null;
      else if (inside(point, 360, 306, 49, 25)) {
        modalNotice = null;
        clearGameWindows();
        enterNewGameRegion();
      }
    } else if (modalNotice === "quit-save") {
      if (inside(point, 232, 306, 48, 24)) openSaveGameDialog(true);
      else if (inside(point, 296, 306, 48, 24)) modalNotice = null;
      else if (inside(point, 360, 306, 48, 24)) quitToTitle();
    } else if (modalNotice === "save-success") {
      if (inside(point, 296, 306, 48, 24)) dismissModalNotice();
    } else if (modalNotice === "load-crop-in-use") {
      if (inside(point, 296, 306, 48, 24)) dismissModalNotice();
    } else if (
      (modalNotice === "debug-llama" || modalNotice === "debug-fund") &&
      inside(point, 296, 306, 49, 25)
    ) {
      dismissModalNotice();
    } else if (
      (modalNotice === "homestead-upgrade" ||
        modalNotice === "homestead-downgrade") &&
      inside(point, 296, 306, 49, 25)
    ) {
      dismissModalNotice();
    } else if (
      modalNotice === "event-card" &&
      inside(point, 296, genericEventRecord === 60 ? 274 : 306, 49, 25)
    ) {
      dismissModalNotice();
    } else if (modalNotice === "bankruptcy-question") {
      if (inside(point, 232, 307, 48, 24)) answerBankruptcyPrompt(true);
      else if (inside(point, 360, 307, 48, 24)) answerBankruptcyPrompt(false);
    } else if (modalNotice === "town-vote") {
      chooseTownVoteAtPoint(point);
    } else if (
      modalNotice === "bulldoze-structure-question" ||
      modalNotice === "bulldoze-field-question"
    ) {
      if (inside(point, 232, 307, 48, 24)) answerBulldozePrompt(true);
      else if (inside(point, 360, 307, 48, 24)) answerBulldozePrompt(false);
    } else if (
      modalNotice === "bulldoze-field-busy" &&
      inside(point, 296, 306, 49, 25)
    ) {
      dismissModalNotice();
    } else if (pendingTownEventPrompt?.question) {
      if (inside(point, 232, 307, 48, 24)) answerTownEventPrompt(true);
      else if (inside(point, 360, 307, 48, 24)) answerTownEventPrompt(false);
    } else if (pendingTownEventPrompt && inside(point, 296, 306, 49, 25)) {
      dismissModalNotice();
    } else if (
      modalNotice.startsWith("property-sale-") &&
      inside(point, 296, 306, 49, 25)
    ) {
      dismissModalNotice();
    } else if (
      modalNotice.startsWith("crop-duster-") &&
      inside(point, 296, 307, 48, 22)
    ) {
      dismissModalNotice();
    } else if (
      (modalNotice === "tornado-warning" ||
        modalNotice === "locust-warning" ||
        modalNotice === "drought-warning" ||
        modalNotice === "drought-ended" ||
        modalNotice === "flood-warning" ||
        modalNotice === "flood-ended" ||
        modalNotice === "frost-warning" ||
        modalNotice === "windstorm-warning" ||
        modalNotice === "windstorm-ended" ||
        modalNotice === "close-encounter" ||
        modalNotice === "toxicity-warning" ||
        modalNotice === "bank-foreclosure" ||
        modalNotice === "bank-foreclosure-paid") &&
      inside(point, 296, 306, 49, 25)
    ) {
      dismissModalNotice();
    }
    return;
  }
  // ABOUT is a blocking native presentation: any mouse press dismisses it,
  // rather than only the decorative close tile in its title bar.
  if (activeWindow === "about") {
    closeActiveWindow();
    return;
  }
  if (currentMenu !== null) {
    const menu = menus[currentMenu];
    if (inside(point, menu.dropX, 16, menu.dropWidth, menu.items.length * 12)) {
      const itemIndex = Math.floor((point.y - 16) / 12);
      activateMenuItem(menu, menu.items[itemIndex]);
      return;
    }
    currentMenu = null;
  }

  if (point.y < 16) {
    const menuIndex = menus.findIndex(
      (menu) => point.x >= menu.x && point.x < menu.x + menu.width,
    );
    if (menuIndex >= 0) {
      currentMenu = menuIndex;
      menuHover = -1;
      play();
      return;
    }
  }

  if (point.y >= 16 && point.y < 48) {
    if (point.x < 32) activateWindow("Buy");
    else if (point.x < 64) activateWindow("Sell");
    else if (point.x < 96) activateWindow("Evaluation");
    else if (point.x < 128) activateWindow("Map");
    else if (point.x < 160) activateWindow("Weather");
    else if (point.x < 192) activateWindow("Balance Sheet");
    else if (point.x < 224) activateWindow("Bank");
    else if (point.x < 256) activateEditWindow();
    else if (point.x < 288) activateWindow("Market Value");
    return;
  }

  // Child callbacks are authored in descriptor-relative screen coordinates.
  // Translate the pointer back to those coordinates after global menu and
  // Control-bar routing so every control follows its moved parent window.
  point = activeWindow
    ? gameWindowPoint(point)
    : gameWindowPoint(point, editWindowSentinel);

  if (activeWindow === "save-game") {
    if (inside(point, 304, 136, 48, 24)) {
      commitSaveGameDialog();
      return;
    }
    if (inside(point, 304, 168, 48, 24)) {
      closeActiveWindow();
      saveDialogExitAfter = false;
    }
    return;
  }

  if (activeWindow === "load-crop") {
    if (inside(point, 176, 160, 128, 128)) {
      const column = Math.floor((point.x - 176) / 32);
      const row = Math.floor((point.y - 160) / 32);
      loadCropSlot = row * 4 + column;
      return;
    }
    if (inside(point, 320, 160, 128, 128)) {
      const index = loadCropScroll + Math.floor((point.y - 160) / 8);
      if (index < cropData.crops.length) loadCropFileIndex = index;
      return;
    }
    if (inside(point, 448, 160, 16, 16)) {
      if (loadCropFileIndex > 0) {
        if (loadCropFileIndex === loadCropScroll && loadCropScroll > 0)
          loadCropScroll -= 1;
        loadCropFileIndex -= 1;
      }
      return;
    }
    if (inside(point, 448, 272, 16, 16)) {
      if (loadCropFileIndex + 1 < cropData.crops.length) {
        if (loadCropFileIndex - loadCropScroll >= 15) {
          loadCropScroll = Math.min(
            Math.max(0, cropData.crops.length - 16),
            loadCropScroll + 1,
          );
        }
        loadCropFileIndex += 1;
      }
      return;
    }
    if (inside(point, 344, 296, 64, 24)) {
      replaceLoadedCrop();
      return;
    }
    if (inside(point, 408, 296, 48, 24)) closeActiveWindow();
    return;
  }

  if (activeWindow === "map") {
    if (inside(point, 304, 283, 48, 24)) {
      closeActiveWindow();
      selectedParcel = null;
      return;
    }
    if (mapMode === 0 && selectedParcel && inside(point, 240, 283, 48, 24)) {
      transactSelectedParcel();
      return;
    }
    if (mapMode === 0 && inside(point, 152, 80, 192, 192)) {
      selectedParcel = {
        x: Math.floor((point.x - 152) / 16),
        y: Math.floor((point.y - 80) / 16),
      };
      propertySelectionActivated = true;
      play();
      return;
    }
    if (navigateFromOverview(point)) {
      mapNavigationHeld = true;
      return;
    }
    const buttons = [
      [90, 86],
      [122, 86],
      [90, 118],
      [122, 118],
      [90, 150],
      [122, 150],
      [90, 182],
      [122, 182],
    ];
    const mode = buttons.findIndex(([x, y]) => inside(point, x, y, 24, 24));
    if (mode >= 0) {
      mapMode = mode;
      // The original Property view enters with its parcel cursor at 0,0;
      // the map, Land Value, and BUY/SELL control are live immediately.
      selectedParcel = mode === 0 ? { x: 0, y: 0 } : null;
      propertySelectionActivated = false;
      play();
    }
    return;
  }
  if (activeWindow === "buy") {
    for (let index = 0; index < buyCategories.length; index += 1) {
      // The live native descriptor chain stores x=10, y=22+30*n, w=28,
      // h=28 relative to the Buy window at (128,96). FUN_0636_0dce treats
      // both ends as inclusive, hence the 29x29 browser rectangles and the
      // single rejected row between neighboring category controls.
      if (inside(point, 138, 118 + index * 30, 29, 29)) {
        selectBuyCategory(index);
        return;
      }
    }
    // Child ID 6 is the left/up control and advances the raw definition
    // index. buyCategories stores that raw table in display traversal order,
    // so this is a -1 step in the browser list.
    if (inside(point, 304, 184, 29, 29)) {
      stepBuyItem(-1);
      return;
    }
    // Child ID 5 is the right/down control and decrements the raw index.
    if (inside(point, 335, 184, 29, 29)) {
      stepBuyItem(1);
      return;
    }
    // IDs 9 and 10 share their x=328 edge in the original inclusive hit
    // test. ID 9 precedes ID 10 in the child chain, so BUY wins that edge.
    if (inside(point, 296, 296, 33, 25)) {
      const item = selectedBuyDefinition();
      if (item) {
        if (item.category === "machine" && item.id === 8) {
          selectedPurchaseItem = null;
          purchaseCropDusterAtAirport(item);
          return;
        }
        selectedPurchaseItem = {
          categoryIndex: item.categoryIndex,
          itemIndex: item.itemIndex,
        };
        selectedTool = `Buy ${itemTextLines(item.textIndex)[0]}`;
        selectedCropSlot = null;
        selectedSprayAction = null;
        toolPopup = null;
        message = "";
        clearGameWindows();
      }
      return;
    }
    if (inside(point, 328, 296, 49, 25)) closeActiveWindow();
    return;
  }
  if (activeWindow === "sell") {
    for (let index = 0; index < sellCategoryKeys.length; index += 1) {
      if (inside(point, 144, 98 + index * 30, 29, 29)) {
        selectSellCategory(index);
        return;
      }
    }
    if (inside(point, 144, 192, 17, 17)) {
      stepSellItem(-1);
      return;
    }
    if (inside(point, 144, 272, 17, 17)) {
      stepSellItem(1);
      return;
    }
    // The parent painter owns the 48-pixel scrollbar track between the two
    // child arrows. Its DOS hit test is inclusive; the arrow children win
    // their shared y=208 and y=272 edges because they dispatch first.
    if (inside(point, 144, 208, 17, 65)) {
      seekSellScrollbar(point.y);
      return;
    }
    // IDs 6 and 9 overlap at x=256. SELL occurs first in the native child
    // chain, so that shared edge belongs to SELL.
    if (inside(point, 216, 312, 41, 25)) {
      sellSelectedInventoryItem();
      return;
    }
    if (inside(point, 256, 312, 49, 25)) {
      closeActiveWindow();
      return;
    }
    // The three 128x32 row descriptors also use inclusive endpoints.
    // Their shared boundaries resolve to the earlier row in chain order.
    for (let row = 0; row < 3; row += 1) {
      if (inside(point, 168, 192 + row * 32, 129, 33)) {
        selectSellRow(row);
        return;
      }
    }
    return;
  }
  if (activeWindow === "field-status") {
    if (inside(point, 432, 160, 48, 16)) {
      fieldScheduleWeek = state.month * 4;
      return;
    }
    if (inside(point, 432, 200, 48, 16)) {
      closeActiveWindow();
      selectedFieldSlot = null;
      return;
    }
    if (inside(point, 432, 176, 48, 16)) {
      fieldScheduleSelection = 18;
      return;
    }
    if (inside(point, 232, 184, 16, 16)) {
      fieldScheduleWeek = Math.max(0, fieldScheduleWeek - 4);
      return;
    }
    if (inside(point, 408, 184, 16, 16)) {
      fieldScheduleWeek = Math.min(228, fieldScheduleWeek + 4);
      return;
    }
    // These three direct callback regions use inclusive endpoints in
    // 3a77:007b..0204. Preserve even the odd shared-edge arithmetic.
    if (point.x >= 264 && point.x <= 392 && point.y >= 104 && point.y <= 136) {
      fieldScheduleSelection =
        Math.floor((point.x - 264) / 16) + Math.floor((point.y - 104) / 16) * 8;
      return;
    }
    if (point.x >= 184 && point.x <= 216 && point.y >= 160 && point.y <= 208) {
      fieldScheduleSelection =
        20 +
        Math.floor((point.x - 184) / 16) +
        Math.floor((point.y - 160) / 16) * 2;
      return;
    }
    if (point.x >= 232 && point.x <= 423 && point.y >= 168 && point.y <= 184) {
      const chosenWeek = fieldScheduleWeek + Math.floor((point.x - 232) / 16);
      applyFieldScheduleAction(chosenWeek);
      return;
    }
    return;
  }
  if (activeWindow === "airplane") {
    if (inside(point, 389, 299, 44, 24)) {
      startCropDusterFlight();
      return;
    }
    if (inside(point, 213, 179, 40, 40)) {
      serviceCropDusterFuel();
      return;
    }
    if (inside(point, 213, 235, 40, 40)) {
      serviceCropDusterSpray();
      return;
    }
    if (inside(point, 213, 291, 40, 40)) {
      serviceCropDusterRepair();
      return;
    }
    if (inside(point, 389, 179, 44, 44)) {
      selectCropDusterChemical(0xdd);
      return;
    }
    if (inside(point, 389, 223, 44, 44)) {
      selectCropDusterChemical(0xdf);
      return;
    }
    if (inside(point, 389, 267, 44, 44)) {
      selectCropDusterChemical(0xde);
      return;
    }
    if (inside(point, 389, 323, 44, 24)) {
      closeActiveWindow();
      selectedMachineSlot = null;
    }
    return;
  }
  if (activeWindow === "bank") {
    const keypad = [
      [7, 224, 264],
      [8, 240, 264],
      [9, 256, 264],
      [4, 224, 280],
      [5, 240, 280],
      [6, 256, 280],
      [1, 224, 296],
      [2, 240, 296],
      [3, 256, 296],
      [0, 272, 296],
    ];
    for (const [digit, x, y] of keypad) {
      if (inside(point, x, y, 16, 16)) {
        appendBankDigit(digit, digit === 0);
        return;
      }
    }
    if (inside(point, 272, 264, 16, 16)) {
      clearBankLoanInput();
      return;
    }
    if (inside(point, 320, 264, 88, 24)) {
      bankReleasedControls.add("repay");
      repayBankLoan();
      return;
    }
    if (inside(point, 320, 288, 40, 24)) {
      bankReleasedControls.add("ok");
      commitBankLoan();
      return;
    }
    if (inside(point, 360, 288, 48, 24)) {
      closeActiveWindow();
      bankLoanInput = 0;
    }
    return;
  }
  if (activeWindow === "market") {
    const definition = windowDefinitions.market;
    if (inside(point, definition.x + 176, definition.y + 24, 128, 128)) {
      const column = Math.floor((point.x - definition.x - 176) / 32);
      const row = Math.floor((point.y - definition.y - 24) / 32);
      marketRuntime.selectedCrop = row * 4 + column;
      return;
    }
    if (inside(point, ...definition.close)) closeActiveWindow();
    return;
  }
  if (activeWindow === "expert") {
    handleExpertClick(point);
    return;
  }
  if (activeWindow) {
    const definition = windowDefinitions[activeWindow];
    const image = images[definition.image];
    const close = definition.close || [
      definition.x + image.width - 64,
      definition.y + image.height - 24,
      64,
      40,
    ];
    if (inside(point, ...close)) {
      closeActiveWindow();
      selectedFieldSlot = null;
    }
    return;
  }

  if (!editVisible) return;

  const scrollDirections = [
    [16, 448, -1, 0],
    [592, 448, 1, 0],
    [608, 64, 0, -1],
    [608, 432, 0, 1],
  ];
  for (const [x, y, deltaX, deltaY] of scrollDirections) {
    if (inside(point, x, y, 16, 16)) {
      camera.x = Math.max(1, Math.min(63, camera.x + deltaX));
      camera.y = Math.max(0, Math.min(73, camera.y + deltaY));
      return;
    }
  }

  for (const tool of paletteTools) {
    if (inside(point, tool.x, tool.y, 24, 24)) {
      selectedTool = tool.name;
      movingMachineSlot = 0;
      selectedPurchaseItem = null;
      selectedCropSlot = null;
      selectedSprayAction = null;
      setQuickMessage(tool.messageRecord);
      play();
      return;
    }
  }
  if (inside(point, 16, 208, 48, 21)) {
    selectedPurchaseItem = null;
    toolPopup = "plant";
    currentMenu = null;
    play();
    return;
  }
  // Native rectangles overlap the artwork: y=232..262 belongs to Spray,
  // including the upper ten rows visibly occupied by the ? button.
  if (inside(point, 16, 232, 48, 31)) {
    selectedPurchaseItem = null;
    toolPopup = "spray";
    currentMenu = null;
    play();
    return;
  }
  if (point.x >= 64 && point.y >= 80 && point.x < 608 && point.y < 448) {
    if (selectedPurchaseItem !== null) {
      placePurchasedItemAtPoint(point);
      return;
    }
    if (selectedCropSlot !== null) {
      placeFieldAtPoint(point);
      return;
    }
    if (selectedSprayAction !== null) {
      sprayFieldAtPoint(point);
      return;
    }
    if (selectedTool === "Move Object") {
      // The hand cursor's descriptor adds (8,8) to queued clicks, unlike
      // terrain/examine callbacks. 1d75:0afd..0b30 converts that dispatched
      // coordinate into the cell passed to 114c:0006 for both Move phases.
      const position = mapCellForPointer({ x: point.x + 8, y: point.y + 8 });
      if (!position) return;
      if (movingMachineSlot === 0) {
        const machine = machineAtPosition(position);
        if (machine) {
          // FUN_114c_0006 checks the low two status bits before accepting
          // a Move Object source. Retail posts the surprising record 62
          // ("Not enough money to harvest field."), not record 61's
          // semantically matching "Cannot move item in use.", then UHOH.
          if ((stateView(machine.record).getUint16(2, true) & 3) !== 0) {
            setQuickMessage(0x3e);
            play("uhoh");
          } else {
            movingMachineSlot = machine.slot;
            setQuickMessage(7);
          }
        }
      } else {
        const record = machineRecord(movingMachineSlot);
        const status = record ? stateView(record).getUint16(2, true) : 0;
        if (record && (status & 0x20) !== 0 && (status & 3) === 0) {
          startManualMachineRoute(movingMachineSlot, position.x, position.y);
          mapDirty = true;
        } else if (record && (status & 0x20) !== 0 && (status & 3) !== 0) {
          // The destination callback repeats the same native record/sound
          // if the selected machine became busy after source selection.
          movingMachineSlot = 0;
          setQuickMessage(0x3e);
          play("uhoh");
        } else {
          movingMachineSlot = 0;
          message = "Choose an object to move.";
        }
      }
      return;
    }
    if (selectedTool === "Examine") {
      const position = mapCellForPointer(point);
      const field = position ? fieldAtPosition(position) : null;
      if (field) {
        selectedFieldSlot = field.slot;
        fieldScheduleWeek = state.month * 4;
        fieldScheduleSelection = 0;
        openGameWindow("field-status");
        message = "";
        return;
      }
      const machine = position ? machineAtPosition(position) : null;
      if (machine?.id === 8) {
        selectedMachineSlot = machine.slot;
        openGameWindow("airplane");
        message = "";
        return;
      }
    }
    if (
      linearTerrainTools[selectedTool] ||
      selectedTool === "Fence Gate" ||
      selectedTool === "Irrigation Ditch Valve" ||
      selectedTool === "Livestock Feed" ||
      selectedTool === "Water Trough" ||
      selectedTool === "Trees - Windbreaks" ||
      selectedTool === "Bulldoze"
    ) {
      dragState = { lastCell: null, placed: new Set(), soundPlayed: false };
      placeSelectedToolAtPoint(point);
    }
  }
}
