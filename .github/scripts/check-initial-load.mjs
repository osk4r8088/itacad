// Checks that the first page load does not fetch the two large chunks: the password dictionaries
// (analyze-*) and the search index (_virtual_search-index-*). Both must load only on demand.
//
// It starts from the scripts and preloads in dist/index.html and follows every static import
// (`import ... from "./x.js"` and `export ... from "./x.js"`), but not dynamic `import("./x.js")`.
// Usage: node .github/scripts/check-initial-load.mjs [dist]

import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const ON_DEMAND = [/^analyze-/, /^_virtual_search-index-/];

const start = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const seen = new Set();
const queue = [...start];
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const code = readFileSync(join(dist, file), 'utf8');
  // Static imports and re-exports; a dynamic import has a parenthesis after `import`.
  for (const m of code.matchAll(/(?:\bimport|\bexport)\s*(?:[\w*{}\s,$]+\s*from\s*)?["'](\.\.?\/[^"']+\.js)["']/g)) {
    queue.push(posix.normalize(posix.join(posix.dirname(file), m[1])));
  }
}

const names = [...seen].map((f) => posix.basename(f));
const bad = names.filter((n) => ON_DEMAND.some((r) => r.test(n)));
console.log(`First page load: ${names.length} script files.`);
if (bad.length) {
  console.error(`These must load on demand, but the first page load reaches them: ${bad.join(', ')}`);
  process.exit(1);
}
const assets = readdirSync(join(dist, 'assets'));
for (const r of ON_DEMAND) if (!assets.some((n) => r.test(n))) console.warn(`Warning: no chunk matches ${r}; was it renamed?`);
console.log('OK: the password dictionaries and the search index are not part of the first page load.');
