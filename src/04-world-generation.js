// Deterministic random generators, terrain designer, and region selection.
// This section is assembled into the shared private game closure by scripts/build.mjs.

function regionLevels() {
  const maps = regionData.selector.maps;
  const { gridX: x, gridY: y } = selectedRegion;
  return {
    rainfall: maps.rainfall[y][x],
    temperature: maps.temperature[y][x],
    windSpeed: maps.windSpeed[y][x],
  };
}

function nativeSeedClockParts(now, clockOverride) {
  const requested =
    clockOverride ??
    new URLSearchParams(window.location.search).get("dosclock");
  const match =
    typeof requested === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(requested)
      : null;
  if (match) {
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      year >= 1980 &&
      year <= 2099 &&
      check.getUTCFullYear() === year &&
      check.getUTCMonth() === month - 1 &&
      check.getUTCDate() === day &&
      hour < 24 &&
      minute < 60 &&
      second < 60
    ) {
      return { year, month: month - 1, day, hour, minute, second };
    }
  }
  const date = new Date(now);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

function nativeProcessRandomSeed(now = Date.now(), clockOverride) {
  const clock = nativeSeedClockParts(now, clockOverride);
  const { year, month, day, hour, minute, second } = clock;
  // Root 0000:0003 uses the low word returned by Borland time(), not the
  // game's50Hz timer. 0084:2c56 reads DOS local date/time; 2e68 converts it
  // with the shipped C-runtime PST8PDT defaults (DS:c580=28800,c584=1).
  const monthDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const dayOfYear =
    monthDays[month] + day - 1 + (year % 4 === 0 && month > 1 ? 1 : 0);
  const days =
    3652 + (year - 1980) * 365 + Math.trunc((year - 1980 + 3) / 4) + dayOfYear;
  let daylight = month > 3 && month < 9;
  // 0084:2d8e keeps the retail-era US rules even for a modern host year:
  // April's last Sunday before1987 / first Sunday afterward, through
  // October's last Sunday. Its boundary hours are02:00 and01:00.
  if (month === 3 || month === 9) {
    const weekday = (((days + 4) % 7) + 7) % 7;
    const firstWeekday = (((weekday - day + 1) % 7) + 7) % 7;
    const firstSunday = 1 + ((7 - firstWeekday) % 7);
    const lastDay = month === 3 ? 30 : 31;
    const lastSunday =
      firstSunday + Math.floor((lastDay - firstSunday) / 7) * 7;
    if (month === 3) {
      const start = year >= 1987 ? firstSunday : lastSunday;
      daylight = day > start || (day === start && hour >= 2);
    } else daylight = day < lastSunday || (day === lastSunday && hour < 1);
  }
  const seconds =
    days * 86400 +
    hour * 3600 +
    minute * 60 +
    second +
    28800 -
    (daylight ? 3600 : 0);
  return seconds & 0xffff;
}

function seedDesignerRandomHistory(seed = initialProcessRandomSeed) {
  // The initialized FUN_15fd_001e history at DS:1b7b is
  // 03fa,11a9,00ca,01a3,0003. The DOS startup path adds the low three
  // time() seed bits to the first three words. This five-word history is
  // separate from the primary1b79 LFSR, but shares the secondary's seed.
  const clockBits = seed & 7;
  return [
    0x03fa + clockBits,
    0x11a9 + clockBits,
    0x00ca + clockBits,
    0x01a3,
    0x0003,
  ];
}

function nextDesignerBoundedRandom(limit) {
  // Exact inclusive FUN_15fd_001e scaling and history shuffle. The fifth
  // word receives the old fourth word but is not part of the next sum.
  const sum = designerRandomHistory
    .slice(0, 4)
    .reduce((total, value) => (total + value) & 0xffff, 0);
  for (let index = 4; index > 0; index -= 1) {
    designerRandomHistory[index] = designerRandomHistory[index - 1];
  }
  const primary = nextSimRandom();
  designerRandomHistory[0] = (sum + (primary & 0x1f)) & 0xffff;
  const divisor = Math.floor(0x7fff / (limit + 1));
  return Math.min(limit, Math.floor((sum & 0x7fff) / divisor));
}

