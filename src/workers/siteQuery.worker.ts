/**
 * Site-search worker. Decodes `sites.bin` once, then ranks candidates per query.
 * No DOM, no deck.gl (03 §20).
 *
 * Why a worker at all: 871,094 sites is a 3.5 MB delta-decode plus a full scan
 * per query. On the main thread that is a visible hitch in the render loop every
 * time the button is pressed, and the decode would block the first paint of the
 * result card.
 *
 * Ranking is by **cost**: see `SCORE` below. It supersedes the "shallowest
 * first, nearest as tiebreak" rule of 03 §12, which answered "where is burial
 * easiest near here" but could not say whether easier was worth farther. The
 * mockup's `score = depth + miles * 0.012` asked the right question with an
 * invented exchange rate — a metre of cover against 83 miles of haul. The rate
 * here is derived from the TEA instead.
 */

/// <reference lib="webworker" />

export interface DecodeRequest {
  type: 'decode';
  buffer: ArrayBuffer;
  count: number;
  /** Byte offsets from sites_index.json, not assumed. */
  offsets: { dx: number; dy: number; depthCm: number };
}

export interface QueryRequest {
  type: 'query';
  id: number;
  /** EPSG:5070 metres. Converted on the main thread by lib/crs.ts. */
  originX: number;
  originY: number;
  radiusM: number;
  maxDepthCm: number;
}

export type WorkerRequest = DecodeRequest | QueryRequest;

export interface DecodeResponse {
  type: 'decoded';
  count: number;
}

export interface QueryResponse {
  type: 'result';
  id: number;
  hit: { x: number; y: number; depthCm: number; distanceM: number } | null;
  /** Candidates inside the radius, before the depth filter — for diagnostics. */
  scanned: number;
  elapsedMs: number;
}

export interface ErrorResponse {
  type: 'error';
  id?: number;
  message: string;
}

export type WorkerResponse = DecodeResponse | QueryResponse | ErrorResponse;

export interface SiteIndex {
  xs: Float64Array;
  ys: Float64Array;
  depths: Uint16Array;
}

export interface SiteRanking {
  x: number;
  y: number;
  depthCm: number;
  distanceM: number;
}

/**
 * Coordinates ship as int32 **deltas** in raster scan order, which is what gets
 * the whole index down to 10 bytes a site. A running sum recovers absolute
 * EPSG:5070 metres.
 *
 * Float64 rather than Int32 for the accumulated positions: the sum is exact in
 * either, but every consumer subtracts and hypots these, and float64 avoids a
 * per-access conversion in the hot loop.
 *
 * Exported and pure so `siteRank.test.ts` can exercise the byte layout against a
 * committed fixture — a pipeline change to the encoding should break a test
 * rather than the site.
 */
export function decodeSites(
  buffer: ArrayBuffer,
  count: number,
  offsets: { dx: number; dy: number; depthCm: number },
): SiteIndex {
  const dx = new Int32Array(buffer, offsets.dx, count);
  const dy = new Int32Array(buffer, offsets.dy, count);
  const cm = new Uint16Array(buffer, offsets.depthCm, count);

  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < count; i++) {
    ax += dx[i]!;
    ay += dy[i]!;
    xs[i] = ax;
    ys[i] = ay;
  }

  // Copied rather than kept as a view so the 8.7 MB source buffer can be freed.
  return { xs, ys, depths: new Uint16Array(cm) };
}

/* ---- Scoring -------------------------------------------------------------
 *
 * A site is worth what it saves. Both of its costs are priced by the TEA in the
 * same unit — dollars per tonne of CO2e — so they can simply be subtracted from
 * each other rather than weighted by taste:
 *
 *   depth     A percentage point of carbon efficiency is worth $0.7774
 *             (K = $77.74 per unit). A metre of burial cover costs 3.09
 *             percentage points at average soil carbon (slope 0.0309), so a
 *             metre costs 3.09 x 0.7774 = $2.402.
 *   distance  $0.1023 per km (alpha, Table S2).
 *
 * The exchange rate between them, 0.1023 / 2.402, is what the ranking really
 * is: **a farther site must be 4.3 cm shallower for every extra kilometre**, or
 * equivalently a metre of extra depth only pays for itself if it saves 23.5 km
 * of travel.
 *
 * BASE is the intercept from the TEA. It shifts every score equally and so has
 * no effect on which site wins; it is kept because it makes a score readable as
 * an efficiency figure rather than as a bare penalty.
 *
 * Constants are folded into the units the loop already holds — centimetres and
 * metres — so ranking 871,094 sites costs no divisions.
 */
