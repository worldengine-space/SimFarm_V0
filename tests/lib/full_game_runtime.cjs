"use strict";

// Offline evaluation only: run the unbundled shipped game with a real Skia
// Canvas2D implementation, decoded PNGs, and the actual DOM input handlers.
// No browser internals and no permissive no-op drawing context are involved.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createCanvas, Image } = require("@napi-rs/canvas");
const root = path.resolve(__dirname, "../..");

async function createGameRuntime({ scenario = 0, now = 100_000 } = {}) {
  const canvas = createCanvas(640, 480);
  const listeners = new Map();
  const fileListeners = new Map();
  const errors = [];
  const files = [];
  const downloads = [];
  const objectUrls = new Map();
  const storage = new Map();
  const context = canvas.getContext("2d");
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 640,
    height: 480,
  });
  canvas.addEventListener = (type, handler) => listeners.set(type, handler);
  canvas.setPointerCapture = () => {};
  canvas.focus = () => {};
  const fileInput = {
    addEventListener: (type, handler) => fileListeners.set(type, handler),
    click() {},
  };
  class LocalImage extends Image {
    set src(value) {
      super.src = fs.readFileSync(path.join(root, value.split("?")[0]));
    }
  }
  class SilentAudio {
    constructor() {
      this.currentTime = 0;
      this.volume = 1;
      this.paused = true;
    }
    addEventListener() {}
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }
  const sandbox = {
    console: {
      log: console.log,
      warn: (...args) => errors.push(args.join(" ")),
      error: (...args) => errors.push(args.join(" ")),
    },
    document: {
      querySelector: () => canvas,
      getElementById: () => fileInput,
      createElement: (tag) => {
        if (tag === "canvas") return createCanvas(1, 1);
        if (tag === "a")
          return {
            click() {
              files.push(this.download);
              downloads.push({
                name: this.download,
                blob: objectUrls.get(this.href),
              });
            },
            remove() {},
          };
        throw new Error(`Unexpected DOM element${tag}`);
      },
      body: { append() {} },
    },
    Image: LocalImage,
    Audio: SilentAudio,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    location: { search: `?scenario=${scenario}&dosclock=1993-07-17T12:34:56` },
    URLSearchParams,
    Uint8Array,
    Uint8ClampedArray,
    DataView,
    ArrayBuffer,
    Blob,
    URL: {
      createObjectURL(blob) {
        const url = `blob:sweep-${downloads.length}`;
        objectUrls.set(url, blob);
        return url;
      },
      revokeObjectURL(url) {
        objectUrls.delete(url);
      },
    },
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    performance: { now: () => now },
    requestAnimationFrame() {},
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (name) => ({
      ok: true,
      status: 200,
      json: async () =>
        JSON.parse(fs.readFileSync(path.join(root, name), "utf8")),
    }),
  };
  sandbox.window = sandbox;
  const original = fs.readFileSync(path.join(root, "game.js"), "utf8");
  const source = original.replace(
    "  load();\n",
    `
    window.__fullGame = {
      frame, render, importBytes: importSfmBytes, serialize: serializeSfmBytes,
      setup(values = {}) {
        if (values.bytes) importSfmBytes(values.bytes, "AUDIT.SFM");
        if (values.state) Object.assign(state, values.state);
        if (values.random !== undefined) simRandomState = values.random;
        if (values.secondaryRandom !== undefined) simSecondaryRandomState = values.secondaryRandom;
        if (values.smallRandom !== undefined) simSmallRandomState = values.smallRandom;
        if (values.camera) Object.assign(camera, values.camera);
        if (values.pointer) pointer = { ...values.pointer };
        if (values.phase !== undefined) mapTileAnimationPhase = values.phase;
        if (values.window !== undefined) setOnlyGameWindow(values.window);
        if (values.mode !== undefined) mapMode = values.mode;
        if (values.message !== undefined) message = values.message;
        if (values.dirty !== undefined) mapDirty = values.dirty;
        modalNotice = null;
        ready = true;
        stage = "game";
        render();
      },
      snapshot() {
        return { camera: { ...camera }, state: { ...state }, activeWindow, stage,
          modalNotice, mapMode, random: simRandomState, secondaryRandom: simSecondaryRandomState,
          smallRandom: simSmallRandomState, phase: mapTileAnimationPhase };
      },
    };
    window.__fullGameReady = load();
  `,
  );
  if (source === original)
    throw new Error("Full game test hook insertion failed");
  vm.runInNewContext(source, sandbox, { filename: "game.js" });
  await sandbox.__fullGameReady;
  if (errors.length) throw new Error(errors.join("\n"));
  const api = sandbox.__fullGame;
  const pointer = (type, x, y, button = 0) => {
    listeners.get(type)({
      clientX: x,
      clientY: y,
      button,
      pointerId: 1,
      preventDefault() {},
      ctrlKey: false,
      shiftKey: false,
    });
  };
  return {
    api,
    canvas,
    context,
    errors,
    files,
    downloads,
    now(value) {
      now = value;
    },
    frame() {
      api.frame();
    },
    pixels() {
      return context.getImageData(0, 0, 640, 480).data;
    },
    png() {
      return canvas.toBuffer("image/png");
    },
    click(x, y, button = 0) {
      pointer("pointerdown", x, y, button);
      pointer("pointerup", x, y, button);
    },
    press(x, y) {
      pointer("pointerdown", x, y);
    },
    move(x, y) {
      pointer("pointermove", x, y);
    },
    release(x, y) {
      pointer("pointerup", x, y);
    },
    key(key, extra = {}) {
      listeners.get("keydown")({
        key,
        code: key,
        preventDefault() {},
        ...extra,
      });
    },
    load(bytes, name = "AUDIT.SFM") {
      return fileListeners.get("change")({
        target: {
          files: [
            { name, arrayBuffer: async () => Uint8Array.from(bytes).buffer },
          ],
        },
      });
    },
  };
}

module.exports = { createGameRuntime };
