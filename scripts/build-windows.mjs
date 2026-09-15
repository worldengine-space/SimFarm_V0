import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const requireDesktop = createRequire(
  new URL("../platforms/desktop/package.json", import.meta.url),
);
const { packager } = requireDesktop("@electron/packager");
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
const [bundle] = await packager({
  dir: source,
  name: "SimFarm V0",
  executableName: "SimFarm",
  platform: "win32",
  arch: "x64",
  electronVersion: "44.3.0",
  out: stage,
  overwrite: true,
  asar: true,
  // No Windows resource editor/Wine dependency is needed for this portable build.
  win32metadata: undefined,
});
await fs.writeFile(
  path.join(bundle, "READ ME.txt"),
  "SimFarm V0 for Windows 10/11 (64 bit)\r\n\r\nExtract the whole ZIP, then open SimFarm.exe. Keep all files together.\r\nThe game runs offline. Use the game File menu to save/open .SFM files.\r\nThis development build is not code signed.\r\nhttps://worldengine.space\r\n",
);
await fs.mkdir(path.join(root, "dist"), { recursive: true });
const output = path.join(root, "dist/SimFarm-V0-Windows-x64.zip");
await fs.rm(output, { force: true });
if (process.platform === "win32") {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Compress-Archive -LiteralPath $env:SF_BUNDLE -DestinationPath $env:SF_OUTPUT",
    ],
    {
      env: { ...process.env, SF_BUNDLE: bundle, SF_OUTPUT: output },
      stdio: "inherit",
    },
  );
} else {
  execFileSync("zip", ["-q", "-r", output, path.basename(bundle)], {
    cwd: path.dirname(bundle),
    stdio: "inherit",
  });
}
console.log(
  JSON.stringify(
    { bundle, zip: output, bytes: (await fs.stat(output)).size },
    null,
    2,
  ),
);