function designerHeightAt(words, x, y) {
  // 4673:0198 deliberately retains coordinate 96. In the original
  // contiguous planes that aliases the following x-major word (or the
  // zeroed second plane at the very end), rather than wrapping to zero.
  if (x < 0) x = 96 - x;
  if (x > 96) x -= 96;
  if (y < 0) y = 96 - y;
  if (y > 96) y -= 96;
  return ((words[x * 96 + y] & 0xff) - 0x0f) & 0x0f;
}

function runDesignerHeightPass(words, step, mask) {
  for (let x = 0; x < 96; x += step) {
    for (let y = 0; y < 96; y += step) {
      const xAligned = (x & mask) === 0;
      const yAligned = (y & mask) === 0;
      if (xAligned && yAligned) continue;
      const delta = nextDesignerBoundedRandom(mask) - step;
      let average;
      if (yAligned) {
        average =
          (designerHeightAt(words, x + step, y) +
            designerHeightAt(words, x - step, y)) >>
          1;
      } else if (xAligned) {
        average =
          (designerHeightAt(words, x, y - step) +
            designerHeightAt(words, x, y + step)) >>
          1;
      } else {
        average =
          (designerHeightAt(words, x + step, y - step) +
            designerHeightAt(words, x - step, y - step) +
            designerHeightAt(words, x + step, y + step) +
            designerHeightAt(words, x - step, y + step)) >>
          2;
      }
      const height = Math.max(1, Math.min(15, average + delta));
      words[x * 96 + y] = 0x0f + height;
    }
  }
}

function designerWaterCellIsClear(water, parcelX, parcelY) {
  for (let x = parcelX * 8; x < (parcelX + 1) * 8; x += 1) {
    for (let y = parcelY * 8; y < (parcelY + 1) * 8; y += 1) {
      if (water[x * 96 + y] !== 0) return false;
    }
  }
  return true;
}

function chooseDesignerSettlements(water) {
  for (let attempt = 0; attempt < 4096; attempt += 1) {
    let town;
    let homestead;
    switch (nextSimRandom() & 3) {
      case 0:
        town = { x: (nextSimRandom() & 7) + 2, y: 0 };
        homestead = {
          x: (nextSimRandom() & 7) + 2,
          y: (nextSimRandom() & 3) + 6,
        };
        break;
      case 1:
        town = { x: 11 - (nextSimRandom() & 3), y: (nextSimRandom() & 7) + 2 };
        homestead = {
          x: (nextSimRandom() & 3) + 1,
          y: (nextSimRandom() & 7) + 2,
        };
        break;
      case 2:
        town = { x: (nextSimRandom() & 7) + 2, y: 11 - (nextSimRandom() & 3) };
        homestead = { x: (nextSimRandom() & 7) + 2, y: nextSimRandom() & 3 };
        break;
      default:
        town = { x: 0, y: (nextSimRandom() & 7) + 2 };
        homestead = {
          x: (nextSimRandom() & 3) + 6,
          y: (nextSimRandom() & 7) + 2,
        };
        break;
    }
    if (
      designerWaterCellIsClear(water, town.x, town.y) &&
      designerWaterCellIsClear(water, homestead.x, homestead.y) &&
      designerWaterCellIsClear(water, homestead.x + 1, homestead.y) &&
      designerWaterCellIsClear(water, homestead.x, homestead.y + 1) &&
      designerWaterCellIsClear(water, homestead.x + 1, homestead.y + 1)
    ) {
      return { town, homestead };
    }
  }
  return { town: { x: 7, y: 0 }, homestead: { x: 7, y: 9 } };
}

function stampDesignerWater(water, x, y) {
  if (x < 0 || y < 0) return;
  const index = x * 96 + y;
  if (index >= 0 && index < water.length) water[index] = 1;
}

