import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { decodeSites, rankSites, type SiteIndex } from '../workers/siteQuery.worker';
import tinyIndex from './fixtures/sites_index.tiny.json';

/**
 * The fixture holds five sites on a line east of −1,500,000 m in EPSG:5070:
 *
 *   #0  x −1,500,000   500 cm
 *   #1  x −1,499,000   300 cm      1 km away
 *   #2  x −1,498,000   300 cm      2 km away, ties #1 on depth
 *   #3  x −1,450,000   100 cm     50 km away
 *   #4  x −1,400,000    50 cm    100 km away
 *
 * Built so the ranking rule and the obvious alternatives disagree. Scores under
 * the cost rule, to three places:
 *
 *   #0  50.530   #1  55.232   #2  55.129   #3  55.023   #4  51.109
 *
 * So a distance-first sort returns #0, a shallowest-first sort returns #4, and
 * the cost rule returns **#1** — near and only moderately deep. #3 is the
 * instructive one: two metres shallower than #1, which buys 46.96 km, but it
 * sits 49 km farther away, so it loses by 0.21.
 */
function loadFixture(): { index: SiteIndex; offsets: { dx: number; dy: number; depthCm: number } } {
  const bytes = readFileSync(new URL('./fixtures/sites.tiny.bin', import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const offsetOf = (field: string) => {
    const entry = tinyIndex.layout.find((l) => l.field === field);
    if (!entry) throw new Error(`fixture index has no ${field}`);
    return entry.offset;
  };
  const offsets = { dx: offsetOf('dx'), dy: offsetOf('dy'), depthCm: offsetOf('depth_cm') };
  return { index: decodeSites(buffer as ArrayBuffer, tinyIndex.count, offsets), offsets };
}

const ORIGIN = { originX: -1_500_000, originY: 2_000_000 };
const km = (n: number) => n * 1000;

describe('decodeSites', () => {
  it('recovers absolute positions from the delta encoding', () => {
    const { index } = loadFixture();
    expect(index.xs.length).toBe(5);
    expect([...index.xs]).toEqual([-1_500_000, -1_499_000, -1_498_000, -1_450_000, -1_400_000]);
    // Every site shares a northing, so the dy deltas after the first are zero.
    expect([...index.ys]).toEqual([2_000_000, 2_000_000, 2_000_000, 2_000_000, 2_000_000]);
    expect([...index.depths]).toEqual([500, 300, 300, 100, 50]);
  });

  it('agrees with the layout the fixture declares', () => {
    expect(tinyIndex.count * 10 + 4).toBe(tinyIndex.bytes);
    expect(tinyIndex.crs).toBe('EPSG:5070');
    expect(tinyIndex.encoding.coordinates).toBe('delta');
  });
});

describe('rankSites', () => {
  it('returns the best depth-and-distance trade, not the shallowest', () => {
    const { index } = loadFixture();
    const { hit } = rankSites(index, { ...ORIGIN, radiusM: km(200), maxDepthCm: 1000 });
    expect(hit).not.toBeNull();
    // #1, not the 50 cm site 100 km away that the old shallowest-first rule
    // returned: reaching it costs $10.23 of haul to save $1.20 of depth.
    expect(hit!.depthCm).toBe(300);
    expect(hit!.x).toBe(-1_499_000);
    expect(hit!.distanceM).toBeCloseTo(km(1), 6);
  });

  it('prefers the nearer of two sites at equal depth', () => {
    const { index } = loadFixture();
    // A 10 km radius sees #0 (500), #1 (300) and #2 (300). Equal depth means
    // the distance term alone separates #1 from #2, and #0 is too deep to
    // compete despite being at the origin.
    const { hit } = rankSites(index, { ...ORIGIN, radiusM: km(10), maxDepthCm: 1000 });
    expect(hit!.depthCm).toBe(300);
    expect(hit!.x).toBe(-1_499_000);
    expect(hit!.distanceM).toBeCloseTo(km(1), 6);
  });

  it('honours the depth threshold', () => {
    const { index } = loadFixture();
    // At 200 cm only #3 and #4 qualify. #4 is shallower, but it is 50 km
    // farther, and half a metre of depth does not buy 50 km — so #3 wins.
    expect(rankSites(index, { ...ORIGIN, radiusM: km(200), maxDepthCm: 200 }).hit!.depthCm).toBe(
      100,
    );
    // At 60 cm only #4 qualifies.
    expect(rankSites(index, { ...ORIGIN, radiusM: km(200), maxDepthCm: 60 }).hit!.depthCm).toBe(50);
    // At 40 cm nothing does.
    expect(rankSites(index, { ...ORIGIN, radiusM: km(200), maxDepthCm: 40 }).hit).toBeNull();
  });

/**
   * The rate, asserted directly rather than inferred from the fixture: a metre
   * of extra cover is worth 2.402 / 0.1023 = 23.48 km of travel. A site that
   * saves a metre and costs less than that in haul should win; one that costs
   * more should lose. This is the number the whole ranking turns on, so it is
   * pinned on its own.
   */
  it('trades one metre of depth for 23.5 km of travel', () => {
    const twoSites = (deepAtOrigin: number, shallowFarKm: number, shallowCm: number): SiteIndex => ({
      xs: new Float64Array([ORIGIN.originX, ORIGIN.originX + km(shallowFarKm)]),
      ys: new Float64Array([ORIGIN.originY, ORIGIN.originY]),
      depths: new Uint16Array([deepAtOrigin, shallowCm]),
    });

    // 200 cm at the origin against 100 cm — one metre shallower — 23 km away.
    // Just inside the break-even, so the farther, shallower site wins.
    const worthIt = rankSites(twoSites(200, 23, 100), { ...ORIGIN, radiusM: km(50), maxDepthCm: 1000 });
    expect(worthIt.hit!.depthCm).toBe(100);

    // The same metre saved, now 24 km away. Just past break-even, so it loses.
    const notWorthIt = rankSites(twoSites(200, 24, 100), { ...ORIGIN, radiusM: km(50), maxDepthCm: 1000 });
    expect(notWorthIt.hit!.depthCm).toBe(200);
    expect(notWorthIt.hit!.distanceM).toBe(0);
  });

  it('honours the radius', () => {
    const { index } = loadFixture();
    // Only #0 is within 500 m.
    const near = rankSites(index, { ...ORIGIN, radiusM: 500, maxDepthCm: 1000 });
    expect(near.hit!.depthCm).toBe(500);
    expect(near.scanned).toBe(1);
  });

  it('returns null rather than an error when nothing is in range', () => {
    const { index } = loadFixture();
    const far = rankSites(index, { originX: 0, originY: 0, radiusM: km(10), maxDepthCm: 1000 });
    expect(far.hit).toBeNull();
    expect(far.scanned).toBe(0);
  });

  it('measures distance in the plane, so the radius is a circle not a square', () => {
    const { index } = loadFixture();
    // A site 1 km east is inside a 1.2 km radius but a site 1 km east *and* north
    // of it would not be; the fixture is collinear, so assert the exact metric.
    const { hit } = rankSites(index, { ...ORIGIN, radiusM: 1200, maxDepthCm: 400 });
    expect(hit!.distanceM).toBeCloseTo(1000, 6);
  });

  it('is unaffected by the order sites appear in', () => {
    const { index } = loadFixture();
    const reversed: SiteIndex = {
      xs: new Float64Array([...index.xs].reverse()),
      ys: new Float64Array([...index.ys].reverse()),
      depths: new Uint16Array([...index.depths].reverse()),
    };
    const a = rankSites(index, { ...ORIGIN, radiusM: km(10), maxDepthCm: 1000 }).hit;
    const b = rankSites(reversed, { ...ORIGIN, radiusM: km(10), maxDepthCm: 1000 }).hit;
    expect(b!.depthCm).toBe(a!.depthCm);
    expect(b!.x).toBe(a!.x);
  });
});
