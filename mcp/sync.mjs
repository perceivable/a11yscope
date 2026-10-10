/**
 * Copies the engine out of the extension source into ./engine so the npm
 * package is self-contained. The extension stays the record of truth; this
 * runs on `npm test` and `prepack`, never by hand.
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// Injection order matters: libs, then rules, then the engine that runs them.
export const ENGINE_FILES = [
  "src/lib/color.js",
  "src/lib/dom.js",
  "src/rules/text-alternatives.js",
  "src/rules/contrast.js",
  "src/rules/structure.js",
  "src/rules/interaction.js",
  "src/content/engine.js",
];

await mkdir(join(here, "engine"), { recursive: true });
for (const file of ENGINE_FILES) {
  await copyFile(join(root, file), join(here, "engine", file.split("/").pop()));
}
const { version } = JSON.parse(await (await import("node:fs/promises")).readFile(join(root, "package.json"), "utf8"));
await writeFile(
  join(here, "engine", "manifest.json"),
  JSON.stringify({ engineVersion: version, files: ENGINE_FILES.map((f) => f.split("/").pop()) }, null, 2) + "\n"
);
console.log(`engine ${version} → mcp/engine (${ENGINE_FILES.length} files)`);
