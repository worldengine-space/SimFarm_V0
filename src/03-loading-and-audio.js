// Asset loading, digital sound effects, music playback, and launch parameters.
// This section is assembled into the shared private game closure by scripts/build.mjs.

const sounds = {
  bird1: new Audio("assets/original/audio/bird1.wav"),
  bird2: new Audio("assets/original/audio/bird2.wav"),
  boos: new Audio("assets/original/audio/boos.wav"),
  bulldoze: new Audio("assets/original/audio/bulldoze.wav"),
  cheers: new Audio("assets/original/audio/cheers.wav"),
  click: new Audio("assets/original/audio/click.wav"),
  compbeep: new Audio("assets/original/audio/compbeep.wav"),
  cow1: new Audio("assets/original/audio/cow1.wav"),
  cow2: new Audio("assets/original/audio/cow2.wav"),
  explode: new Audio("assets/original/audio/explode.wav"),
  flood: new Audio("assets/original/audio/flood.wav"),
  horse1: new Audio("assets/original/audio/horse1.wav"),
  pig: new Audio("assets/original/audio/pig.wav"),
  plane: new Audio("assets/original/audio/plane.wav"),
  plopitem: new Audio("assets/original/audio/plopitem.wav"),
  ploptool: new Audio("assets/original/audio/ploptool.wav"),
  rooster: new Audio("assets/original/audio/rooster.wav"),
  sheep1: new Audio("assets/original/audio/sheep1.wav"),
  sheep2: new Audio("assets/original/audio/sheep2.wav"),
  smack: new Audio("assets/original/audio/smack.wav"),
  locusts: new Audio("assets/original/audio/swarm.wav"),
  thunder: new Audio("assets/original/audio/thunder.wav"),
  tornado: new Audio("assets/original/audio/tornado.wav"),
  uhoh: new Audio("assets/original/audio/uhoh.wav"),
  windstorm: new Audio("assets/original/audio/wind.wav"),
};
function createLoopingFmTrack(src, loopStart, loopEnd) {
  const AudioContextClass =
    globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) {
    const fallback = new Audio(src);
    fallback.loop = true;
    return fallback;
  }
  // GENFARM's XMIDI FOR/NEXT controls loop inside the score. Retain the
  // first native pass once, then loop the captured second pass so voices
  // crossing NEXT keep their original release/overlap instead of resetting
  // to the cold-start FM state on every repetition.
  let audioContext = null;
  let bufferPromise = null;
  let source = null;
  let offset = 0;
  let startedAt = 0;
  let generation = 0;
  const track = {
    src,
    loop: true,
    addEventListener() {}, // An infinite native sequence never emits ended.
    get currentTime() {
      let position =
        offset + (source ? audioContext.currentTime - startedAt : 0);
      if (position >= loopEnd)
        position = loopStart + ((position - loopStart) % (loopEnd - loopStart));
      return position;
    },
    set currentTime(value) {
      offset = Math.max(0, Number(value) || 0);
    },
    pause() {
      offset = track.currentTime;
      generation += 1;
      if (source) {
        source.stop();
        source.disconnect();
        source = null;
      }
    },
    async play() {
      track.pause();
      const request = generation;
      audioContext ||= new AudioContextClass();
      bufferPromise ||= fetch(src)
        .then((response) => {
          if (!response.ok) throw new Error(`Unable to load ${src}`);
          return response.arrayBuffer();
        })
        .then((bytes) => audioContext.decodeAudioData(bytes));
      const [buffer] = await Promise.all([
        bufferPromise,
        audioContext.resume(),
      ]);
      if (request !== generation) return;
      source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
      source.connect(audioContext.destination);
      startedAt = audioContext.currentTime;
      source.start(0, offset);
    },
  };
  return track;
}