function carveDesignerRiver(water) {
  if ((nextSimRandom() & 1) !== 0) {
    let x = nextSimSmallRandom(0x5e);
    for (let y = 0; y < 96; y += 1) {
      if (x >= 0 && x < 96) {
        stampDesignerWater(water, x, y);
        stampDesignerWater(water, x + 1, y);
        stampDesignerWater(water, x + 2, y);
      }
      if ((nextSimRandom() & 1) === 0) x -= nextSimRandom() & 1;
      else x += nextSimRandom() & 1;
    }
    return;
  }
  let y = nextSimSmallRandom(0x5e);
  for (let x = 0; x < 96; x += 1) {
    if (y >= 0 && y < 96) {
      stampDesignerWater(water, x, y);
      stampDesignerWater(water, x, y + 1);
      stampDesignerWater(water, x, y + 2);
    }
    if ((nextSimRandom() & 1) === 0) y -= nextSimRandom() & 1;
    else y += nextSimRandom() & 1;
  }
}

function carveDesignerLake(water) {
  const centerX = nextSimSmallRandom(0x18) + nextSimSmallRandom(0x30);
  const centerY = nextSimSmallRandom(0x18) + nextSimSmallRandom(0x30);
  const height = (nextSimRandom() & 7) + 4;
  let currentY = centerY;
  const stampRow = (row) => {
    const random = nextSimRandom() & 3;
    const width = random + row * 2 + 1;
    const startX = centerX + (random >> 1) - (width >> 1);
    for (let x = startX; x < startX + width; x += 1) {
      if (x >= 0 && x < 96 && currentY >= 0 && currentY < 96) {
        stampDesignerWater(water, x, currentY);
      }
    }
    currentY += 1;
  };
  for (let row = 0; row < height; row += 1) stampRow(row);
  for (let row = height; row > 0; row -= 1) stampRow(row);
}

function designerConnectedWaterTile(water, x, y) {
  let mask = 0x0f;
  // FUN_248c_007e treats the map boundary as connected water. This makes
  // rivers meet the edge cleanly instead of receiving inland end caps.
  if (y === 0 || water[x * 96 + y - 1]) mask &= 0x07;
  if (x === 95 || water[(x + 1) * 96 + y]) mask &= 0x0b;
  if (y === 95 || water[x * 96 + y + 1]) mask &= 0x0d;
  if (x === 0 || water[(x - 1) * 96 + y]) mask &= 0x0e;
  return mask;
}

function finalizeDesignerWater(baseWords, water) {
  const update = (x, y, mask) => {
    const index = x * 96 + y;
    const word = baseWords[index];
    const tile = word & 0x07ff;
    const connectedTile = floodedTerrainTiles[mask];
    if (connectedTile < 0) {
      if (!droughtProtectedTile(tile)) {
        baseWords[index] = (word & 0xf800) | 0x19;
      }
    } else if (!droughtProtectedTile(tile)) {
      baseWords[index] =
        (word & 0xf800) | (connectedTile + (nextSimRandom() & 1));
    }
    baseWords[index] |= 0x2000;
  };

  // Exact FUN_248c_0538 x-major scan. An isolated flagged cell expands
  // through a clamped 3x3 neighborhood; mutations are immediately visible
  // to later cells in the same pass.
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      if ((baseWords[x * 96 + y] & 0x2000) === 0) continue;
      const mask = designerConnectedWaterTile(water, x, y);
      if (floodedTerrainTiles[mask] >= 0) {
        update(x, y, mask);
        continue;
      }
      for (let neighborX = x - 1; neighborX <= x + 1; neighborX += 1) {
        for (let neighborY = y - 1; neighborY <= y + 1; neighborY += 1) {
          const clampedX = Math.max(0, Math.min(95, neighborX));
          const clampedY = Math.max(0, Math.min(95, neighborY));
          const neighborMask = designerConnectedWaterTile(
            water,
            clampedX,
            clampedY,
          );
          update(clampedX, clampedY, neighborMask);
          water[clampedX * 96 + clampedY] = 1;
        }
      }
    }
  }
}

