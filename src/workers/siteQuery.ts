/**
 * Main-thread side of the site search. Owns the `Worker` instance (03 §6) and the
 * two things the worker must not do: coordinate transforms and county attribution.
 *
 * The split follows the pipeline's own rule — displayed pixels are never
 * measured. The worker works entirely in EPSG:5070 metres, which is the CRS the
 * index was written in; the projection happens here, once per query, on two
 * points.
 */

import type { FeatureCollection, Point } from 'geojson';

import { albersToLngLat, lngLatToAlbers } from '../lib/crs';
import { euclideanAlbers } from '../lib/distance';
import { fmtCountyName } from '../lib/format';
import { stateName } from '../lib/fips';
import { featureBbox, findContainingFeature } from '../lib/pointInPolygon';
import { albers, centimeters, meters, miToM, type LatLng, type Miles } from '../lib/units';
import { loadSiteIndex, peekCounties, type BeccsFeature, type BeccsProps } from '../data/source';
import type { ScenarioPct, SiteHit } from '../state/types';
import type { WorkerRequest, WorkerResponse } from './siteQuery.worker';

let worker: Worker | null = null;
let decoded: Promise<void> | null = null;
let nextQueryId = 1;

const pending = new Map<
  number,
  { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./siteQuery.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === 'result') {
      pending.get(message.id)?.resolve(message);
      pending.delete(message.id);
    } else if (message.type === 'error' && message.id !== undefined) {
      pending.get(message.id)?.reject(new Error(message.message));
      pending.delete(message.id);
    } else if (message.type === 'error') {
      console.error('[siteQuery] worker error', message.message);
    }
  };
  worker.onerror = (event) => {
    console.error('[siteQuery] worker failed', event.message);
    for (const { reject } of pending.values()) reject(new Error(event.message));
    pending.clear();
  };
  return worker;
}

function post(request: WorkerRequest, transfer?: Transferable[]): void {
  ensureWorker().postMessage(request, transfer ?? []);
}

/**
 * Fetch and decode the index, once. Called when Mode 2 first opens rather than at
 * boot: `sites.bin` is 8.7 MB, and a visitor who only ever looks up a county
 * should never pay for it (03 §8.1).
 */
export function ensureSiteIndex(): Promise<void> {
  if (decoded) return decoded;

  decoded = (async () => {
    const { index, buffer } = await loadSiteIndex();

    const offsetOf = (field: string): number => {
      const entry = index.layout.find((l) => l.field === field);
      if (!entry) throw new Error(`sites_index.json has no "${field}" field`);
      return entry.offset;
    };

    const worker = ensureWorker();
    await new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'decoded') {
          worker.removeEventListener('message', onMessage);
          resolve();
        } else if (event.data.type === 'error' && event.data.id === undefined) {
          worker.removeEventListener('message', onMessage);
          reject(new Error(event.data.message));
        }
      };
      worker.addEventListener('message', onMessage);

      // The buffer is transferred, not copied: it is 8.7 MB and the main thread
      // has no further use for it.
      post(
        {
          type: 'decode',
          buffer,
          count: index.count,
          offsets: { dx: offsetOf('dx'), dy: offsetOf('dy'), depthCm: offsetOf('depth_cm') },
        },
        [buffer],
      );
    });
  })().catch((error: unknown) => {
    decoded = null;
    throw error;
  });

  return decoded;
}

export interface SiteQueryResult {
  hit: SiteHit | null;
  elapsedMs: number;
}

