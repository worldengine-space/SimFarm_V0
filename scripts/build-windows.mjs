import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../", import.meta.url));
const requireDesktop = createRequire(
  new URL("../platforms/desktop/package.json", import.meta.url),
);
const { build, Platform, Arch } = requireDesktop("electron-builder");
const stage = await fs.mkdtemp(path.join(os.tmpdir(), "simfarm-windows-"));
const source = path.join(stage, "source");
await fs.mkdir(path.join(source, "game"), { recursive: true });
for (const name of ["main.cjs", "self-test.cjs", "package.json"]) {
  await fs.copyFile(
    path.join(root, "platforms/desktop", name),
    path.join(source, name),
  );
}
for (const name of [
  "index.html",
  "styles.css",
  "launcher.js",
  "manifest.webmanifest",
  "branding",
  "game.js",
  "assets",
  "data",
]) {
  await fs.cp(path.join(root, name), path.join(source, "game", name), {
    recursive: true,
  });
}
// The hook is inert in normal launches and stays inside the packaged copy.
const gameFile = path.join(source, "game/game.js");
// Git on Windows may check out source sections with CRLF line endings.
let gameSource = (await fs.readFile(gameFile, "utf8")).replaceAll("\r\n", "\n");
const testHook = `  if (window.__sfDesktopTestEnabled) window.__sfDesktopTest = {
    ready: () => ready,
    exercise() {
      stage = 'region'; selectedRegion = {gridX:1,gridY:3};
      click({x:160,y:244},false);
      if(stage !== 'game') throw Error('Region Play did not start a farm');
      state.speed='Pause';
      const bytes=serializeSfmBytes();
      if(bytes.length!==139072) throw Error('Wrong SFM size');
      importSfmBytes(bytes,'TEST.SFM');
      saveGame(); downloadSfmFile('TEST.SFM');
      clearGameWindows(); render();
      return stage==='game';
    },
    restore() {loadGame(); clearGameWindows(); render(); return stage==='game' && currentSaveName==='TEST.SFM' && farmStateBytes.length===139072;}
  };\n`;
if (!gameSource.includes("  load();\n"))
  throw Error("Review desktop test integration entrypoint");
await fs.writeFile(
  gameFile,
  gameSource.replace("  load();\n", testHook + "  load();\n"),
);
// The portable target is one downloadable EXE; it unpacks privately and launches
// the bundled runtime. Users do not need to extract or keep a support folder.
const outputs = await build({
  projectDir: source,
  targets: Platform.WINDOWS.createTarget(["portable", "zip"], Arch.x64),
  publish: "never",
  config: {
    appId: "space.worldengine.simfarm",
    productName: "SimFarm V0",
    electronVersion: "44.3.0",
    npmRebuild: false,
    asar: true,
    directories: { output: path.join(root, "dist") },
    files: ["main.cjs", "self-test.cjs", "package.json", "game/**/*"],
    win: {
      executableName: "SimFarm",
      signAndEditExecutable: false,
      artifactName: "SimFarm-V0-Windows-x64.${ext}",
    },
    portable: {
      artifactName: "SimFarm-V0-Windows.exe",
      requestExecutionLevel: "user",
    },
  },
});
console.log(JSON.stringify({ artifacts: outputs }, null, 2));