function generateNativeTerrain(terrainMoisture, waterFlags) {
  const words = new Uint16Array(96 * 96 * 2);
  for (const [step, mask] of [
    [16, 31],
    [8, 15],
    [4, 7],
    [2, 3],
    [1, 1],
  ]) {
    runDesignerHeightPass(words, step, mask);
  }

  const elevation = new Uint8Array(96 * 96);
  const baseWords = new Uint16Array(96 * 96);
  // 4cf1:003f..0153 visits y first and x second. Vegetation branches make
  // optional primary-RNG calls, so this otherwise equivalent traversal is
  // observable in all later random records and water placement.
  for (let y = 0; y < 96; y += 1) {
    for (let x = 0; x < 96; x += 1) {
      const index = x * 96 + y;
      const height = ((words[index] & 0xff) - 0x0f) & 0x0f;
      elevation[index] = height;
      let tile = 0x0f + terrainMoisture + (height >> 2);
      if (height >= 10 && (nextSimRandom() & 0x0f) < 7) tile = 0x83 + height;
      if (height >= 4 && height < 6 && (nextSimRandom() & 0x0f) < 2) {
        tile = 0x217 + (nextSimRandom() & 3);
      }
      baseWords[index] = tile;
    }
  }

  const smoothedElevation = elevation.slice();
  const elevationAt = (x, y) =>
    smoothedElevation[
      Math.max(0, Math.min(95, x)) * 96 + Math.max(0, Math.min(95, y))
    ];
  // 4cf1:0156..0259 rewrites this byte plane in place in y-major order.
  // Consequently the westward and previous-row samples can already be
  // smoothed while the remaining neighbors retain their raw heights.
  for (let y = 1; y < 96; y += 1) {
    for (let x = 1; x < 96; x += 1) {
      smoothedElevation[x * 96 + y] =
        (elevationAt(x + 1, y - 1) +
          elevationAt(x, y - 1) +
          elevationAt(x - 1, y - 1) +
          elevationAt(x + 1, y + 1) +
          elevationAt(x, y + 1) +
          elevationAt(x - 1, y + 1) +
          elevationAt(x + 1, y) +
          elevationAt(x - 1, y)) >>
        3;
    }
  }

  const environmentRecords = new Uint8Array(12 * 12 * 7);
  for (let x = 0; x < 12; x += 1) {
    for (let y = 0; y < 12; y += 1) {
      const record = (x * 12 + y) * 7;
      environmentRecords[record] = 0xff;
      const randomA = (nextSimRandom() & 0x0f) << 2;
      const randomB = (nextSimRandom() & 0x0f) << 2;
      const randomC = (nextSimRandom() & 0x0f) << 2;
      environmentRecords[record + 2] = randomC;
      environmentRecords[record + 3] = randomB;
      environmentRecords[record + 4] = randomA;
      const sample = smoothedElevation[x * 96 + y];
      environmentRecords[record + 5] = sample << 2;
      environmentRecords[record + 6] = sample << 4;
    }
  }

  const water = new Uint8Array(96 * 96);
  if (waterFlags & 1) carveDesignerRiver(water);
  if (waterFlags & 2) carveDesignerLake(water);
  const cellStates = smoothedElevation.slice();
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const index = x * 96 + y;
      if (water[index]) {
        // The builder stamps natural-water base + 0x10, both water flags,
        // and state byte 1 before invoking the shared retile pass.
        baseWords[index] = 0x3037;
        cellStates[index] = 1;
      }
    }
  }
  finalizeDesignerWater(baseWords, water);

  return {
    baseWords,
    elevation: smoothedElevation,
    cellStates,
    environmentRecords,
    water,
  };
}

function prepareRegionTerrain() {
  if (regionTerrainPrepared) return;
  // 850f:0174 -> 0b9e -> ovl19_073a runs before the title/region selector,
  // even when its terrain will be discarded by an authored SSM load. It
  // does not run the separate ovl07_09d6 settlement-selection callback.
  regionTerrain = generateNativeTerrain(
    state.soilMoisture,
    nativeTerrainWaterFlags,
  );
  regionTerrainPrepared = true;
}

function enterNewGameRegion() {
  // FUN_850f_0f2c resets the water mask to zero, but not DS:0164 moisture
  // or any RNG/history words. Initial process data instead starts at mask1.
  nativeTerrainWaterFlags = 0;
  regionTerrainPrepared = false;
  regionTerrain = null;
  prepareRegionTerrain();
  stage = "region";
}

function generateDesignerWorld(terrainMoisture = designerRuntime.rainfall * 4) {
  state.soilMoisture = terrainMoisture;
  const terrain = generateNativeTerrain(
    terrainMoisture,
    designerRuntime.waterFlags,
  );
  return selectDesignerSettlements(terrain);
}