const SCORE_BASE = 62.54;
/** $2.402 per metre, expressed per centimetre. */
const COST_PER_DEPTH_CM = 0.024_02;
/** $0.1023 per km, expressed per metre. */
const COST_PER_DISTANCE_M = 0.000_102_3;

/**
 * Shallowest first, nearest as tiebreak. Exported and pure for the same reason.
 *
 * Returns `null` when nothing inside the radius meets the depth threshold, which
 * is a result and not an error.
 */
export function rankSites(
  index: SiteIndex,
  query: { originX: number; originY: number; radiusM: number; maxDepthCm: number },
): { hit: SiteRanking | null; scanned: number } {
  const { xs, ys, depths } = index;
  const { originX, originY, radiusM, maxDepthCm } = query;
  const radiusSq = radiusM * radiusM;
  const count = depths.length;

  let bestIndex = -1;
  let bestScore = -Infinity;
  let bestDistSq = Infinity;
  let scanned = 0;

  for (let i = 0; i < count; i++) {
    const depth = depths[i]!;
    if (depth > maxDepthCm) continue;

    /* The score this candidate would earn at zero distance, which is the most
       it can possibly earn. If that ceiling cannot beat the incumbent, neither
       can the candidate, so the position lookups and the square root are
       skipped. This replaces the old `depth > bestDepth` shortcut, which is no
       longer sound: under a cost rule a deeper site can win by being nearer. */
    const ceiling = SCORE_BASE - COST_PER_DEPTH_CM * depth;
    if (ceiling <= bestScore) continue;

    // Square prefilter before the circle, so the common rejection costs two
    // comparisons rather than two multiplies.
    const ddx = xs[i]! - originX;
    if (ddx > radiusM || ddx < -radiusM) continue;
    const ddy = ys[i]! - originY;
    if (ddy > radiusM || ddy < -radiusM) continue;

    const distSq = ddx * ddx + ddy * ddy;
    if (distSq > radiusSq) continue;
    scanned++;

    const score = ceiling - COST_PER_DISTANCE_M * Math.sqrt(distSq);
    // Exact ties are vanishingly unlikely with continuous scores, but two sites
    // of equal depth and equal distance are not, and the nearer-wins rule is
    // what the old ranking would have done.
    if (score > bestScore || (score === bestScore && distSq < bestDistSq)) {
      bestIndex = i;
      bestScore = score;
      bestDistSq = distSq;
    }
  }

  return {
    hit:
      bestIndex < 0
        ? null
        : {
            x: xs[bestIndex]!,
            y: ys[bestIndex]!,
            depthCm: depths[bestIndex]!,
            distanceM: Math.sqrt(bestDistSq),
          },
    scanned,
  };
}

/* ---- Worker plumbing ----------------------------------------------------- */

let index: SiteIndex | null = null;

function handle(request: WorkerRequest): WorkerResponse {
  if (request.type === 'decode') {
    index = decodeSites(request.buffer, request.count, request.offsets);
    return { type: 'decoded', count: request.count };
  }
  if (!index) throw new Error('site index has not been decoded');

  const started = performance.now();
  const { hit, scanned } = rankSites(index, request);
  return { type: 'result', id: request.id, hit, scanned, elapsedMs: performance.now() - started };
}

// Guarded so this module can be imported by a Vitest run in Node, where there is
// no `self` and nothing to listen to.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    try {
      self.postMessage(handle(request));
    } catch (error) {
      const response: ErrorResponse = {
        type: 'error',
        ...(request.type === 'query' ? { id: request.id } : {}),
        message: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    }
  };
}
