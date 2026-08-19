/**
 * Site-search worker. Decodes `sites.bin` once, then ranks candidates per query.
 * No DOM, no deck.gl (03 §20).
 *
 * Why a worker at all: 871,094 sites is a 3.5 MB delta-decode plus a full scan
 * per query. On the main thread that is a visible hitch in the render loop every
 * time the button is pressed, and the decode would block the first paint of the
 * result card.
 *
 * Ranking is **shallowest first, nearest as tiebreak** (03 §12). Not the mockup's
 * `score = depth + miles * 0.012`, which silently trades a metre of cover against
 * 83 miles of haul, and not a distance-first sort — the question the panel asks is
 * "where is burial easiest near here", and cover thickness is what "easiest" means.
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
  let bestDepth = Infinity;
  let bestDistSq = Infinity;
  let scanned = 0;

  for (let i = 0; i < count; i++) {
    const depth = depths[i]!;
    // Depth first: it is the primary sort key and the cheapest test, and it
    // rejects most of the index before any arithmetic happens. A candidate
    // deeper than the current best can never win, so it is skipped outright.
    if (depth > maxDepthCm || depth > bestDepth) continue;

    // Square prefilter before the circle, so the common rejection costs two
    // comparisons rather than two multiplies.
    const ddx = xs[i]! - originX;
    if (ddx > radiusM || ddx < -radiusM) continue;
    const ddy = ys[i]! - originY;
    if (ddy > radiusM || ddy < -radiusM) continue;

    const distSq = ddx * ddx + ddy * ddy;
    if (distSq > radiusSq) continue;
    scanned++;

    // Written out rather than relying on the `depth > bestDepth` guard above to
    // have made the equality case implicit. The two clauses *are* the ranking
    // rule, and they should be readable as such.
    if (depth < bestDepth || (depth === bestDepth && distSq < bestDistSq)) {
      bestIndex = i;
      bestDepth = depth;
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
