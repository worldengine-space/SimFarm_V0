// Image paths and mutable state shared by the simulation and interface.
// This section is assembled into the shared private game closure by scripts/build.mjs.

const imagePaths = {
  presents: "assets/original/ui/prsnt480.png",
  title: "assets/original/ui/sftitle.png",
  region: "assets/original/ui/scenario.png",
  designer: "assets/original/ui/defworld.png",
  genericMain: "assets/original/scenarios/generic-main.png",
  controlBar: "assets/original/ui/cntlbtnh.png",
  editEasy: "assets/original/ui/editeasy.png",
  font: "assets/original/font/egafont.png",
  cursors: "assets/original/tiles/cursors.png",
  tileSheet: "assets/original/tiles/ega16til.png",
  tileSheetRain: "assets/original/tiles/ega16til-rain.png",
  tileSheetFrost: "assets/original/tiles/ega16til-frost.png",
  tileSheetIndexes: "assets/original/tiles/ega16til-index.png",
  townEventTiles: "assets/original/tiles/twnevent.png",
  townEventTilesRain: "assets/original/tiles/twnevent-rain.png",
  townEventTilesFrost: "assets/original/tiles/twnevent-frost.png",
  townEventTileIndexes: "assets/original/tiles/twnevent-index.png",
  maskedTiles: "assets/original/tiles/mskdtile.png",
  maskedTilesRain: "assets/original/tiles/mskdtile-rain.png",
  maskedTilesFrost: "assets/original/tiles/mskdtile-frost.png",
  maskedTileIndexes: "assets/original/tiles/mskdtile-index.png",
  allTiles: "assets/original/libraries/alltiles.png",
  allTilesRain: "assets/original/libraries/alltiles-rain.png",
  allTilesFrost: "assets/original/libraries/alltiles-frost.png",
  examine: "assets/original/ui/examine.png",
  windowBuy: "assets/original/ui/window-buy.png",
  buy: "assets/original/ui/buywndo.png",
  popup: "assets/original/ui/popup.png",
  chooseCrop: "assets/original/ui/choscrop.png",
  cropDusterWarning: "assets/original/ui/crop-duster-warning.png",
  bulldozeQuestion: "assets/original/ui/bulldoze-question.png",
  bulldozeFieldQuestion: "assets/original/ui/bulldoze-field-question.png",
  bulldozeFieldBusy: "assets/original/ui/bulldoze-field-busy.png",
  tornadoWarning: "assets/original/ui/tornado-warning.png",
  locustWarning: "assets/original/ui/locust-warning.png",
  droughtWarning: "assets/original/ui/drought-warning.png",
  droughtEnded: "assets/original/ui/drought-ended.png",
  floodWarning: "assets/original/ui/flood-warning.png",
  floodEnded: "assets/original/ui/flood-ended.png",
  frostWarning: "assets/original/ui/frost-warning.png",
  windstormWarning: "assets/original/ui/windstorm-warning.png",
  windstormEnded: "assets/original/ui/windstorm-ended.png",
  closeEncounter: "assets/original/ui/close-encounter.png",
  toxicityWarning: "assets/original/ui/toxicity-warning.png",
  townEventQuestion: "assets/original/ui/town-event-question.png",
  townEventResult: "assets/original/ui/town-event-result.png",
  bankForeclosure: "assets/original/ui/bank-foreclosure.png",
  bankruptcyQuestion: "assets/original/ui/bankruptcy-question.png",
  bankForeclosurePaid: "assets/original/ui/bank-foreclosure-paid.png",
  townChoice: "assets/original/ui/twnchoic.png",
  windowSell: "assets/original/ui/window-sell.png",
  windowEvaluation: "assets/original/ui/window-evaluation.png",
  windowWeather: "assets/original/ui/window-weather.png",
  windowBalance: "assets/original/ui/window-balance-sheet.png",
  windowBank: "assets/original/ui/window-bank.png",
  windowMarket: "assets/original/ui/window-market-value.png",
  windowExpert: "assets/original/ui/window-farm-expert.png",
  about: "assets/original/ui/about.png",
  lizardLogo: "assets/original/ui/lzrdlogo.png",
  sell: "assets/original/ui/sellwndo.png",
  evaluation: "assets/original/ui/evaluate.png",
  weather: "assets/original/ui/weather.png",
  weatherSky: "assets/original/libraries/wethsky.png",
  weatherGround: "assets/original/libraries/wethgrnd.png",
  weatherVane: "assets/original/tiles/wethvane.png",
  fieldGraph: "assets/original/tiles/fldgrph.png",
  cashflow: "assets/original/ui/cashflow.png",
  bank: "assets/original/ui/bankterm.png",
  filegenr: "assets/original/ui/filegenr.png",
  futures: "assets/original/ui/futures.png",
  expert: "assets/original/ui/farmburo.png",
  buttons: "assets/original/tiles/buttons.png",
  toolPlantMenu: "assets/original/ui/tool-plant-menu.png",
  toolSprayMenu: "assets/original/ui/tool-spray-menu.png",
  editHelp: "assets/original/ui/edithelp.png",
  mapHelp: "assets/original/ui/maphelp.png",
  bankHelp: "assets/original/ui/bankhelp.png",
  fieldStatus: "assets/original/ui/fdstatus.png",
  fieldGauges: "assets/original/tiles/fldgrph.png",
  airplaneWindow: "assets/original/ui/airpwndo.png",
  airplaneWindowRain: "assets/original/ui/airpwndo-rain.png",
  airplaneWindowFrost: "assets/original/ui/airpwndo-frost.png",
  airplaneSprite: "assets/original/sprites/airplane-rgba.png",
  airplaneShadow: "assets/original/sprites/apshadow-rgba.png",
  cropDustSprite: "assets/original/sprites/cropdust-rgba.png",
  cowman1: "assets/original/sprites/cowman1.png",
  cowman2: "assets/original/sprites/cowman2.png",
  cowman3: "assets/original/sprites/cowman3.png",
  locustSprite: "assets/original/sprites/swarm.png",
  tornadoSprite: "assets/original/sprites/tornado.png?v=leading-mask",
};
for (let marker = 0; marker < 8; marker += 1) {
  imagePaths[`main${marker}`] =
    `assets/original/scenarios/marker-${marker}-main.png`;
  imagePaths[`mapWindow${marker}`] =
    `assets/original/scenarios/marker-${marker}-map-window.png`;
  imagePaths[`overhead${marker}`] =
    `assets/original/scenarios/marker-${marker}-overhead.png`;
  for (let mode = 0; mode < 8; mode += 1) {
    imagePaths[`map${marker}-${mode}`] =
      `assets/original/scenarios/marker-${marker}-map-mode-${mode}.png`;
    imagePaths[`mapStatus${marker}-${mode}`] =
      `assets/original/scenarios/marker-${marker}-map-status-${mode}.png`;
  }
}
const cropImageNames = [
  "almonds",
  "apples",
  "barley",
  "carrots",
  "corn",
  "cotton",
  "gladiolu",
  "grapes",
  "lettuce",
  "oats",
  "onions",
  "oranges",
  "peanuts",
  "potatoes",
  "rice",
  "sorghum",
  "soybeans",
  "strawber",
  "sugar",
  "sunflowe",
  "sweet",
  "tobacco",
  "tomatoes",
  "wheat",
];
for (const cropName of cropImageNames) {
  imagePaths[`crop-${cropName}`] = `assets/original/crops/${cropName}.png`;
  imagePaths[`crop-${cropName}-rain`] =
    `assets/original/crops/${cropName}-rain.png`;
  imagePaths[`crop-${cropName}-frost`] =
    `assets/original/crops/${cropName}-frost.png`;
  imagePaths[`crop-${cropName}-indexes`] =
    `assets/original/crops/${cropName}-index.png`;
}