const music = {
  alien: new Audio("assets/original/music/alien.wav"),
  amain: new Audio("assets/original/music/amain.wav"),
  carnival: new Audio("assets/original/music/carnival.wav"),
  cowman: new Audio("assets/original/music/cowman.wav"),
  dfarm: new Audio("assets/original/music/dfarm.wav"),
  ffarm: new Audio("assets/original/music/ffarm.wav"),
  genfarm: createLoopingFmTrack(
    "assets/original/music/genfarm.wav",
    7199 / 120,
    7199 / 60,
  ),
  rodeo: new Audio("assets/original/music/rodeo.wav"),
};
// Original XMI end-of-track ticks /120Hz. FM voices can continue releasing
// after these event boundaries; the native startup fallback uses sequence
// status, so waiting for the recorded audio tail would delay GENFARM.
const nativeMusicSequenceSeconds = {
  alien: 2863 / 120,
  amain: 7341 / 120,
  carnival: 5895 / 120,
  cowman: 7497 / 120,
  dfarm: 7504 / 120,
  ffarm: 4304 / 120,
  rodeo: 5320 / 120,
};
for (const [name, track] of Object.entries(music)) {
  track.addEventListener?.("ended", () => finishMusicTrack(name));
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${path}`));
    image.src = path;
  });
}

function decodeMapPaletteIndexImage(name) {
  const image = images[name];
  if (!image || image.width <= 0 || image.height <= 0) return false;
  const expectedSize =
    name === "tileSheetIndexes"
      ? [320, 704]
      : name === "townEventTileIndexes"
        ? [320, 128]
        : name === "maskedTileIndexes"
          ? [320, 160]
          : name.startsWith("crop-")
            ? [112, 96]
            : null;
  if (
    !expectedSize ||
    image.width !== expectedSize[0] ||
    image.height !== expectedSize[1]
  ) {
    return false;
  }
  let pixels;
  try {
    const scratch = document.createElement("canvas");
    scratch.width = image.width;
    scratch.height = image.height;
    const scratchContext = scratch.getContext("2d", {
      willReadFrequently: true,
    });
    if (!scratchContext) return false;
    scratchContext.imageSmoothingEnabled = false;
    scratchContext.clearRect?.(0, 0, image.width, image.height);
    scratchContext.drawImage(image, 0, 0);
    pixels = scratchContext.getImageData(0, 0, image.width, image.height);
  } catch (_error) {
    return false;
  }
  if (!pixels?.data || pixels.data.length !== image.width * image.height * 4)
    return false;
  const indexes = new Uint8Array(image.width * image.height);
  indexes.fill(0xff);
  let opaque = 0;
  for (let position = 0; position < indexes.length; position += 1) {
    const at = position * 4;
    if (pixels.data[at + 3] === 0) continue;
    const red = pixels.data[at];
    const green = pixels.data[at + 1];
    if (pixels.data[at + 2] !== 90 || red % 17 !== 0 || red + green !== 255)
      return false;
    const index = red / 17;
    if (index > 15) return false;
    indexes[position] = index;
    opaque += 1;
  }
  if (opaque === 0) return false;
  mapPaletteIndexSheets.set(name, {
    width: image.width,
    height: image.height,
    indexes,
  });
  return true;
}

function initializeMapPaletteIndexImages() {
  for (const name of [
    "tileSheetIndexes",
    "townEventTileIndexes",
    "maskedTileIndexes",
    ...cropImageNames.map((cropName) => `crop-${cropName}-indexes`),
  ])
    decodeMapPaletteIndexImage(name);
}

async function load() {
  try {
    const entries = await Promise.all(
      Object.entries(imagePaths).map(async ([name, path]) => [
        name,
        await loadImage(path),
      ]),
    );
    for (const [name, image] of entries) images[name] = image;
    initializeMapPaletteIndexImages();
    const loadedData = await Promise.all([
      fetch("data/region.json").then((response) => {
        if (!response.ok)
          throw new Error(`Unable to load region data (${response.status})`);
        return response.json();
      }),
      fetch("data/save-states.json").then((response) => {
        if (!response.ok)
          throw new Error(
            `Unable to load save-state data (${response.status})`,
          );
        return response.json();
      }),
      fetch("data/original-text.json").then((response) => {
        if (!response.ok)
          throw new Error(`Unable to load original text (${response.status})`);
        return response.json();
      }),
      fetch("data/help-cards.json").then((response) => {
        if (!response.ok)
          throw new Error(`Unable to load help cards (${response.status})`);
        return response.json();
      }),
      fetch("data/crops.json").then((response) => {
        if (!response.ok)
          throw new Error(`Unable to load crop data (${response.status})`);
        return response.json();
      }),
    ]);
    [regionData, saveData, originalText] = loadedData;
    if (Array.isArray(loadedData[3]?.cards)) helpData = loadedData[3];
    if (Array.isArray(loadedData[4]?.crops)) cropData = loadedData[4];
    fontAtlases = {
      black: tintAtlas(images.font, "#000000"),
      white: tintAtlas(images.font, "#ffffff"),
      green: tintAtlas(images.font, "#00ff48"),
      red: tintAtlas(images.font, "#f30505"),
    };
    prepareRegionTerrain();
    ready = true;
    beginStartupMusic();
    resetStartupStageTimer();
    applyLaunchParameters();
    render();
  } catch (error) {
    console.error(error);
    context.fillStyle = "#000";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#fff";
    context.font = "16px monospace";
    context.fillText("SimFarm could not load.", 24, 40);
    context.fillText(String(error.message || error), 24, 68);
  }
}

function applyLaunchParameters() {
  const parameters = new URLSearchParams(window.location.search);
  // The native binary accepts the exact lowercase argument `eeadebug`, then keeps
  // its hidden key commands only when the DOS year is <= 1993 and its
  // one-based month is <= 11. `dosdate` supplies that host-clock input for
  // the browser build; without it the actual host date is used.
  const requestedDebugDate = parameters.get("dosdate");
  const debugDate =
    requestedDebugDate === null
      ? new Date()
      : new Date(`${requestedDebugDate}T12:00:00`);
  debugMode =
    parameters.has("eeadebug") &&
    !Number.isNaN(debugDate.getTime()) &&
    debugDate.getFullYear() <= 1993 &&
    debugDate.getMonth() + 1 <= 11;
  if (!parameters.has("scenario")) return;
  const requested = Number.parseInt(parameters.get("scenario"), 10);
  if (!(requested >= 0 && requested < scenarioMarkers.length)) return;
  const [gridX, gridY] = scenarioMarkers[requested];
  selectedRegion = { gridX, gridY };
  startGame();
  if (parameters.get("window") === "main") clearGameWindows();
  else if (parameters.get("window") === "about") setOnlyGameWindow("about");
  const deltaX = Number.parseInt(parameters.get("dx") || "0", 10);
  const deltaY = Number.parseInt(parameters.get("dy") || "0", 10);
  if (Number.isFinite(deltaX))
    camera.x = Math.max(1, Math.min(63, camera.x + deltaX));
  if (Number.isFinite(deltaY))
    camera.y = Math.max(0, Math.min(73, camera.y + deltaY));
}

function nativeNewGameDate() {
  const requested = new URLSearchParams(window.location.search).get("dosdate");
  const date =
    requested === null ? new Date() : new Date(`${requested}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function tintAtlas(source, color) {
  const atlas = document.createElement("canvas");
  atlas.width = source.width;
  atlas.height = source.height;
  const atlasContext = atlas.getContext("2d");
  atlasContext.imageSmoothingEnabled = false;
  atlasContext.drawImage(source, 0, 0);
  atlasContext.globalCompositeOperation = "source-in";
  atlasContext.fillStyle = color;
  atlasContext.fillRect(0, 0, atlas.width, atlas.height);
  atlasContext.globalCompositeOperation = "source-over";
  return atlas;
}

function drawText(text, x, y, color = "black", destination = context) {
  const atlas = fontAtlases[color] || fontAtlases.black;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 || code >= 152) continue;
    const glyph = code - 32;
    destination.drawImage(
      atlas,
      (glyph % 16) * 8,
      Math.floor(glyph / 16) * 8,
      8,
      8,
      x + index * 8,
      y,
      8,
      8,
    );
  }
}

