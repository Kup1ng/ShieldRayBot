/**
 * Copies the static export (out/) into the backend: everything to app/web/static/spa, which
 * FastAPI serves under /static/spa. HTML pages there are read by FastAPI routes, never linked.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "out");
const target = join(root, "..", "app", "web", "static", "spa");

if (!existsSync(join(out, "miniapp", "index.html"))) {
  console.error("sync-export: out/miniapp/index.html is missing; run `next build` first.");
  process.exit(1);
}

// Empty the folder rather than delete it: on Windows a folder that is any process's current
// directory cannot be removed, but its contents can.
mkdirSync(target, { recursive: true });
for (const entry of readdirSync(target)) rmSync(join(target, entry), { recursive: true, force: true });
cpSync(out, target, { recursive: true });
console.log(`sync-export: copied ${out} -> ${target}`);
