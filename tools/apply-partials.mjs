#!/usr/bin/env node
// Same job as apply-partials.py, for machines with Node but no Python.
// Run from the site folder:  node tools/apply-partials.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const PARTS = [
  ["HEADER", "partials/header.html", /<header[^>]*>[\s\S]*?<\/header>/],
  ["FOOTER", "partials/footer.html", /<footer[^>]*>[\s\S]*?<\/footer>/],
  ["STICKY", "partials/sticky-cta.html", /<div class="fixed inset-x-0 bottom-0 z-40(?:(?!<\/div>)[\s\S])*<\/div>/],
];
const SKIP = new Set(["partials", "tools", "media", "covers", "brand", "brochures", "assets", ".git"]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith(".html")) out.push(path.join(dir, e.name));
  }
  return out;
}

const parts = PARTS.filter(([, p]) => fs.existsSync(path.join(ROOT, p)))
  .map(([name, p, finder]) => [name, fs.readFileSync(path.join(ROOT, p), "utf8").trim(), finder]);

let changed = 0;
for (const f of walk(ROOT).sort()) {
  const src = fs.readFileSync(f, "utf8");
  let out = src;
  for (const [name, content, finder] of parts) {
    const block = `<!-- ${name}:START -->${content}<!-- ${name}:END -->`;
    const marker = new RegExp(`<!-- ${name}:START -->[\\s\\S]*?<!-- ${name}:END -->`);
    if (marker.test(out)) out = out.replace(marker, () => block);
    else if (finder.test(out)) out = out.replace(finder, () => block);
    else console.log(`  · ${path.relative(ROOT, f)}: no ${name} found`);
  }
  if (out !== src) { fs.writeFileSync(f, out); changed++; console.log("updated", path.relative(ROOT, f)); }
}
console.log(`\n${changed} file(s) updated.`);
