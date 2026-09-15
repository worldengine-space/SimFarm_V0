// Canvas setup, native timing constants, catalogs, and UI definitions.
// This section is assembled into the shared private game closure by scripts/build.mjs.

const WIDTH = 640;
const HEIGHT = 480;
const canvas = document.querySelector("#simfarm");
const saveFileInput = document.getElementById?.("simfarm-save-file") || null;
const context = canvas.getContext("2d", { alpha: false });
context.imageSmoothingEnabled = false;

const scenarioMarkers = [
  [1, 3],
  [3, 6],
  [11, 6],
  [9, 7],
  [0, 8],
  [15, 8],
  [1, 11],
  [13, 11],
];
// 3f18:011f..0161 paints exactly eight authored SSM markers. The current
// selection (initially 2,8) is a separate XOR frame; unmarked cells start
// a procedurally generated farm.
const scenarioFileIndexes = [2, 3, 5, 4, 0, 7, 1, 6];
const scenarioScrollbarStarts = [
  [160, 112],
  [240, 192],
  [448, 256],
  [528, 304],
  [576, 192],
  [576, 304],
  [576, 416],
  [384, 192],
];
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
// DS:13a0 is SimFarm's own 50 Hz wrapping clock, not the 18.2 Hz BIOS
// day counter. Speed callback 4aac:00d2 writes these exact thresholds.
const nativeClockTickMilliseconds = 20;
const speedTickThresholds = {
  Slow: 0x280,
  Normal: 0x100,
  Fast: 0x80,
  Ultra: 0x40,
};
const dayIntervalForSpeed = (speed) =>
  speed === "Pause"
    ? Number.POSITIVE_INFINITY
    : (speedTickThresholds[speed] + 1) * nativeClockTickMilliseconds;