function selectDesignerSettlements(terrain) {
  const settlements = chooseDesignerSettlements(terrain.water);
  designerRuntime = {
    ...designerRuntime,
    ...terrain,
    town: settlements.town,
    homestead: settlements.homestead,
    generated: true,
  };
  generatedWorldBytes = buildDesignerSfm();
  return designerRuntime;
}

function designerTemplateCell(bytes, x, y) {
  const offset = saveData.format.displayCellMapOffset + (x * 96 + y) * 5;
  return bytes.subarray(offset, offset + 5);
}

function writeDesignerWeather(bytes) {
  const tables = regionData.climate.tables;
  const values = [
    tables.windSpeed[designerRuntime.windSpeed],
    tables.rainfall[designerRuntime.rainfall],
    tables.temperature[designerRuntime.temperature],
  ];
  let record = 0;
  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (let month = 0; month < 12; month += 1) {
      for (let week = 0; week < 4; week += 1) {
        const offset = saveData.format.weatherRecordOffset + record * 3;
        for (let category = 0; category < 3; category += 1) {
          bytes[offset + category] =
            values[category][cycle][month][week] & 0xff;
        }
        record += 1;
      }
    }
  }
}

function buildDesignerSfm() {
  if (!designerRuntime?.generated || !saveData?.designerTemplate?.stateBase64)
    return null;
  const template = decodeState(saveData.designerTemplate.stateBase64);
  const bytes = template.slice();
  const format = saveData.format;
  const view = stateView(bytes);
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const index = x * 96 + y;
      const offset = format.displayCellMapOffset + index * 5;
      view.setUint16(offset, designerRuntime.baseWords[index], true);
      view.setUint16(offset + 2, 0, true);
      bytes[offset + 4] = designerRuntime.cellStates[index];
    }
  }

  const { homestead, town } = designerRuntime;
  const homesteadOriginX = homestead.x * 8;
  const homesteadOriginY = homestead.y * 8;
  const homesteadHouse = [
    [0x4f, 0x4f, 0x4f],
    [0xfc, 0xfd, 0x4f],
    [0x124, 0x125, 0x4f],
  ];
  for (let localX = 0; localX < 24; localX += 1) {
    for (let localY = 0; localY < 24; localY += 1) {
      const worldX = homesteadOriginX + localX;
      const worldY = homesteadOriginY + localY;
      const target = designerTemplateCell(bytes, worldX, worldY);
      const targetView = stateView(target);
      targetView.setUint16(2, 0x0800, true);
      let tile = null;
      if (localY === 0) {
        if (localX === 0) tile = 0xb4;
        else if (localX === 23) tile = 0xb8;
        else tile = 0xb2;
      } else if (localY === 23) {
        if (localX === 0) tile = 0xb3;
        else if (localX === 23) tile = 0xb6;
        else tile = 0xb2;
      } else if (localX === 0 || localX === 23) {
        tile = 0xb1;
      } else if (localX <= 3 && localY <= 3) {
        tile = homesteadHouse[localY - 1][localX - 1];
      }
      // Settlement selection guarantees only the leading 2x2 parcels are
      // dry, so the outer edge of this 3x3 ownership block can cross a
      // river. DOS marks those cells as owned but skips its fence writer,
      // preserving the complete connected-water base word.
      const isPerimeterFence =
        tile !== null &&
        tile >= linearTerrainTools.Fence.straightTile &&
        tile <= linearTerrainTools.Fence.straightTile + 10;
      const isNaturalWater = designerRuntime.water[worldX * 96 + worldY] !== 0;
      if (tile !== null && !(isPerimeterFence && isNaturalWater)) {
        targetView.setUint16(0, tile, true);
      }
    }
  }

  const townOriginX = town.x * 8;
  const townOriginY = town.y * 8;
  // Native type-zero town after the shared road connector has resolved the
  // two crossing streets. Null entries are replaced with the local terrain
  // state band (4753:0138..0162), rather than copied from another save.
  const townRoadTiles = [
    [0xa4, 0xa2, 0xa2, 0xa2, 0xaa, 0xa2, 0xa2, 0xa2],
    [0xa1, null, null, null, 0xa1, null, null, null],
    [0xa1, null, null, null, 0xa1, null, null, null],
    [0xa1, null, null, null, 0xa1, null, null, null],
    [0xa5, 0xa2, 0xa2, 0xa2, 0xab, 0xa2, 0xa2, 0xa2],
    [0xa1, null, null, null, 0xa1, null, null, null],
    [0xa1, null, null, null, 0xa1, null, null, null],
    [0xa1, null, null, null, 0xa1, null, null, null],
  ];
  for (let localX = 0; localX < 8; localX += 1) {
    for (let localY = 0; localY < 8; localY += 1) {
      const target = designerTemplateCell(
        bytes,
        townOriginX + localX,
        townOriginY + localY,
      );
      const targetView = stateView(target);
      const existingTile = targetView.getUint16(0, true) & 0x07ff;
      if (![0x47, 0x48, 0x6f, 0x70].includes(existingTile)) {
        const roadTile = townRoadTiles[localY][localX];
        targetView.setUint16(0, roadTile ?? 0x0f + (target[4] & 0x0f), true);
      }
      targetView.setUint16(2, targetView.getUint16(2, true) | 0x4000, true);
    }
  }

  bytes.set(designerRuntime.environmentRecords, format.environmentalGridOffset);
  for (let x = 0; x < 12; x += 1) {
    for (let y = 0; y < 12; y += 1) {
      const record = format.environmentalGridOffset + (x * 12 + y) * 7;
      if (x === town.x && y === town.y) {
        bytes[record] = 0xa0;
        bytes[record + 1] = 2;
      } else if (
        x >= homestead.x &&
        x < homestead.x + 3 &&
        y >= homestead.y &&
        y < homestead.y + 3
      )
        bytes[record + 1] = 1;
    }
  }

  writeDesignerWeather(bytes);

  // The serialized 16-slot table holds town traffic. Before
  // creating it, native startup builds the first weather forecast and uses
  // one primary-LFSR value for every non-rain/snow day. The default climate
  // consumes five values, but rainfall levels 0..3 consume 6,5,4,5. Keeping
  // this look-ahead calculation side-effect free makes repeated designer
  // redraws identical; startGame advances the live state after the real
  // forecast transition.
  let trafficRandomState = simRandomState;
  const nextTrafficRandom = () => {
    for (let round = 0; round < 8; round += 1) {
      const feedback =
        ((trafficRandomState >> 1) ^ (trafficRandomState >> 2)) & 1;
      trafficRandomState =
        ((trafficRandomState >>> 1) | (feedback << 15)) & 0xffff;
    }
    return trafficRandomState;
  };
  const firstForecastIndex = 3 * format.weatherWeeksPerMonth + 1;
  const firstForecastRecord =
    format.weatherRecordOffset + firstForecastIndex * format.weatherRecordSize;
  const firstForecastPrecipitation = Math.max(
    0,
    Math.min(7, bytes[firstForecastRecord + format.weatherPrecipitationOffset]),
  );
  const firstForecastTemperatureByte =
    bytes[firstForecastRecord + format.weatherTemperatureOffset];
  const firstForecastTemperature =
    (firstForecastTemperatureByte & 0x80) !== 0
      ? firstForecastTemperatureByte - 0x100
      : firstForecastTemperatureByte;
  const firstForecastAnchor = firstForecastTemperature < 33 ? 4 : 3;
  const firstForecastRandomCalls = weatherForecastTemplate(
    firstForecastTemperature,
    firstForecastPrecipitation,
  ).filter((condition) => condition !== firstForecastAnchor).length;
  for (let skipped = 0; skipped < firstForecastRandomCalls; skipped += 1)
    nextTrafficRandom();
  const featureCount = 8;
  bytes[format.featureCountOffset] = featureCount;
  for (let slot = 0; slot < format.featureRecordCount; slot += 1) {
    const offset = format.featureRecordOffset + slot * format.featureRecordSize;
    if (slot >= featureCount) {
      bytes.fill(0, offset, offset + format.featureRecordSize);
      continue;
    }
    view.setUint16(offset, 3, true);
    view.setUint16(offset + 2, townOriginX, true);
    view.setUint16(offset + 4, townOriginY, true);
    view.setUint16(offset + 6, ((nextTrafficRandom() & 3) << 8) | 4, true);
  }

  view.setInt32(format.fundsOffset, 40000, true);
  const newGameDate = nativeNewGameDate();
  // Root startup copies the DOS date structure's weekday byte into the
  // hidden day word. It does not start every generated farm on Sunday.
  view.setUint16(format.dayIndexOffset, newGameDate.getDay(), true);
  view.setUint16(format.weekIndexOffset, 0, true);
  // FUN_850f_0f2c's 1992 reset is replaced by the DOS system year on the
  // newly generated-game path. Authored scenarios retain their saved year.
  view.setUint16(format.yearOffset, newGameDate.getFullYear(), true);
  view.setUint16(format.monthIndexOffset, 3, true);
  view.setUint16(format.startupCoordinateReducedXOffset, homestead.x, true);
  view.setUint16(format.startupCoordinateReducedYOffset, homestead.y, true);
  view.setUint16(format.startupCoordinateXOffset, homestead.x * 8, true);
  view.setUint16(format.startupCoordinateYOffset, homestead.y * 8, true);
  view.setUint16(format.townCenterXOffset, town.x, true);
  view.setUint16(format.townCenterYOffset, town.y, true);
  bytes[format.townCursorXOffset] = town.x;
  bytes[format.townCursorYOffset] = town.y;
  return bytes;
}

