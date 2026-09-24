/**
 * Builds the .zip that gets uploaded to the Chrome Web Store.
 *
 * Explicit allow-list rather than an ignore-list: an accidental upload of
 * node_modules or a stray key file is the kind of mistake you only make once,
 * and it is trivial to prevent by naming what ships.
 */
import { createWriteStream } from "node:fs";
import { readFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateRaw } from "node:zlib";
import { promisify } from "node:util";

const deflate = promisify(deflateRaw);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SHIP = [
  "manifest.json",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "src/background/service_worker.js",
  "src/content/engine.js",
  "src/content/highlight.js",
  "src/lib/color.js",
  "src/lib/dom.js",
  "src/lib/license.js",
  "src/panel/panel.html",
  "src/panel/panel.css",
  "src/panel/panel.js",
  "src/panel/report.js",
  "src/rules/text-alternatives.js",
  "src/rules/contrast.js",
  "src/rules/structure.js",
  "src/rules/interaction.js",
];

/* ---- minimal zip writer (no dependency needed for 19 small files) ---- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function dosTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, day };
}

async function buildZip(entries, stamp) {
  const { time, day } = dosTime(stamp);
  const locals = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const compressed = await deflate(entry.data, { level: 9 });
    const useStored = compressed.length >= entry.data.length;
    const payload = useStored ? entry.data : compressed;
    const method = useStored ? 0 : 8;
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, nameBytes, payload);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(payload.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);

    central.push(dir, nameBytes);
    offset += local.length + nameBytes.length + payload.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
}

/* ---- main ---- */

const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));

const entries = [];
for (const name of SHIP) {
  const path = join(root, name);
  try {
    await stat(path);
  } catch {
    console.error(`missing file listed in SHIP: ${name}`);
    process.exit(1);
  }
  entries.push({ name, data: await readFile(path) });
}

await mkdir(join(root, "dist"), { recursive: true });
const outPath = join(root, "dist", `a11yscope-${manifest.version}.zip`);

// Fixed timestamp so rebuilding the same source produces the same bytes.
const zip = await buildZip(entries, new Date("2026-01-01T00:00:00Z"));
await new Promise((resolve, reject) => {
  const stream = createWriteStream(outPath);
  stream.on("error", reject);
  stream.on("finish", resolve);
  stream.end(zip);
});

const kb = (zip.length / 1024).toFixed(1);
console.log(`${outPath}`);
console.log(`${entries.length} files, ${kb} KB`);
