import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = resolve("dist");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const entries = [];
async function walk(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, file.name);
    if (file.isDirectory()) await walk(path);
    else {
      const name = relative(root, path);
      if (["_headers", "sw.js", "offline-manifest.json"].includes(name))
        continue;
      const data = await readFile(path);
      entries.push({
        url: name === "index.html" ? "/" : "/" + name,
        bytes: data.length,
        sha256: hash(data),
      });
    }
  }
}
await walk(root);
entries.sort((a, b) => a.url.localeCompare(b.url));
if (!entries.some((entry) => entry.url === "/assets/manifest.json"))
  throw new Error("Run npm run setup:assets before building offline support.");
const version = hash(
  JSON.stringify(entries) + (await readFile(resolve(root, "sw.js"), "utf8")),
).slice(0, 20);
await writeFile(
  resolve(root, "offline-manifest.json"),
  JSON.stringify({
    version,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entries,
  }),
);
console.log(
  `Offline bundle: ${entries.length} files, ${(entries.reduce((sum, entry) => sum + entry.bytes, 0) / 1048576).toFixed(1)} MB`,
);