function enterTerrainDesigner() {
  prepareRegionTerrain();
  const levels = regionLevels();
  designerRuntime = {
    rainfall: levels.rainfall,
    temperature: levels.temperature,
    windSpeed: levels.windSpeed,
    waterFlags: nativeTerrainWaterFlags,
    generated: false,
  };
  generatedWorldBytes = null;
  // ovl06's Design branch does not regenerate terrain. ovl07_0000 opens
  // the preview, whose painter (0bd6) selects settlements on the landscape
  // prepared before the selector. Only Generate runs the terrain pass again.
  selectDesignerSettlements(regionTerrain);
  stage = "designer";
}

function adjustDesignerClimate(name, delta) {
  if (!designerRuntime) return;
  designerRuntime[name] = Math.max(
    0,
    Math.min(3, designerRuntime[name] + delta),
  );
}

function drawDesignerToggle(x, y, width, height, active) {
  if (!active) return;
  // 4049:081e repaints the authored raised control as a stepped two-pixel
  // depressed bevel. Its second row and final two columns/rows deliberately
  // shorten by one pixel rather than forming a simple rectangular border.
  context.fillStyle = "#828282";
  context.fillRect(x + 1, y + 1, width - 3, 1);
  context.fillRect(x + 1, y + 2, width - 4, 1);
  context.fillRect(x + 1, y + 3, 2, height - 5);
  context.fillRect(x + 1, y + height - 2, 1, 1);
  context.fillStyle = "#ffffff";
  context.fillRect(x + width - 1, y + 2, 1, 1);
  context.fillRect(x + width - 2, y + 3, 2, height - 5);
  context.fillRect(x + 3, y + height - 2, width - 3, 1);
  context.fillRect(x + 2, y + height - 1, width - 2, 1);
}