let activeDigitalSound = null;
let digitalSoundGeneration = 0;

function play(name = "click") {
  if (!state.options["Sound Effects"]) return false;
  const sound = sounds[name];
  if (!sound) return false;
  // FUN_312a_08b6 rejects a new VOC while digital status is2. Native
  // split-filename probes confirm first-call wins across this shared voice.
  if (activeDigitalSound?.paused === false && activeDigitalSound.ended !== true)
    return false;
  activeDigitalSound = sound;
  const generation = ++digitalSoundGeneration;
  sound.currentTime = 0;
  try {
    sound.play()?.catch?.(() => {
      if (generation === digitalSoundGeneration) activeDigitalSound = null;
    });
  } catch (_error) {
    if (generation === digitalSoundGeneration) activeDigitalSound = null;
    return false;
  }
  return true;
}

function playMusic(name) {
  if (!state.options.Music) return false;
  const track = music[name];
  if (!track) return false;
  for (const [otherName, otherTrack] of Object.entries(music)) {
    if (otherName === name) continue;
    otherTrack.pause?.();
    otherTrack.currentTime = 0;
  }
  track.pause?.();
  track.currentTime = 0;
  currentMusicName = name;
  musicGestureRetryPending = false;
  const playback = track.play();
  playback?.catch?.(() => {
    if (currentMusicName === name && state.options.Music)
      musicGestureRetryPending = true;
  });
  return true;
}

function stopMusic(clearStartupFallback = false) {
  for (const track of Object.values(music)) {
    track.pause?.();
    track.currentTime = 0;
  }
  currentMusicName = null;
  musicGestureRetryPending = false;
  if (clearStartupFallback) startupMusicFallbackPending = false;
}

function finishMusicTrack(name) {
  if (name === "genfarm") return false;
  if (currentMusicName !== name) return false;
  currentMusicName = null;
  musicGestureRetryPending = false;
  if (!startupMusicFallbackPending) return false;
  startupMusicFallbackPending = false;
  return playMusic("genfarm");
}

function advanceMusicSequenceCompletion() {
  const name = currentMusicName;
  if (!name || musicGestureRetryPending) return false;
  const duration = nativeMusicSequenceSeconds[name];
  if (duration === undefined || music[name].currentTime < duration)
    return false;
  return finishMusicTrack(name);
}

function beginStartupMusic() {
  startupMusicFallbackPending = true;
  return playMusic("amain");
}

function resumeMusicFromGesture() {
  if (!musicGestureRetryPending || !state.options.Music || !currentMusicName)
    return false;
  const name = currentMusicName;
  musicGestureRetryPending = false;
  const playback = music[name].play();
  playback?.catch?.(() => {
    if (currentMusicName === name && state.options.Music)
      musicGestureRetryPending = true;
  });
  return true;
}

function setMusicEnabled(enabled) {
  state.options.Music = Boolean(enabled);
  if (!state.options.Music) {
    stopMusic(true);
    return false;
  }
  startupMusicFallbackPending = false;
  return playMusic("genfarm");
}
