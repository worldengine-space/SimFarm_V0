import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { listFiles, zipDirectory } from "./lib/zip.mjs";
import "./build.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = join(root, "dist/web");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const runtimeFiles = [
  "index.html",
  "styles.css",
  "launcher.js",
  "game.js",
  "manifest.webmanifest",
  "branding",
  "assets",
  "data",
];
for (const file of runtimeFiles)
  await cp(join(root, file), join(destination, file), { recursive: true });
const htmlPath = join(destination, "index.html");
const html = await readFile(htmlPath, "utf8");
await writeFile(
  htmlPath,
  html.replace(
    "</head>",
    '<meta name="simfarm-offline" content="enabled" />\n  </head>',
  ),
);
await writeFile(join(destination, ".nojekyll"), "");
const assets = [];
for (const path of await listFiles(destination)) {
  if (path.startsWith(".")) continue;
  const bytes = await readFile(join(destination, path));
  assets.push({
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const template = await readFile(
  new URL("service-worker-template.js", import.meta.url),
  "utf8",
);
const version = createHash("sha256")
  .update(JSON.stringify(assets))
  .update(template)
  .digest("hex")
  .slice(0, 16);
await writeFile(
  join(destination, "asset-manifest.json"),
  JSON.stringify({ version, assets }, null, 2) + "\n",
);
const release = {
  version,
  files: [...assets.map((asset) => asset.path), "asset-manifest.json"],
};
await writeFile(
  join(destination, "service-worker.js"),
  template.replace(
    'const RELEASE = { version: "development", files: [] };',
    `const RELEASE = ${JSON.stringify(release)};`,
  ),
);
await zipDirectory(destination, join(root, "dist/SimFarm-V0-Web.zip"));
console.log(
  `Web release ${version}: ${assets.length} files, ${(assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1048576).toFixed(1)} MiB cached for offline play.`,
);
console.log("Created dist/web and dist/SimFarm-V0-Web.zip.");