function drawDesigner() {
  context.drawImage(images.designer, 0, 0);
  if (!designerRuntime?.generated) return;
  for (let x = 0; x < 96; x += 1) {
    for (let y = 0; y < 96; y += 1) {
      const index = x * 96 + y;
      const tile = designerRuntime.baseWords[index] & 0x07ff;
      // 4049:0bd6 samples tile coordinates 0/8 on each axis. Canvas
      // downscaling 16x16 to 2x2 instead samples the pixel centers 4/12.
      for (let sampleY = 0; sampleY < 2; sampleY += 1) {
        for (let sampleX = 0; sampleX < 2; sampleX += 1) {
          context.drawImage(
            images.tileSheet,
            (tile % 20) * 16 + sampleX * 8,
            Math.floor(tile / 20) * 16 + sampleY * 8,
            1,
            1,
            264 + x * 2 + sampleX,
            72 + y * 2 + sampleY,
            1,
            1,
          );
        }
      }
    }
  }
  for (const [level, y, color] of [
    [designerRuntime.rainfall, 105, "#c30404"],
    [designerRuntime.temperature, 163, "#fff304"],
    [designerRuntime.windSpeed, 222, "#0000c3"],
  ]) {
    context.fillStyle = "#000000";
    context.fillRect(160, y, 80, 10);
    context.fillStyle = color;
    // The native 7f14 meter maps its level*27 input into a 72-pixel
    // interior, exposing exactly 24 pixels for each of the three levels.
    context.fillRect(160, y, level * 24, 10);
  }
  drawDesignerToggle(176, 258, 48, 24, (designerRuntime.waterFlags & 1) !== 0);
  drawDesignerToggle(176, 285, 48, 24, (designerRuntime.waterFlags & 2) !== 0);
  drawText(
    "T",
    264 + designerRuntime.town.x * 16,
    72 + designerRuntime.town.y * 16,
  );
  drawText(
    "H",
    264 + designerRuntime.homestead.x * 16,
    72 + designerRuntime.homestead.y * 16,
  );
}