const images = {};
const mapPaletteIndexSheets = new Map();
let regionData = null;
let saveData = null;
let originalText = null;
let helpData = { cards: [] };
let cropData = { crops: [] };
let farmStateBytes = null;
let fontAtlases = null;
let ready = false;
let stage = "presents";
// FUN_312a_001c passes a literal 20,000 ms to the native timer subsystem.
// Each startup card rearms that same one-shot timeout when it is entered.
const startupStageTimeoutMs = 20_000;
let startupStageStartedAt = 0;
const aboutOpeningDurationTicks = 0x200;
const aboutPageDurationTicks = 0x180;
const aboutCreditLinesPerPage = 12;
let aboutCreditsPhase = "opening";
let aboutCreditsLine = 0;
let aboutCreditsLastTick = 0;
let selectedRegion = { gridX: 2, gridY: 8 };
let markerIndex = null;
let generatedWorldActive = false;
let generatedWorldBytes = null;
let designerRuntime = null;
const initialProcessRandomSeed = nativeProcessRandomSeed();
let designerRandomHistory = seedDesignerRandomHistory();
let nativeTerrainWaterFlags = 1;
let regionTerrainPrepared = false;
let regionTerrain = null;
let currentSaveName = "SIMFARM.SFM";
let currentMenu = null;
let menuHover = -1;
let menuPointerHeld = false;
// DS:21a2 counts idle root passes, not timer ticks. Mouse press/terrain
// painting and AutoScroll postpone simulation while the UI settles.
let activityHoldoffPasses = 0;
let selectorButtonHeld = null;
let activeWindow = null;
let windowStack = [];
// Native child descriptors retain their last position while hidden. The
// coordinates are initialized from the descriptors above only on first use.
const windowPositions = new Map();
let windowDragState = null;
let editVisible = true;
let loadCropSlot = 0;
let loadCropFileIndex = 0;
let loadCropScroll = 0;
let saveDialogName = "";
let saveDialogExitAfter = false;
let saveDialogSavedName = "";
let fileDialogPauseHeld = false;
let mapMode = -1;
let mapNavigationHeld = false;
let selectedParcel = null;
let propertySelectionActivated = false;
let authoredParcelStatuses = [];
let message = "";
// FUN_1d75_2bb4 owns a process-global ten-byte QMESSAGE history. The
// initialized record bytes are 0xff; a post advances the cursor modulo ten
// only when its record differs from the current one.
const quickMessageRing = new Uint8Array(10);
quickMessageRing.fill(0xff);
let quickMessageRingIndex = 0;
let quickMessageDirty = false;
let selectedTool = "Examine";
let selectedPurchaseItem = null;
let buyCategoryIndex = 2;
let buyItemIndex = 0;
let buyPreviewTiles = null;
const buyCategoryBevelResidues = new Set();
let sellCategoryIndex = 0;
let sellItemIndex = 0;
let sellScrollOffset = 0;
const sellCategoryBevelResidues = new Set();
let sellScrollbarHeld = false;
let fieldScheduleScrollbarHeld = false;
let bankLoanInput = 0;
const bankReleasedControls = new Set();
let expertCard = 2;
let modalNotice = null;
let queuedModalNotice = null;
let pendingBankruptcySource = null;
let bankruptcyPromptArmed = false;
let pendingTownVote = null;
let townVoteDisplaySnapshot = null;
let pendingTownEventBoundary = null;
let pendingTownEventPrompt = null;
let pendingBulldozeAction = null;
let townEventDisplaySnapshot = null;
let townEventRandomX = 0;
let townEventRandomY = 0;
let selectedCropSlot = null;
let selectedSprayAction = null;
let selectedFieldSlot = null;
let selectedMachineSlot = null;
let selectedDusterChemical = 0xdd;
let dusterFlight = null;
let tornadoEvent = null;
let locustEvent = null;
let droughtEvent = null;
let floodEvent = null;
let floodDuration = 0;
let frostEvent = null;
let frostCountdown = 0;
let windstormEvent = null;
let closeEncounterEvent = null;
let toxicityWarningShown = false;
let debugMode = false;
let debugCommandBuffer = Array(16).fill("\0");
let debugCommandIndex = 0;
// The hidden bracket-key event browser and its repeat timestamps are DOS
// process globals. They deliberately survive New/Load within one session.
let debugEventIndex = 0;
let genericEventRecord = null;
let queuedGenericEventRecords = [];
let pendingFinanceAuction = null;
let pendingMonthBoundary = null;
let genericEventDisplaySnapshot = null;
let genericEventDisplayReleaseRecord = null;
const genericEventLastTicks = new Uint16Array(64);
// Both values are DOS-process globals, not part of the SFM payload. The
// annual-ledger rollover copies the current tax expense into the Balance
// Sheet report slot; the hidden `*` command activates the TOWN window.
let priorYearPropertyTaxExpense = 0;
let townDebugVisible = false;
// The livestock ownership total used by Evaluation/TOWN is maintained by
// the category manager and is distinct from both sale value and the annual
// purchase-expense rows. Native sales subtract from this process total.
let livestockAssetValue = 0;
let authoredWindbreakBytes = null;
let disasterEventIntervalTicks = 4;
let fieldScheduleWeek = 0;
let fieldScheduleSelection = 0;
let toolPopup = null;
let heldEditHelp = false;
let heldMapHelp = false;
let heldBankHelp = false;
let weatherVaneFrame = 0;
let weatherVaneLastTick = Date.now();
let mapTileAnimationPhase = 0;
let mapTileAnimationLastTick = biosClockTick();
let mapDirty = false;
let dragState = null;
let heldLivestockInfo = null;
let heldMachineInfo = null;
let heldStructureInfo = null;
let heldTerrainInfo = null;
let movingMachineSlot = 0;
// FUN_0d5f_067e keeps this as one shared, non-serialized runtime word.
// Every eleventh eligible bare-terrain step damages the moving machine
// chain, regardless of which ground machine supplied the preceding steps.
let groundRouteWearCounter = 0;
let simRandomState = seedSimRandom();
let simSecondaryRandomState = seedSimSecondaryRandom();
let simSmallRandomState = seedSimSmallRandom();
// The native music subsystem keeps one active Miles sequence handle. Its
// startup fallback flag survives score changes until the first sequence
// finishes, at which point GENFARM is started once and the flag is cleared.
let currentMusicName = null;
let startupMusicFallbackPending = true;
let musicGestureRetryPending = false;
// DS:462e is a process-global homestead class sentinel. It is not serialized
// in SFM files and is deliberately retained across in-process New/Load paths.
let homesteadImprovementTier = 0xff;
let pendingHomesteadImprovement = null;
let homesteadNoticeAnimation = null;
let nextHomesteadNoticeAnimationAt = 0;
const homesteadNoticeAnimationInterval = 9 * nativeClockTickMilliseconds;
const homesteadCowmanSequences = {
  1: [0, 1, 2, 2, 1, 0, 3, 4, 4, 3, 1, 0],
  2: [0, 1, 1, 2, 3, 3, 0],
  3: [0, 1, 2, 3, 3, 3, 2, 1, 0, 0],
};
const freshMarketRuntime = () => ({
  initialized: false,
  selectedCrop: 0,
  trend: 0,
  trendAge: 0,
  history: Array.from({ length: 16 }, () => new Array(30).fill(0)),
});
// The 16x30 quote history, selected crop, and trend bytes live only in the
// DOS process. SFM files preserve current item-definition prices, not these
// graph samples.
let marketRuntime = freshMarketRuntime();
const freshEvaluationRuntime = () => ({
  farmGrowth: 0,
  previousFarmGrowth: 0,
  farmTotal: 0,
  previousFarmTotal: 0,
  townGrowth: 0,
  previousTownGrowth: 0,
  townTotal: 0,
  previousTownTotal: 0,
  productivity: 0,
  previousProductivity: 0,
  soilCount: 0,
  previousSoilCount: 0,
  environmentCount: 0,
  previousEnvironmentCount: 0,
});
// The original keeps these Evaluation snapshots in DOS runtime globals;
// they are deliberately absent from the 139,072-byte SFM payload.
let evaluationRuntime = freshEvaluationRuntime();
let irrigationRuntime = {
  phase: 0,
  busy: false,
  head: 0,
  tail: 0,
  queue: new Array(128).fill(null),
};
const manualHarvestAnimationTicks = new Map();
const storedMachineDirections = new Map();
// The DOS mouse driver begins centered. PRSNT480 suppresses its drawing;
// the same position becomes visible when SFTITLE is entered unattended.
let pointer = { x: WIDTH / 2, y: HEIGHT / 2 };
let pointerClientPosition = null;
let pointerCanvasBounds = null;
let pointerVisible = true;
let camera = {
  x: 0,
  y: 0,
  initialX: 0,
  initialY: 0,
};
let state = {
  funds: 40000,
  day: 0,
  season: 1,
  week: 0,
  month: 3,
  year: 1998,
  weatherCategoryCycle: 0,
  weatherPrecipitationCycle: 0,
  weatherTemperatureCycle: 0,
  weatherDays: [3, 3, 3, 0, 0, 0, 0],
  nextWeatherDays: [0, 0, 0, 0, 0, 0, 0],
  weatherMoistureAccumulator: 0,
  soilMoisture: 8,
  currentWindSpeed: 5,
  windBoost: 0,
  bankQuarterlyPayment: 0,
  bankCreditLimit: 48432,
  bankDebt: 0,
  bankInterestRate: 15,
  bankStructureCollateral: 0,
  bankDefaultCountdown: 0,
  bankMissedPayment: 0,
  bankLastNotice: "",
  bankruptcyState: 0,
  taxableSaleIncome: 0,
  propertyTaxDue: 0,
  propertyTaxCountdown: 0,
  propertyTaxLastNotice: "",
  propertyTaxPenaltyCount: 0,
  townReserve: 40000,
  speed: "Normal",
  options: {
    Music: true,
    "Sound Effects": true,
    AutoBuy: true,
    AutoScroll: true,
    AutoDoze: false,
    AutoGoto: true,
    Messages: true,
    AutoLease: true,
  },
  disastersDisabled: false,
};
let calendarLastTick = biosClockTick();
let calendarIntervalTicks = speedTickThresholds.Normal;
let irrigationLastTick = biosClockTick();
let livestockIntervalTicks = livestockTickThresholds.Normal;
let livestockLastTick = biosClockTick();
let townTrafficLastTick = biosClockTick();
let nextLivestockHerdAt = Date.now() + livestockHerdInterval;
let livestockHerdTargets = new Map([
  [0xa0, { x: 0, y: 0 }],
  [0xa1, { x: 0, y: 0 }],
  [0xa2, { x: 0, y: 0 }],
  [0xa3, { x: 0, y: 0 }],
]);
let nextDusterFlightAt = Date.now() + dusterFlightInterval;
