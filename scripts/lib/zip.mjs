import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, byte) => {
  let value = byte;
  for (let bit = 0; bit < 8; bit += 1)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
export async function listFiles(directory, prefix = "") {
  const entries = await readdir(join(directory, prefix), {
    withFileTypes: true,
  });
  const result = [];
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      result.push(...(await listFiles(directory, relative)));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}
// A deterministic, dependency-free ZIP writer for these small release bundles.
// Entries use deflate, UTF-8 names, and a fixed DOS timestamp (1980-01-01).
export async function zipDirectory(directory, destination) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  const paths = await listFiles(directory);
  if (paths.length > 65535) throw new Error("ZIP64 is not supported");
  for (const relative of paths) {
    const name = Buffer.from(relative);
    const bytes = await readFile(join(directory, relative));
    const packed = deflateRawSync(bytes, { level: 9 });
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    localRecords.push(local, name, packed);
    centralRecords.push(central, name);
    offset += local.length + name.length + packed.length;
    if (offset > 0xffffffff) throw new Error("ZIP64 is not supported");
  }
  const centralSize = centralRecords.reduce(
    (sum, part) => sum + part.length,
    0,
  );
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(paths.length, 8);
  end.writeUInt16LE(paths.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(
    destination,
    Buffer.concat([...localRecords, ...centralRecords, end]),
  );
}