export async function findBestSite(
  origin: LatLng,
  radiusMi: Miles,
  maxDepthCm: number,
): Promise<SiteQueryResult> {
  await ensureSiteIndex();

  const originAlbers = lngLatToAlbers(origin);
  const id = nextQueryId++;

  const response = await new Promise<WorkerResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    post({
      type: 'query',
      id,
      originX: originAlbers.x as number,
      originY: originAlbers.y as number,
      radiusM: miToM(radiusMi) as number,
      maxDepthCm,
    });
  });

  if (response.type !== 'result') throw new Error('unexpected worker response');
  if (!response.hit) return { hit: null, elapsedMs: response.elapsedMs };

  const { x, y, depthCm, distanceM } = response.hit;
  const point = albersToLngLat(albers(x, y));

  return {
    hit: {
      point,
      depthCm: centimeters(depthCm),
      distanceM: meters(distanceM),
      ...attributeToCounty(point),
    },
    elapsedMs: response.elapsedMs,
  };
}

/**
 * Which county the winning site sits in, by point-in-polygon against the outlines
 * already in memory — not by nearest centroid, which is wrong for any long or
 * concave county and the west is full of those.
 *
 * Sites are 1 km pixel centres, so a site can be up to ~707 m from the query
 * point even where burial is feasible on the exact spot. That is the model's
 * resolution and the interface does not apologise for it (03 §8.8).
 */
function attributeToCounty(point: LatLng): Pick<SiteHit, 'countyGeoid' | 'countyLabel'> {
  const counties = peekCounties();
  if (!counties) return { countyGeoid: null, countyLabel: null };

  const feature = findContainingFeature(point.lng, point.lat, counties.features, countyBboxes(counties));
  if (!feature) return { countyGeoid: null, countyLabel: null };

  return {
    countyGeoid: feature.properties.GEOID,
    countyLabel: fmtCountyName(feature.properties.NAME, stateName(feature.properties.STATEFP)),
  };
}

/** 414 multipolygons is enough vertices that the boxes are computed once. */
let bboxCache: {
  source: unknown;
  boxes: [number, number, number, number][];
} | null = null;

function countyBboxes(
  counties: NonNullable<ReturnType<typeof peekCounties>>,
): [number, number, number, number][] {
  if (bboxCache?.source === counties) return bboxCache.boxes;
  const boxes = counties.features.map(featureBbox);
  bboxCache = { source: counties, boxes };
  return boxes;
}

/* ---- BECCS comparison ---------------------------------------------------- */

export interface BeccsSearchResult {
  feature: BeccsFeature;
  distanceM: number;
}

/**
 * Nearest modelled facility in the active scenario, **within the user's radius**.
 *
 * This is a deliberate divergence from the published method and from
 * `manifest.decisions.beccs.search_radius_mi`, which is 250 miles: v1 matches the
 * mockup, where the radius the user set is the radius that is searched. The
 * consequence is honest and visible — at the 25% scenario there are 17 facilities
 * in eleven states, so "none in range" is the usual answer at 25 miles, and that
 * *is* the finding rather than a failure.
 *
 * Restoring the paper's behaviour is one constant: search
 * `manifest.decisions.beccs.search_radius_mi` here instead of `radiusMi`.
 *
 * Distances use the `x_albers` / `y_albers` the pipeline shipped, so this panel
 * and the radius search measure the same miles (03 §12).
 */
export function findNearestBeccs(
  data: FeatureCollection<Point, BeccsProps> | null,
  scenario: ScenarioPct,
  origin: LatLng,
  radiusMi: Miles,
): BeccsSearchResult | null {
  // Filtered here rather than by importing the layer module: query logic must not
  // depend on a layer, which is only a descriptor factory (03 §20).
  const candidates = (data?.features ?? []).filter((f) => f.properties.scenario === scenario);
  if (candidates.length === 0) return null;

  const from = lngLatToAlbers(origin);
  const radiusM = miToM(radiusMi) as number;

  let best: BeccsSearchResult | null = null;
  for (const feature of candidates) {
    const to = albers(feature.properties.x_albers, feature.properties.y_albers);
    const distanceM = euclideanAlbers(from, to) as number;
    if (distanceM > radiusM) continue;
    if (!best || distanceM < best.distanceM) best = { feature, distanceM };
  }
  return best;
}
