import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "simfarm-mac-build-"));
const distribution = path.join(stage, "SimFarm V0 for Mac");
const app = path.join(distribution, "SimFarm V0.app");
const contents = path.join(app, "Contents"),
  game = path.join(contents, "Resources/game");
fs.mkdirSync(path.join(contents, "MacOS"), { recursive: true });
fs.mkdirSync(game, { recursive: true });
for (const name of [
  "index.html",
  "styles.css",
  "launcher.js",
  "manifest.webmanifest",
  "branding",
  "game.js",
  "assets",
  "data",
])
  fs.cpSync(path.join(root, name), path.join(game, name), { recursive: true });
// Native WebKit uses an ephemeral loopback origin. Bridge saves to UserDefaults
// so the player's farm survives a new port on the next launch.
let source = fs.readFileSync(path.join(game, "game.js"), "utf8");
if ((source.match(/localStorage\./g) ?? []).length !== 2)
  throw Error("Review save persistence integration");
source = source.replaceAll("localStorage.", "window.nativeScoreStore.");
const exportAnchor = "    const urlApi = globalThis.URL;";
if (!source.includes(exportAnchor))
  throw Error("Review file export integration");
source = source.replace(
  exportAnchor,
  `    if (window.webkit?.messageHandlers?.saveFile) {
      window.webkit.messageHandlers.saveFile.postMessage({name:currentSaveName,base64:encodeState(bytes)});
      return bytes;
    }
${exportAnchor}`,
);
const testHook = `  if (window.__sfTestEnabled) window.__sfTest = {
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
  };
`;
if (!source.includes("  load();\n"))
  throw Error("Review integration test entrypoint");
source = source.replace("  load();\n", testHook + "  load();\n");
fs.writeFileSync(path.join(game, "game.js"), source);
const files = {};
function inventory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) inventory(full);
    else {
      if (
        !/\.(html|css|js|json|png|wav|ogg|mid|svg|webmanifest)$/.test(
          entry.name,
        )
      )
        throw Error("Unexpected runtime file: " + full);
      const bytes = fs.readFileSync(full);
      files[path.relative(game, full)] = {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }
  }
}
inventory(game);
fs.writeFileSync(
  path.join(game, "BUILD-MANIFEST.json"),
  JSON.stringify(
    {
      implementation:
        "Reconstructed JavaScript SimFarm; no DOS executable, emulator, or recompiled original",
      host: "macOS WebKit; native file panels and save cache",
      sourceSha256: createHash("sha256")
        .update(fs.readFileSync(path.join(root, "game.js")))
        .digest("hex"),
      files,
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(contents, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>SimFarm</string><key>CFBundleIdentifier</key><string>space.worldengine.simfarm</string>
<key>CFBundleName</key><string>SimFarm V0</string><key>CFBundleDisplayName</key><string>SimFarm V0</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>NSHumanReadableCopyright</key><string>Reconstructed implementation. Original artwork and names belong to their respective rights holders.</string>
</dict></plist>`,
);
for (const arch of ["arm64", "x86_64"])
  execFileSync(
    "xcrun",
    [
      "swiftc",
      "-swift-version",
      "5",
      "-O",
      "-target",
      `${arch}-apple-macos13.0`,
      path.join(root, "platforms/macos/Main.swift"),
      "-o",
      path.join(stage, arch),
      "-framework",
      "Cocoa",
      "-framework",
      "WebKit",
      "-framework",
      "Network",
    ],
    { stdio: "inherit" },
  );
execFileSync("lipo", [
  "-create",
  path.join(stage, "arm64"),
  path.join(stage, "x86_64"),
  "-output",
  path.join(contents, "MacOS/SimFarm"),
]);
execFileSync("codesign", ["--force", "--sign", "-", "--timestamp=none", app], {
  stdio: "inherit",
});
execFileSync("codesign", ["--verify", "--deep", "--strict", app]);
fs.copyFileSync(
  path.join(root, "platforms/macos/READ ME.txt"),
  path.join(distribution, "READ ME.txt"),
);
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const output = path.join(root, "dist/SimFarm-V0-macOS-universal.zip");
execFileSync("ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  distribution,
  output,
]);
// A single standard installer puts the universal app into /Applications.
const installerRoot = path.join(stage, "installer-root");
fs.mkdirSync(installerRoot, { recursive: true });
fs.cpSync(app, path.join(installerRoot, path.basename(app)), {
  recursive: true,
});
const installer = path.join(root, "dist/SimFarm-V0-macOS.pkg");
const components = path.join(stage, "components.plist");
fs.writeFileSync(
  components,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><array><dict>
<key>RootRelativeBundlePath</key><string>SimFarm V0.app</string>
<key>BundleIsRelocatable</key><false/>
<key>BundleIsVersionChecked</key><true/>
<key>BundleHasStrictIdentifier</key><true/>
<key>BundleOverwriteAction</key><string>upgrade</string>
</dict></array></plist>`,
);
execFileSync(
  "pkgbuild",
  [
    "--root",
    installerRoot,
    "--component-plist",
    components,
    "--identifier",
    "space.worldengine.simfarm",
    "--version",
    "0.1.0",
    "--install-location",
    "/Applications",
    installer,
  ],
  { stdio: "inherit" },
);
console.log(
  JSON.stringify(
    {
      app,
      installer,
      installerBytes: fs.statSync(installer).size,
      zip: output,
      bytes: fs.statSync(output).size,
      stage,
    },
    null,
    2,
  ),
);
