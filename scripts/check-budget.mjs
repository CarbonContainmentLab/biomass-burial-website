/**
 * Payload budget check, run after `npm run build`.
 *
 * 03 §16 set two numbers this can verify from `dist/`:
 *
 *   initial JS, gzipped   < 300 KB   (the target)
 *   total transfer        < 15 MB    (all layers on)
 *
 * **Both were amended when the basemap became a Protomaps vector tileset**
 * (04_BUILD_PLAN §5.10). Neither overage is drift; each was a decision:
 *
 *   JS      MapLibre is ~230 KB gzipped and is not optional for vector tiles.
 *           There is no version of this feature that fits 300 KB.
 *   Total   was raised to 55 MB when the 36.8 MB Protomaps archive was
 *           downloaded whole. **It is back at 15 MB.** The archive is now read
 *           over HTTP Range, so a session pulls the tiles it looks at — order
 *           1–3 MB — rather than the entire file.
 *
 * That makes the archive a *deploy* artifact rather than a session cost, and
 * the two are counted separately below. Conflating them was what forced the
 * ceiling up in the first place: one number cannot answer both "how much does
 * a visitor download" and "how much has to be on the server".
 *
 * Raise a CEILING only with a reason. Lowering one is the goal.
 */

import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const DATA = join(DIST, 'data');

const TARGET_JS = 300 * 1024;
// Was 345 KB, then 620 KB when MapLibre + pmtiles + @protomaps/basemaps came in
// and the chunk was measured "near 580". It measures 626 KB, and has since
// before the Range switch — that was verified by building both loaders and
// getting the same number to the tenth of a KB, so the 580 was simply a stale
// reading rather than something that grew. 680 restores the ~10% of headroom a
// ceiling needs to catch a real regression instead of tripping on drift.
const CEILING_JS = 680 * 1024;
const TARGET_TRANSFER = 15 * 1024 * 1024;
const TOTAL_TRANSFER = 15 * 1024 * 1024;

/**
 * Read over HTTP Range, so its size is not what a visitor downloads. Reported
 * on its own line and excluded from the session total — see the header.
 */
const RANGED = /\.pmtiles$/i;

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

/** The entry chunk is the one `index.html` loads directly. */
function entryChunk() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const match = html.match(/src="[^"]*?\/(assets\/[^"]+\.js)"/);
  if (!match) throw new Error('could not find the entry script in dist/index.html');
  return match[1];
}

const entry = entryChunk();
const entryGzip = gzipSync(readFileSync(join(DIST, entry)), { level: 9 }).length;

/**
 * Everything a session could fetch with every layer on: the entry chunk, its
 * lazy chunks, the CSS, and all of public/data. Formats that are already
 * compressed are counted as-is, matching how the pipeline measured its side.
 */
const alreadyCompressed = /\.(tif|webp|bin|png|jpg|woff2?|otf|pmtiles|pbf)$/i;
let total = 0;
let ranged = 0;
for (const dir of [ASSETS, DATA]) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    continue;
  }
  for (const name of entries) {
    if (name.endsWith('.map')) continue;
    const path = join(dir, name);
    if (!statSync(path).isFile()) continue;
    const bytes = readFileSync(path);
    const size = alreadyCompressed.test(name) ? bytes.length : gzipSync(bytes, { level: 9 }).length;
    if (RANGED.test(name)) ranged += size;
    else total += size;
  }
}

const failures = [];
if (entryGzip > CEILING_JS) {
  failures.push(`initial JS ${kb(entryGzip)} exceeds the ceiling of ${kb(CEILING_JS)}`);
}
if (total > TOTAL_TRANSFER) {
  failures.push(`total transfer ${mb(total)} exceeds ${mb(TOTAL_TRANSFER)}`);
}

console.log(`entry chunk        ${entry}`);
console.log(`initial JS, gzip   ${kb(entryGzip)}  (ceiling ${kb(CEILING_JS)}, target ${kb(TARGET_JS)})`);
if (entryGzip > TARGET_JS) {
  console.log(`                   ${kb(entryGzip - TARGET_JS)} over the 03 §16 target — see 04_BUILD_PLAN §6`);
}
console.log(`session transfer   ${mb(total)}  (ceiling ${mb(TOTAL_TRANSFER)}, target ${mb(TARGET_TRANSFER)})`);
if (total > TARGET_TRANSFER) {
  console.log(`                   ${mb(total - TARGET_TRANSFER)} over the 03 §16 target`);
}
if (ranged > 0) {
  console.log(`ranged, not counted ${mb(ranged)}  the Protomaps archive — served by HTTP Range,`);
  console.log(`                   so a session reads the tiles it looks at, not the file.`);
  console.log(`                   Still a required deploy artifact: see .gitignore.`);
}

if (failures.length > 0) {
  console.error(`\nBudget check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nBudget check passed.');
