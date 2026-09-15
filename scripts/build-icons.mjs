// Reproduce the World Engine site navigation mark as app-sized PNGs.
import { createCanvas } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
const directory = new URL("../branding/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size, markScale] of [
  ["icon-180", 180, 0.72],
  ["icon-192", 192, 0.72],
  ["icon-512", 512, 0.72],
  ["icon-maskable-512", 512, 0.64],
]) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.fillStyle = "#10130f";
  context.fillRect(0, 0, size, size);
  const width = size * markScale;
  context.translate((size - width) / 2, (size - width) / 2);
  context.scale(width / 32, width / 32);
  context.beginPath();
  context.arc(16, 16, 14, 0, Math.PI * 2);
  context.strokeStyle = "#9aa3a6";
  context.globalAlpha = 0.7;
  context.lineWidth = 1.1;
  context.stroke();
  context.globalAlpha = 1;
  context.beginPath();
  context.moveTo(16, 8);
  context.lineTo(23, 23);
  context.lineTo(16, 19);
  context.lineTo(9, 23);
  context.closePath();
  context.fillStyle = "#d4af37";
  context.fill();
  await writeFile(
    new URL(`${name}.png`, directory),
    canvas.toBuffer("image/png"),
  );
}