// ovl05:0900 advances the airplane after two 50 Hz game-clock ticks.
const dusterFlightInterval = 2 * nativeClockTickMilliseconds;
// ALLTILES' automatic river/irrigation frames advance only when the
// wrapping game-clock delta is strictly greater than eight ticks.
const mapTileAnimationIntervalTicks = 8;
// Speed callback 4aac:00d2 also controls the animal dispatcher through
// DS:2286. Pause preserves the most recently selected numeric threshold.
const livestockTickThresholds = {
  Slow: 0x20,
  Normal: 0x10,
  Fast: 0x08,
  Ultra: 0x01,
};
// The same dispatcher rebuilds its four herd targets only after more than
// 0x140 game-clock ticks. The extra tick preserves the native comparison.
const livestockHerdInterval = (0x140 + 1) * nativeClockTickMilliseconds;
const townParcelAcquisitionCost = 15000;
const linearTerrainTools = {
  "Paved Road": { cost: 30, straightTile: 0x96, horizontalTile: 0x97 },
  "Dirt Road": { cost: 20, straightTile: 0xa1, horizontalTile: 0xa2 },
  Fence: {
    cost: 50,
    straightTile: 0xb1,
    horizontalTile: 0xb2,
    requiresOverlay: true,
  },
  "Irrigation Ditch": { cost: 80, straightTile: 0x57, horizontalTile: 0x58 },
};
const bridgeConstructionCost = 40;
const bridgeConnectionRule = {
  straightTile: 0xac,
  tileCount: 2,
  suppressReconnect: true,
};
const dryDitchConnectionRule = { straightTile: 0x62, tileCount: 11 };
const ditchValveConnectionRule = {
  straightTile: 0x7a,
  tileCount: 4,
  suppressReconnect: true,
};
const fenceGateConnectionRule = {
  straightTile: 0xbc,
  tileCount: 4,
  suppressReconnect: true,
};
const connectionTileOffsets = [0, 0, 1, 2, 0, 0, 3, 4, 1, 5, 1, 6, 7, 8, 9, 10];
const machineOverlayStarts = new Map([
  [0, 0x350],
  [1, 0x354],
  [2, 0x358],
  [3, 0x364],
  [4, 0x35c],
  [5, 0x36c],
  [7, 0x380],
]);
const structureBaseTileStarts = new Map([
  [0x40, 0x1b8],
  [0x41, 0x1b9],
  [0x42, 0x1bd],
  [0x43, 0x1c3],
  [0x44, 0x1cc],
  [0x45, 0x1d5],
  [0x48, 0x1e1],
]);
const openableStorageStructureIds = new Set([0x41, 0x43, 0x45]);
const structurePlacementOffsets = new Map([
  [0x40, [0, 0]],
  [0x41, [0, 0]],
  [0x42, [0, -1]],
  [0x43, [0, -1]],
  [0x44, [0, -1]],
  [0x45, [-1, 0]],
  [0x46, [0, 0]],
  [0x47, [0, -2]],
  [0x48, [0, 0]],
]);
const livestockInitialTiles = new Map([
  [0xa0, 0x3b4],
  [0xa1, 0x3c2],
  [0xa2, 0x3d2],
  [0xa3, 0x3e2],
]);
const livestockRecordValues = new Map([
  [0xa0, 48],
  [0xa1, 40],
  [0xa2, 44],
  [0xa3, 24],
]);
// The four compact tables at 8d91:2288..229f drive every livestock
// lifecycle threshold. Ages and gestation are measured in weeks; needs
// advance on odd hidden calendar days.
const livestockSimulationDefinitions = new Map([
  [
    0xa0,
    {
      lifespan: 960,
      maturity: 192,
      gestation: 48,
      foodIncrement: 8,
      waterIncrement: 2,
      foodMaximum: 160,
      waterMaximum: 50,
      sounds: ["horse1"],
    },
  ],
  [
    0xa1,
    {
      lifespan: 960,
      maturity: 80,
      gestation: 40,
      foodIncrement: 8,
      waterIncrement: 2,
      foodMaximum: 160,
      waterMaximum: 35,
      sounds: ["cow1", "cow2"],
    },
  ],
  [
    0xa2,
    {
      lifespan: 720,
      maturity: 32,
      gestation: 44,
      foodIncrement: 4,
      waterIncrement: 1,
      foodMaximum: 80,
      waterMaximum: 56,
      sounds: ["pig"],
    },
  ],
  [
    0xa3,
    {
      lifespan: 480,
      maturity: 12,
      gestation: 24,
      foodIncrement: 2,
      waterIncrement: 1,
      foodMaximum: 64,
      waterMaximum: 56,
      sounds: ["sheep1", "sheep2"],
    },
  ],
]);
const livestockDirectionDeltas = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
const livestockSpriteDirections = [4, 5, 6, 7, 0, 1, 2, 3];
const livestockFenceStart = 0xb1;
const livestockFenceCount = 0x0b;
const livestockSpecialDurationTicks = 0x280;
const baseLandValue = 15000;
const cardinalNeighbors = [
  { dx: 0, dy: -1, bit: 1 },
  { dx: 1, dy: 0, bit: 2 },
  { dx: 0, dy: 1, bit: 4 },
  { dx: -1, dy: 0, bit: 8 },
];
const paletteTools = [
  {
    name: "Move Object",
    message: "Choose an object to move.",
    messageRecord: 6,
    x: 16,
    y: 64,
  },
  { name: "Examine", message: "Examine", messageRecord: 64, x: 40, y: 64 },
  {
    name: "Paved Road",
    message: "Paved Road",
    messageRecord: 35,
    cost: 30,
    x: 16,
    y: 88,
  },
  {
    name: "Dirt Road",
    message: "Dirt Road",
    messageRecord: 36,
    cost: 20,
    x: 40,
    y: 88,
  },
  {
    name: "Fence",
    message: "Fence",
    messageRecord: 32,
    cost: 50,
    x: 16,
    y: 112,
  },
  {
    name: "Fence Gate",
    message: "Fence Gate",
    messageRecord: 33,
    cost: 75,
    x: 40,
    y: 112,
  },
  {
    name: "Irrigation Ditch",
    message: "Irrigation Ditch",
    messageRecord: 40,
    cost: 80,
    x: 16,
    y: 136,
  },
  {
    name: "Irrigation Ditch Valve",
    message: "Irrigation Ditch Valve",
    messageRecord: 25,
    cost: 35,
    x: 40,
    y: 136,
  },
  {
    name: "Livestock Feed",
    message: "Livestock Feed",
    messageRecord: 41,
    cost: 100,
    x: 16,
    y: 160,
  },
  {
    name: "Water Trough",
    message: "Water Trough",
    messageRecord: 34,
    cost: 15,
    x: 40,
    y: 160,
  },
  {
    name: "Trees - Windbreaks",
    message: "Trees - Windbreaks",
    messageRecord: 37,
    cost: 10,
    x: 16,
    y: 184,
  },
  {
    name: "Bulldoze",
    message: "Bulldoze",
    messageRecord: 63,
    cost: 25,
    x: 40,
    y: 184,
  },
];
const mapModeNames = [
  "Property",
  "Weeds",
  "Soil Toxicity",
  "Groundwater",
  "Soil Nutrients",
  "Field Profit",
  "Disease",
  "Pests",
];
const conditionMapRecordOffsets = new Map([
  [1, 21], // Weeds
  [2, 32], // Soil Toxicity
  [4, 28], // Soil Nutrients (cached first nutrient plane)
  [6, 22], // Disease
  [7, 20], // Pests
]);
// The original map legend is also the renderer's 32-entry ordered-dither
// ramp. Each four-character string is one 2x2 cell in TL,TR,BL,BR order.
const conditionMapDither = [
  "GGGG",
  "GGGG",
  "GGGG",
  "GGYG",
  "GYGG",
  "GGGY",
  "GGYG",
  "YGGY",
  "YGgY",
  "YGgY",
  "YggY",
  "YGYY",
  "YgYY",
  "YYgY",
  "YgYY",
  "YYYY",
  "YYYY",
  "YYYY",
  "YYYY",
  "YYPY",
  "YPYY",
  "YYPY",
  "YPPY",
  "YYPY",
  "PYYP",
  "PYYP",
  "PYYP",
  "PYPP",
  "PPYP",
  "PYPP",
  "PPPP",
  "PPPP",
];
// FAR_MAPC.MBM is the original 960-entry far-map tile table. Each tile is
// two bytes: one bit-interleaved 4-bit palette pair for each of its two
// rows. Keeping the source bytes here lets edited and generated maps use
// the executable's exact 2x2 overview art rather than scaled 16x16 tiles.
const farMapTileBytes = decodeState(
  "AAAAMwAzAAAAAAUFAAUAAAAAAM8ABQAAIgAAAADMs3Ozc7Nzs3Pzs/Pz8/Pz8/Pz0+Pz49PD08Pz08PDw8PDwzczAwMzMyIANzNRtwAAljyWPJY9lj08PDw8PGw8PDw8PDyWbJZsljyWnJY8lmw8PMzMljyWPJfMl8yWPJY8l8yXzMZuxm6WPJY88/NR8fPzUfHzplHxAAAAAMPDw8PDw/Nz8+PDwy8vLy8vPj4+oqLjACKTs6KioqIRogBzAKIA4wCiALbm4wBmk7Pm5rbmEeYAcxTmRONE5hRQ86R7UPO1WfLzoKI3Mzc2NzM/Mz8zLSotKuOL49qnoqeiM3PzcydzM3Pzc+Pj87fj4/O347fzt/Oj4zfz4/O34zfzY+M3w5fDw+M3AAAAACJQZ2czz2dnM2dnZ8/PZ88zz8/PM89nz3MzM/Pzc/PzczNz8/Pzs/Pz83Pz8/MqFSoVAADzRfMU9+czz3eXc+f353ef959jz/fPM8/3z6fzp7MzOzM7MzvnswAFAAU3MzczABUAUGXVgJHAhP/rruoDBwOPA89l1Q/goiqiIqIzADMAM6IzsyovL5PTcYqzAMNT07Oz85vD46NB0/Pj88Pj48Pb68N/wz/Dcw8P4AAAPzMAAAAFBQUPDwpPABUATwCKABUArwAKABUADwCK4/PTZmvjl4Pj48PT44LTezdvfw+35wWih4/DKuM78/ELiy6Ky8fDoMsXR8zDh3Mw4+PTn2O3wz8FUQ8/TzcVOw9RCrcVeg9RCnIVOw9RCrfz024qx4DPEWeTzzOit3sVIi/fHyc/oioFKxWjxzozb5eXnz/HUwAjGrU/P6dniD/zw58/ouMV5s8Az0HPTc8qPw9RpOenz7fPKs8AzzDPAM+Szz/PL883zz/PP89rzyrPAM/bz9rP5c/Kz5TP/8+Kzy7PP8/bz0/Pb88qPx0AAAAAAAAAAAAARUEITQUvIjMPP6R658enpwoKEG8wHyBPkpJK7x9lpKRKDwAAl5efP50/ztsqnyoVn58AnyoVmpoMAD8Vzts/n58VIjOzPwAAAAAAAAAAAAABARkXMz8nQSdEBUFvP7PPIgBvKg8VH89Dbyqfa2+1BT8AAJeXe/8F/wDLikMAggDPis8AnwCanwA/FS/LigIAwwAAAAAAAAAAAAAAAAAAACJF87efT89vzz/zZ/PPcz83Is8AnwDzt7cP8z+npw8PPz+npw/PPwoitzAwPDzMzMPDw8PDw8PBwsPDwsPBwcLBQsFCgULBwIHAwEKBwMDAwMDAwMDAwEiEwMBIhEjASEiESIRIhEgMDIRIDAwMDAwAc/PzABXz8/Pzc/M/AHPz8/MVEXPzc/Pzs/8zc3Ozt7dnP88VRT/P87ciRQAAAAAjFycP/zDXg4OHAACCJidEPgXnMw/3D/cPog/3D/fzgvM38+fzovOj8wOiA7MD8wPzA6MDswPzA/MDogIzovOz87Pzs7Mz86LzoqKzogDz4/MRt6Iil/Pn8zezogCC87PzM6KncwDzs/NRs6JRAPOz8xGzomcz86Lzgqa3WrHzo/MV4+MqQfOz8xWzpgAR82PzQ7OzCKDzo/Nrs7cAIvO38wP3AxsD8KDwIqC1KgDw5fDP9bSebPC18J/1tVWf8KDwz/Wgnz/woPA3oKAVM/C18JOgsbMV8LDw/7CwKirwsPC/9bS/PfPn8/Cnt1oP8+cAAAAA8xHzRfOioqI3AKJzIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAIgAiACIAiACIAIgAiACIAIgAiACIACIAIgAiAKJzonOic6JzonPzQfMV8wG3AbcBtwG3UbcR8+Pz4/Nj4zfjhuOioqLzoiIAIgAiAKJzonOic6JzonMiACIAIgCic6JzonOic6JzIgAiACIAonOic6JzonOic/Pz86fz8/Pz8/Pzo/Oi87PzovPz86fzt/Oi86LzovOnA1MDBwNTA1MDUwMDAwIDEwMCA1MDBwMXAwIDAgMCAwfwpQAAAFAA8ADwAO8AKgDjAAAA4wCnAKfz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz",
);
const farMapPalette = [
  [0, 0, 0],
  [255, 243, 4],
  [142, 199, 227],
  [195, 4, 4],
  [243, 117, 105],
  [0, 0, 166],
  [0, 0, 235],
  [146, 113, 56],
  [0, 170, 4],
  [0, 125, 4],
  [130, 65, 4],
  [146, 113, 56],
  [195, 195, 195],
  [130, 130, 130],
  [65, 65, 65],
  [255, 255, 255],
];
// CURSORS.TIL stores six monochrome cursor pairs. The first tile in each
// pair is the opacity mask and the second selects white (1) or black (0)
// for opaque pixels. These row words are a lossless transcription of the
// original 192x16 resource; bit zero is the leftmost pixel.
const nativeCursorPairs = [
  [
    [
      0x3600, 0x3fc0, 0x3fe0, 0x7ff0, 0x7ff8, 0x3ff8, 0x1ff8, 0x0ff8, 0x07f8,
      0x07fc, 0x07fc, 0x0ffc, 0x7ffe, 0xfffe, 0xfffe, 0x00ff,
    ],
    [
      0xc9ff, 0xd63f, 0xdb5f, 0xadaf, 0xb6d7, 0xdb77, 0xedf7, 0xf7f7, 0xfbf7,
      0xfbfb, 0xfbfb, 0xf7fb, 0x8ffd, 0x7ffd, 0x00fd, 0xff7e,
    ],
  ],
  [
    [
      0x00c0, 0x07e0, 0x0ff0, 0x1ff8, 0x3ff8, 0x3ff8, 0x3ff8, 0x7ff8, 0x73fc,
      0x71fc, 0x71fe, 0x79fe, 0x3fff, 0x3fff, 0x1fff, 0x007f,
    ],
    [
      0xff3f, 0xf85f, 0xf7af, 0xe0d7, 0xdf67, 0xc1b7, 0xdef7, 0xb3f7, 0xadfb,
      0xaefb, 0x8efd, 0xb6fd, 0xd9fe, 0xdfff, 0xe07f, 0xffbf,
    ],
  ],
  [
    [
      0x00f8, 0x01fc, 0x03fe, 0x07ff, 0x07ff, 0x07ff, 0x07ff, 0x07ff, 0x03ff,
      0x0ffe, 0x1ffc, 0x3ef8, 0x7c00, 0xf800, 0xf000, 0xe000,
    ],
    [
      0xff07, 0xfefb, 0xfd8d, 0xfb7e, 0xfafe, 0xfafe, 0xfbfe, 0xfb7e, 0xfdfc,
      0xf0f9, 0xe803, 0xd107, 0xa3ff, 0x47ff, 0x8fff, 0x1fff,
    ],
  ],
  [
    [
      0x0000, 0x0000, 0x000f, 0xfc1f, 0xfe3f, 0x3f3f, 0x07fe, 0x01e0, 0x07fe,
      0x3f3f, 0xfe3f, 0xfc1f, 0x000f, 0x0000, 0x0000, 0x0000,
    ],
    [
      0xffff, 0xffff, 0xfff0, 0x03e6, 0x3dce, 0xc6d8, 0xf901, 0xfe1f, 0xf901,
      0xc6d8, 0x3dce, 0x03e6, 0xfff0, 0xffff, 0xffff, 0xffff,
    ],
  ],
  [
    [
      0x03c0, 0x03c0, 0x3ff0, 0x3ffc, 0x3ffe, 0x3ffe, 0x0ffe, 0x3ffe, 0x7ffc,
      0x7ff0, 0x7ffc, 0x7ffc, 0x3ffc, 0x1ffc, 0x03c0, 0x03c0,
    ],
    [
      0xfc3f, 0xfdbf, 0xc18f, 0xdff3, 0xdff9, 0xc19d, 0xf19d, 0xcff9, 0x9ff3,
      0xb98f, 0xb983, 0x9ffb, 0xcffb, 0xe183, 0xfdbf, 0xfc3f,
    ],
  ],
  [
    [
      0x0010, 0x0040, 0x0324, 0x0200, 0x0750, 0x0f84, 0x1fc8, 0x1fc0, 0x1fc0,
      0x1fc0, 0x1fc0, 0x1fc0, 0x1fc0, 0x1fc0, 0x1fc0, 0x1fc0,
    ],
    [
      0xffff, 0xffff, 0xfcff, 0xfdff, 0xf8ff, 0xf37f, 0xe7bf, 0xe03f, 0xebbf,
      0xebbf, 0xebbf, 0xebbf, 0xebbf, 0xebbf, 0xebbf, 0xe03f,
    ],
  ],
];
// The ordinary arrow belongs to the UI driver rather than CURSORS.TIL.
// `x` is black, `#` white, and `.` transparent.
const nativeArrowCursor = [
  "xx..............",
  "x#x.............",
  "x##x............",
  "x###x...........",
  "x####x..........",
  "x#####x.........",
  "x######x........",
  "x#######x.......",
  "x########x......",
  "x#########x.....",
  "x#####xxxxx.....",
  "x#xxx##x........",
  "xx..x##x........",
  ".....x##x.......",
  ".....x##x.......",
  "......xxx.......",
];
const conditionMapPaletteIndexes = { G: 9, g: 8, Y: 1, P: 4 };
const overviewHomesteadGlyph = [
  ".00..00.",
  ".00..00.",
  ".00..00.",
  ".000000.",
  ".00..00.",
  ".00..00.",
  ".00..00.",
  "........",
];
const fieldCropNames = [
  "Corn",
  "Wheat",
  "Barley",
  "Apples",
  "Oats",
  "Rice",
  "Sorghum",
  "Soybeans",
  "Cotton",
  "Onions",
  "Tomatoes",
  "Lettuce",
  "Carrots",
  "Strawberries",
  "Sugar Beets",
  "Peanuts",
];
// CRP bytes decoded from the original 128-byte name/stat record. These are
// the fields used by the Schedule routine at 73ac:11da; the key is the
// eight-character DOS crop filename stored in each scenario's crop slots.
const cropSimulationDefinitions = new Map([
  [
    "almonds",
    {
      stageOffset: 0,
      stageCount: 47,
      perennialFlags: 5,
      stageDivisor: 7,
      fixedHarvestWeek: 31,
      waterMin: 9,
      waterMax: 14,
      harvestSubstateTen: false,
      pestResistance: 70,
      weedResistance: 70,
      diseaseResistance: 50,
    },
  ],
  [
    "apples",
    {
      stageOffset: 0,
      stageCount: 47,
      perennialFlags: 5,
      stageDivisor: 7,
      fixedHarvestWeek: 44,
      waterMin: 10,
      waterMax: 17,
      harvestSubstateTen: true,
      pestResistance: 50,
      weedResistance: 70,
      diseaseResistance: 50,
    },
  ],
  [
    "barley",
    {
      stageOffset: 0,
      stageCount: 34,
      perennialFlags: 2,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 3,
      waterMax: 7,
      harvestSubstateTen: false,
      pestResistance: 205,
      weedResistance: 150,
      diseaseResistance: 230,
    },
  ],
  [
    "carrots",
    {
      stageOffset: 0,
      stageCount: 17,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 7,
      waterMax: 9,
      harvestSubstateTen: false,
      pestResistance: 128,
      weedResistance: 90,
      diseaseResistance: 110,
    },
  ],
  [
    "corn",
    {
      stageOffset: 0,
      stageCount: 12,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 14,
      waterMax: 18,
      harvestSubstateTen: false,
      pestResistance: 128,
      weedResistance: 220,
      diseaseResistance: 200,
    },
  ],
  [
    "cotton",
    {
      stageOffset: 0,
      stageCount: 12,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 17,
      waterMax: 24,
      harvestSubstateTen: false,
      pestResistance: 0,
      weedResistance: 150,
      diseaseResistance: 247,
    },
  ],
  [
    "gladiolu",
    {
      stageOffset: 0,
      stageCount: 12,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 16,
      waterMax: 24,
      harvestSubstateTen: true,
      pestResistance: 70,
      weedResistance: 80,
      diseaseResistance: 70,
    },
  ],
  [
    "grapes",
    {
      stageOffset: 0,
      stageCount: 47,
      perennialFlags: 5,
      stageDivisor: 7,
      fixedHarvestWeek: 36,
      waterMin: 7,
      waterMax: 10,
      harvestSubstateTen: true,
      pestResistance: 120,
      weedResistance: 130,
      diseaseResistance: 140,
    },
  ],
  [
    "lettuce",
    {
      stageOffset: 0,
      stageCount: 13,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 9,
      waterMax: 13,
      harvestSubstateTen: true,
      pestResistance: 90,
      weedResistance: 120,
      diseaseResistance: 120,
    },
  ],
  [
    "oats",
    {
      stageOffset: 0,
      stageCount: 34,
      perennialFlags: 2,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 4,
      waterMax: 7,
      harvestSubstateTen: false,
      pestResistance: 210,
      weedResistance: 150,
      diseaseResistance: 220,
    },
  ],
  [
    "onions",
    {
      stageOffset: 0,
      stageCount: 22,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 7,
      waterMax: 9,
      harvestSubstateTen: false,
      pestResistance: 220,
      weedResistance: 120,
      diseaseResistance: 100,
    },
  ],
  [
    "oranges",
    {
      stageOffset: 0,
      stageCount: 47,
      perennialFlags: 5,
      stageDivisor: 7,
      fixedHarvestWeek: 34,
      waterMin: 6,
      waterMax: 10,
      harvestSubstateTen: true,
      pestResistance: 50,
      weedResistance: 50,
      diseaseResistance: 50,
    },
  ],
  [
    "peanuts",
    {
      stageOffset: 0,
      stageCount: 22,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 7,
      waterMax: 9,
      harvestSubstateTen: false,
      pestResistance: 210,
      weedResistance: 100,
      diseaseResistance: 90,
    },
  ],
  [
    "potatoes",
    {
      stageOffset: 0,
      stageCount: 17,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 11,
      waterMax: 17,
      harvestSubstateTen: false,
      pestResistance: 199,
      weedResistance: 220,
      diseaseResistance: 212,
    },
  ],
  [
    "rice",
    {
      stageOffset: 0,
      stageCount: 25,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 20,
      waterMax: 27,
      harvestSubstateTen: false,
      pestResistance: 90,
      weedResistance: 130,
      diseaseResistance: 110,
    },
  ],
  [
    "sorghum",
    {
      stageOffset: 0,
      stageCount: 22,
      perennialFlags: 2,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 7,
      waterMax: 9,
      harvestSubstateTen: false,
      pestResistance: 255,
      weedResistance: 255,
      diseaseResistance: 250,
    },
  ],
  [
    "soybeans",
    {
      stageOffset: 0,
      stageCount: 17,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 2,
      waterMax: 4,
      harvestSubstateTen: false,
      pestResistance: 70,
      weedResistance: 70,
      diseaseResistance: 240,
    },
  ],
  [
    "strawber",
    {
      stageOffset: 0,
      stageCount: 17,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 13,
      waterMax: 21,
      harvestSubstateTen: true,
      pestResistance: 64,
      weedResistance: 44,
      diseaseResistance: 90,
    },
  ],
  [
    "sugar",
    {
      stageOffset: 0,
      stageCount: 41,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 3,
      waterMax: 5,
      harvestSubstateTen: false,
      pestResistance: 220,
      weedResistance: 170,
      diseaseResistance: 140,
    },
  ],
  [
    "sunflowe",
    {
      stageOffset: 0,
      stageCount: 14,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 11,
      waterMax: 15,
      harvestSubstateTen: false,
      pestResistance: 140,
      weedResistance: 150,
      diseaseResistance: 130,
    },
  ],
  [
    "sweet",
    {
      stageOffset: 0,
      stageCount: 17,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 12,
      waterMax: 16,
      harvestSubstateTen: true,
      pestResistance: 175,
      weedResistance: 160,
      diseaseResistance: 160,
    },
  ],
  [
    "tobacco",
    {
      stageOffset: 0,
      stageCount: 30,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 3,
      waterMax: 7,
      harvestSubstateTen: true,
      pestResistance: 220,
      weedResistance: 120,
      diseaseResistance: 126,
    },
  ],
  [
    "tomatoes",
    {
      stageOffset: 0,
      stageCount: 13,
      perennialFlags: 0,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 13,
      waterMax: 19,
      harvestSubstateTen: true,
      pestResistance: 90,
      weedResistance: 120,
      diseaseResistance: 100,
    },
  ],
  [
    "wheat",
    {
      stageOffset: 0,
      stageCount: 34,
      perennialFlags: 2,
      stageDivisor: 7,
      fixedHarvestWeek: 0,
      waterMin: 4,
      waterMax: 7,
      harvestSubstateTen: false,
      pestResistance: 210,
      weedResistance: 120,
      diseaseResistance: 220,
    },
  ],
]);
// Evaluation's Suggested Crops pass uses three little-endian CRP words:
// winter chill at stats +12, growing heat at +14, and rainfall at +24.
// These lossless values cover all supplied crop files; only the sixteen
// names loaded by the active SFM can appear in the eight visible cells.
const cropEvaluationRequirements = new Map([
  ["almonds", [13, 0, 9]],
  ["apples", [70, 0, 10]],
  ["barley", [0, 0, 3]],
  ["carrots", [0, 105, 7]],
  ["corn", [0, 166, 14]],
  ["cotton", [0, 73, 17]],
  ["gladiolu", [0, 0, 16]],
  ["grapes", [0, 136, 7]],
  ["lettuce", [0, 123, 9]],
  ["oats", [0, 0, 4]],
  ["onions", [0, 122, 7]],
  ["oranges", [29, 0, 6]],
  ["peanuts", [0, 0, 7]],
  ["potatoes", [0, 141, 11]],
  ["rice", [0, 96, 20]],
  ["sorghum", [0, 5, 7]],
  ["soybeans", [0, 141, 2]],
  ["strawber", [41, 0, 13]],
  ["sugar", [0, 43, 3]],
  ["sunflowe", [0, 0, 11]],
  ["sweet", [0, 147, 12]],
  ["tobacco", [0, 66, 3]],
  ["tomatoes", [0, 153, 13]],
  ["wheat", [0, 0, 4]],
]);
// The saved five-byte display cells retain connected tree artwork, while
// 1b98:06d0 counts the native runtime's pre-render tree plane. Differential
// probes pin the authored-field baseline so later player tree edits can be
// applied as deltas without shipping that private DOS plane.
const nativeWindbreakScenarioCounts = [
  [9, 11, 12, 8, 11, 11, 1, 0, 0],
  [12, 18, 10],
  [20, 19, 12, 10, 11],
  [8, 9, 9, 7, 9, 19, 18, 5],
  [1, 0, 0, 7, 4, 0, 8, 19, 19, 19, 19, 19, 19],
  [20, 8, 14, 1, 4, 0, 12],
  [10, 21, 20, 8, 7, 8, 22, 23, 12],
  [10, 19, 19, 10, 17, 13, 14],
];
// CRP stats word 14 becomes field word 36 when the second planting pass
// completes (DAT_6190_c5ca in FUN_15b3_000c).
const cropPlantingValues = new Map([
  ["almonds", 0],
  ["apples", 0],
  ["barley", 0],
  ["carrots", 105],
  ["corn", 166],
  ["cotton", 73],
  ["gladiolu", 0],
  ["grapes", 136],
  ["lettuce", 123],
  ["oats", 0],
  ["onions", 122],
  ["oranges", 0],
  ["peanuts", 0],
  ["potatoes", 141],
  ["rice", 96],
  ["sorghum", 5],
  ["soybeans", 141],
  ["strawber", 0],
  ["sugar", 43],
  ["sunflowe", 0],
  ["sweet", 147],
  ["tobacco", 66],
  ["tomatoes", 153],
  ["wheat", 0],
]);
// CRP stats word 16 is copied into the harvested storage-lot quantity.
const cropHarvestQuantities = new Map([
  ["almonds", 1443],
  ["apples", 2103],
  ["barley", 758],
  ["carrots", 399],
  ["corn", 289],
  ["cotton", 862],
  ["gladiolu", 2736],
  ["grapes", 38],
  ["lettuce", 515],
  ["oats", 990],
  ["onions", 383],
  ["oranges", 103],
  ["peanuts", 2324],
  ["potatoes", 304],
  ["rice", 964],
  ["sorghum", 385],
  ["soybeans", 637],
  ["strawber", 277],
  ["sugar", 105],
  ["sunflowe", 1279],
  ["sweet", 345],
  ["tobacco", 2188],
  ["tomatoes", 262],
  ["wheat", 1080],
]);
// CRP stats word 18 is the neutral market quote and graph midpoint used by
// CODE59. The visible dollar value is not this quote: the original takes
// floor(quote / 10), multiplies it by stats word 16, and keeps the low word.
const cropMarketBasePrices = new Map([
  ["almonds", 91],
  ["apples", 50],
  ["barley", 41],
  ["carrots", 103],
  ["corn", 150],
  ["cotton", 30],
  ["gladiolu", 30],
  ["grapes", 2080],
  ["lettuce", 118],
  ["oats", 37],
  ["onions", 119],
  ["oranges", 1904],
  ["peanuts", 23],
  ["potatoes", 104],
  ["rice", 60],
  ["sorghum", 55],
  ["soybeans", 65],
  ["strawber", 485],
  ["sugar", 871],
  ["sunflowe", 34],
  ["sweet", 120],
  ["tobacco", 27],
  ["tomatoes", 320],
  ["wheat", 39],
]);
const cropMarketDisplayNames = new Map([
  ["almonds", "Almonds"],
  ["apples", "Apples"],
  ["barley", "Barley"],
  ["carrots", "Carrots"],
  ["corn", "Corn"],
  ["cotton", "Cotton"],
  ["gladiolu", "Gladiolus"],
  ["grapes", "Grapes"],
  ["lettuce", "Lettuce"],
  ["oats", "Oats"],
  ["onions", "Onions"],
  ["oranges", "Oranges"],
  ["peanuts", "Peanuts"],
  ["potatoes", "Potatoes"],
  ["rice", "Rice"],
  ["sorghum", "Sorghum"],
  ["soybeans", "Soybeans"],
  ["strawber", "Strawberries"],
  ["sugar", "Sugar Beets"],
  ["sunflowe", "Sunflower"],
  ["sweet", "Sweet Potato"],
  ["tobacco", "Tobacco"],
  ["tomatoes", "Tomatoes"],
  ["wheat", "Wheat"],
]);
// CRP stats bytes 54..56 are the Flood, Drought, and Frost/Windstorm
// market-response shifts consumed by CODE59:0a50. Every supplied crop uses
// shift one in all three columns except Sorghum, whose zeroes opt it out.
const cropMarketDisasterShifts = new Map(
  Array.from(cropMarketBasePrices.keys(), (key) => [
    key,
    key === "sorghum"
      ? { flood: 0, drought: 0, storm: 0 }
      : { flood: 1, drought: 1, storm: 1 },
  ]),
);
// CRP bytes 34..36 are the per-stage N/P/K draw used by
// FUN_15b3_15b2.  Keeping these raw values (including zeroes) preserves
// the original byte-saturating field and parcel mutations.
const cropGrowthNutrientCosts = new Map([
  ["almonds", [2, 0, 1]],
  ["apples", [2, 1, 1]],
  ["barley", [7, 1, 1]],
  ["carrots", [3, 2, 2]],
  ["corn", [10, 2, 3]],
  ["cotton", [7, 4, 4]],
  ["gladiolu", [18, 5, 5]],
  ["grapes", [8, 1, 2]],
  ["lettuce", [4, 5, 2]],
  ["oats", [8, 1, 1]],
  ["onions", [7, 2, 1]],
  ["oranges", [1, 0, 2]],
  ["peanuts", [1, 1, 1]],
  ["potatoes", [11, 9, 8]],
  ["rice", [12, 2, 2]],
  ["sorghum", [1, 1, 0]],
  ["soybeans", [1, 3, 4]],
  ["strawber", [15, 2, 3]],
  ["sugar", [1, 1, 0]],
  ["sunflowe", [7, 2, 3]],
  ["sweet", [11, 9, 9]],
  ["tobacco", [5, 3, 2]],
  ["tomatoes", [8, 3, 5]],
  ["wheat", [6, 1, 2]],
]);
const sprayActions = [
  {
    name: "Fertilize",
    code: 0x393,
    chemicalId: 0xdc,
    state: 6,
    message: "Select field to fertilize.",
    messageRecord: 14,
  },
  {
    name: "Pesticide",
    code: 0x392,
    chemicalId: 0xdd,
    state: 7,
    message: "Select field to spray with pesticide.",
    messageRecord: 15,
  },
  {
    name: "Herbicide",
    code: 0x391,
    chemicalId: 0xde,
    state: 8,
    message: "Select field to spray with herbicide.",
    messageRecord: 31,
  },
  {
    name: "Fungicide",
    code: 0x390,
    chemicalId: 0xdf,
    state: 9,
    message: "Select field to spray with fungicide.",
    messageRecord: 16,
  },
];
const buyCategories = [
  {
    key: "machine",
    offset: "machineItemDefinitionOffset",
    count: "machineItemDefinitionCount",
    order: [0, 8, 7, 5, 4, 3, 2, 1],
  },
  {
    key: "seed",
    offset: "seedItemDefinitionOffset",
    count: "seedItemDefinitionCount",
    order: [0, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  },
  {
    key: "livestock",
    offset: "livestockItemDefinitionOffset",
    count: "livestockItemDefinitionCount",
    visibleCount: 4,
    order: [1, 0, 3, 2],
  },
  {
    key: "structure",
    offset: "structureItemDefinitionOffset",
    count: "structureItemDefinitionCount",
    order: [0, 8, 7, 6, 5, 4, 3, 2, 1],
  },
  {
    key: "chemical",
    offset: "chemicalItemDefinitionOffset",
    count: "chemicalItemDefinitionCount",
    order: [0, 3, 2, 1],
  },
];
const sellCategoryKeys = ["stored-crop", "machine", "livestock"];

const menus = [
  {
    name: "File",
    x: 0,
    width: 56,
    dropX: 0,
    dropWidth: 128,
    dropHeight: 87,
    items: [
      "About SimFarm",
      "New Game",
      "Save",
      "Save As",
      "Load Game",
      "Load Crop",
      "Quit",
    ],
  },
  {
    name: "Options",
    x: 64,
    width: 64,
    dropX: 64,
    dropWidth: 120,
    dropHeight: 100,
    items: [
      "Music",
      "Sound Effects",
      "AutoBuy",
      "AutoScroll",
      "AutoDoze",
      "AutoGoto",
      "Messages",
      "AutoLease",
    ],
  },
  {
    name: "Speed",
    x: 144,
    width: 48,
    dropX: 144,
    dropWidth: 64,
    dropHeight: 64,
    items: ["Ultra", "Fast", "Normal", "Slow", "Pause"],
  },
  {
    name: "Windows",
    x: 208,
    width: 64,
    dropX: 208,
    dropWidth: 120,
    dropHeight: 128,
    items: [
      "Buy",
      "Sell",
      "Evaluation",
      "Map",
      "Weather",
      "Balance Sheet",
      "Bank",
      "Edit",
      "Market Value",
      "Farm Expert",
    ],
  },
  {
    name: "Disasters",
    x: 288,
    width: 88,
    dropX: 288,
    dropWidth: 104,
    dropHeight: 88,
    items: [
      "Tornado",
      "Locusts",
      "Drought",
      "Flood",
      "Frost",
      "Windstorm",
      "Disable",
    ],
  },
];

const windowDefinitions = {
  about: { title: "ABOUT", image: "about", x: 96, y: 96 },
  sell: {
    image: "windowSell",
    x: 128,
    y: 80,
    close: [256, 312, 48, 24],
    composite: true,
  },
  evaluation: {
    image: "windowEvaluation",
    x: 128,
    y: 128,
    close: [416, 296, 48, 24],
    composite: true,
  },
  weather: {
    title: "WEATHER",
    image: "weather",
    x: 160,
    y: 128,
    close: [160, 128, 16, 16],
  },
  balance: {
    image: "windowBalance",
    x: 128,
    y: 96,
    close: [456, 296, 48, 24],
    composite: true,
  },
  bank: {
    image: "windowBank",
    x: 176,
    y: 96,
    close: [360, 288, 48, 24],
    composite: true,
  },
  market: {
    image: "windowMarket",
    x: 144,
    y: 112,
    close: [400, 296, 48, 24],
    composite: true,
  },
  expert: {
    image: "windowExpert",
    x: 128,
    y: 96,
    close: [464, 296, 48, 24],
    composite: true,
  },
};
const controlBarWindowButtons = new Map([
  ["buy", 0],
  ["sell", 1],
  ["evaluation", 2],
  ["map", 3],
  ["weather", 4],
  ["balance", 5],
  ["bank", 6],
  ["market", 8],
]);
const editWindowSentinel = "edit";
const windowChromeDefinitions = {
  edit: { title: "EDIT", x: 16, y: 48, width: 608, height: 432 },
  "save-game": { title: "SAVE GAME", x: 160, y: 96, width: 208, height: 224 },
  "load-crop": { title: "LOAD CROP", x: 160, y: 96, width: 320, height: 240 },
  map: { title: "MAP", x: 80, y: 64, width: 288, height: 256 },
  buy: { title: "BUY", x: 128, y: 96, width: 256, height: 240 },
  sell: { title: "SELL", x: 128, y: 80, width: 192, height: 272 },
  "field-status": { title: "SCHEDULE", x: 160, y: 80, width: 336, height: 240 },
  airplane: { title: "AIRPLANE", x: 193, y: 161, width: 256, height: 192 },
  bank: { title: "BANK", x: 176, y: 96, width: 288, height: 240 },
  evaluation: { title: "EVALUATION", x: 128, y: 128, width: 352, height: 208 },
  balance: { title: "BALANCE SHEET", x: 128, y: 96, width: 400, height: 240 },
  market: { title: "MARKET VALUE", x: 144, y: 112, width: 320, height: 224 },
  expert: { title: "FARM EXPERT", x: 128, y: 96, width: 400, height: 240 },
  weather: { title: "WEATHER", x: 160, y: 128, width: 336, height: 208 },
  about: { title: "ABOUT", x: 96, y: 96, width: 400, height: 240 },
};
