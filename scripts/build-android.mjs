import { cp, mkdir, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const project = path.join(root, "platforms/android");
const assets = path.join(project, "app/src/main/assets");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, [path.join(root, "scripts/build.mjs")]);
await rm(assets, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
for (const name of ["index.html", "styles.css", "game.js", "assets", "data"]) {
  await cp(path.join(root, name), path.join(assets, name), { recursive: true });
}
// Include optional web support files when present (touch UI, manifest, icons).
for (const name of [
  "launcher.js",
  "platform.js",
  "platform.css",
  "manifest.webmanifest",
  "icons",
  "branding",
]) {
  if (existsSync(path.join(root, name)))
    await cp(path.join(root, name), path.join(assets, name), {
      recursive: true,
    });
}
if (!process.argv.includes("--assets-only")) {
  const env = { ...process.env };
  const homebrewJdk =
    "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";
  if (!env.JAVA_HOME && existsSync(homebrewJdk)) env.JAVA_HOME = homebrewJdk;
  if (!env.ANDROID_HOME && process.platform === "darwin")
    env.ANDROID_HOME = path.join(os.homedir(), "Library/Android/sdk");
  run(
    process.platform === "win32" ? "gradlew.bat" : "./gradlew",
    ["assembleDebug", "--no-daemon"],
    {
      cwd: project,
      env,
    },
  );
  const target = path.join(root, "dist/SimFarm-0.1.0-android-debug.apk");
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(
    path.join(project, "app/build/outputs/apk/debug/app-debug.apk"),
    target,
  );
  console.log(`Built ${target}`);
}