function outline(x, y, color) {
  context.fillStyle = color;
  context.fillRect(x, y, 17, 1);
  context.fillRect(x, y + 16, 17, 1);
  context.fillRect(x, y + 1, 1, 15);
  context.fillRect(x + 16, y + 1, 1, 15);
}

function regionSelectionOutline(x, y) {
  // The selector uses the old indexed XOR-15 rectangle primitive, not a
  // solid green stroke. Tan happens to become green, while an overlapping
  // yellow scenario frame becomes dark gray and blue coastline becomes
  // dark green. Horizontal strokes begin at x+1, leaving both left
  // endpoints untouched.
  const palette = [
    [0, 0, 0],
    [255, 243, 4],
    [142, 199, 227],
    [195, 4, 4],
    [243, 117, 105],
    [0, 0, 166],
    [0, 0, 235],
    [195, 158, 85],
    [0, 170, 4],
    [0, 125, 4],
    [130, 65, 4],
    [146, 113, 56],
    [195, 195, 195],
    [130, 130, 130],
    [65, 65, 65],
    [255, 255, 255],
  ];
  let pixels = null;
  try {
    pixels =
      typeof context.getImageData === "function"
        ? context.getImageData(x, y, 17, 17)
        : null;
  } catch (_error) {
    pixels = null;
  }
  if (pixels?.data && typeof context.putImageData === "function") {
    const targets = [];
    for (let pixelX = 1; pixelX <= 16; pixelX += 1) {
      targets.push([pixelX, 0], [pixelX, 16]);
    }
    for (let pixelY = 1; pixelY < 16; pixelY += 1) {
      targets.push([0, pixelY], [16, pixelY]);
    }
    for (const [pixelX, pixelY] of targets) {
      const offset = (pixelY * 17 + pixelX) * 4;
      const index = palette.findIndex(
        (color) =>
          color[0] === pixels.data[offset] &&
          color[1] === pixels.data[offset + 1] &&
          color[2] === pixels.data[offset + 2],
      );
      if (index < 0) continue;
      const color = palette[index ^ 15];
      pixels.data[offset] = color[0];
      pixels.data[offset + 1] = color[1];
      pixels.data[offset + 2] = color[2];
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, x, y);
    return;
  }

  // Test doubles without framebuffer access retain the common tan->green
  // path; production canvases always use the indexed compositor above.
  context.fillStyle = "#00aa04";
  context.fillRect(x + 1, y, 16, 1);
  context.fillRect(x + 1, y + 16, 16, 1);
  context.fillRect(x, y + 1, 1, 15);
  context.fillRect(x + 16, y + 1, 1, 15);
}

function drawRegion() {
  context.drawImage(images.region, 0, 0);
  const levels = regionLevels();
  for (const [level, y] of [
    [levels.rainfall, 101],
    [levels.temperature, 149],
    [levels.windSpeed, 197],
  ]) {
    context.fillStyle = "#0000eb";
    context.fillRect(120, y, level * 32, 10);
  }
  for (const [x, y] of scenarioMarkers)
    outline(248 + x * 16, 40 + y * 16, "#fff304");
  regionSelectionOutline(
    248 + selectedRegion.gridX * 16,
    40 + selectedRegion.gridY * 16,
  );
}
