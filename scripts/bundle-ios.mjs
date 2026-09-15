import { cp, mkdir, readdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const target = new URL("platforms/ios/Web/", root);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

// Include runtime files at the root and runtime asset folders; omit source,
// screenshots, dependencies, and developer documentation from the app bundle.
for (const entry of await readdir(root, { withFileTypes: true })) {
  const runtimeFile = entry.isFile() && /\.(html|css|js|webmanifest|ico)$/.test(entry.name);
  const runtimeFolder = entry.isDirectory() && ["assets", "data", "icons", "branding"].includes(entry.name);
  if (runtimeFile || runtimeFolder) {
    await cp(new URL(entry.name, root), new URL(entry.name, target), { recursive: true });
  }
}
console.log("Bundled offline iOS runtime in platforms/ios/Web");
