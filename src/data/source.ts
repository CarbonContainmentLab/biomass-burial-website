/**
 * The only module that calls `fetch` (03 §8, §20).
 *
 * Everything is a static file under `public/data/`, written by
 * `Backend/pipeline`. There is no server, no API key, and no request that
 * depends on user input. When a later iteration swaps a file for a streaming
 * endpoint, this file changes and nothing else does.
 *
 * Two responsibilities beyond fetching:
 *
 *   1. Each asset loads at most once. The promise is cached, so two components
 *      asking for county outlines at the same moment share one request.
 *   2. Load status is mirrored into the store, which is how a failed optional
 *      layer disables its own row instead of blanking the page.
 *
 * Decoding stops at typed arrays and parsed JSON. Turning a COG into a GPU
 * texture is `data/textures.ts`.
 */

import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';

import { getState } from '../state/store';
import type { AssetId } from '../state/types';
import { distanceCrsSupported, type Manifest } from './manifest';
import { fileUrl, type DataFileKey } from './paths';

/* ---- Data-file types ----------------------------------------------------- */

export interface CountyProps {
  STATEFP: string;
  GEOID: string;
  NAME: string;
}

export interface StateProps extends CountyProps {
  STUSPS: string;
}

export interface CountyBiomassProps extends CountyProps {
  has_biomass: boolean;
  /** Null for the 241 counties outside the residue model. */
  total_acres: number | null;
  total_bdmt: number | null;
  /** Null for the one county with no 1 km pixel centre inside it. */
  depth_median_m: number | null;
}

export interface ThinningProps {
  name: string;
  state: string;
  region: string;
  project_id: string;
  investment_year: number;
  acres: number;
  edited: string;
}

export interface BeccsProps {
  facility_id: number;
  scenario: number;
  state: string;
  plant_type: string;
  cdr_tco2: number;
  cost_usd_per_tco2: number;
  net_cost_usd: number;
  forestry_fraction: number;
  feedstock_tonnes: number;
  /** EPSG:5070 metres, so the panel can measure without reprojecting. */
  x_albers: number;
  y_albers: number;
}

export type CountyFeature = Feature<Polygon | MultiPolygon, CountyProps>;
export type StateFeature = Feature<Polygon | MultiPolygon, StateProps>;
export type CountyBiomassFeature = Feature<Polygon | MultiPolygon, CountyBiomassProps>;
export type BeccsFeature = Feature<Point, BeccsProps>;

export interface SitesIndexFile {
  version: number;
  count: number;
  crs: string;
  layout: { field: string; dtype: string; offset: number; length: number }[];
  depth: { min_cm: number; max_cm: number; floor_m: number; ceiling_m: number };
  bounds: { albers: [number, number, number, number]; wgs84: [number, number, number, number] };
}

/* ---- Cache and status ---------------------------------------------------- */

const cache = new Map<AssetId, Promise<unknown>>();
const resolved = new Map<AssetId, unknown>();

/**
 * Run `loader` once per asset, recording success or failure in the store.
 *
 * A rejected promise is evicted so a Retry actually retries; a resolved one is
 * kept forever, because none of these files change during a session.
 */
function once<T>(id: AssetId, loader: () => Promise<T>): Promise<T> {
  const existing = cache.get(id) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = loader().then(
    (value) => {
      resolved.set(id, value);
      getState().markLoaded(id);
      return value;
    },
    (error: unknown) => {
      cache.delete(id);
      getState().markFailed(id);
      console.error(`[data] ${id} failed to load`, error);
      throw error;
    },
  );

  cache.set(id, promise);
  return promise;
}

/**
 * Synchronous read of an already-loaded asset, or `null`.
 *
 * Components re-render when `data.loaded` changes, so by the time one of these
 * returns non-null the component is being re-rendered anyway. This is what
 * keeps decoded GeoJSON out of the store (03 §6) without forcing every consumer
 * to hold its own copy in React state.
 */
function peek<T>(id: AssetId): T | null {
  return (resolved.get(id) as T | undefined) ?? null;
}

/** Drop cached failures so the next call re-requests. Resolved assets stay. */
export function resetFailedAssets(): void {
  getState().clearFailures();
}

/* ---- Primitives ---------------------------------------------------------- */

async function getJson<T>(key: DataFileKey): Promise<T> {
  const url = fileUrl(key);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function getArrayBuffer(key: DataFileKey): Promise<ArrayBuffer> {
  const url = fileUrl(key);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return await response.arrayBuffer();
}

/* There is no `getImage` here any more. The basemap was the only image this
   module fetched, and it is now a PMTiles archive owned by
   `map/loadBasemapArchive.ts` — which is a deliberate exception to the "one
   module fetches" rule in 03 §8, because MapLibre needs the bytes behind a
   protocol handler rather than as a decoded bitmap. */

/* ---- Blocking assets (03 §8.1) ------------------------------------------- */

export const loadManifest = (): Promise<Manifest> =>
  once('manifest', async () => {
    const manifest = await getJson<Manifest>('manifest');
    // Refuse to boot Mode 2 rather than silently measuring in the wrong CRS.
    // The county tab is unaffected: it reports table values, not distances.
    const supported = distanceCrsSupported(manifest);
    if (!supported) {
      console.error(
        `[data] manifest.decisions.crs.distance is ` +
          `"${manifest.decisions.crs.distance}", not EPSG:5070. Site search is disabled.`,
      );
    }
    getState().setManifestReady(true, !supported);
    return manifest;
  });

export const loadStates = (): Promise<FeatureCollection<Polygon | MultiPolygon, StateProps>> =>
  once('states', () => getJson('states'));

export const loadCounties = (): Promise<FeatureCollection<Polygon | MultiPolygon, CountyProps>> =>
  once('counties', () => getJson('counties'));


export const loadCountyStatsFile = <T>(): Promise<T> => once('countyStats', () => getJson<T>('countyStats'));

export const loadDepthCog = (): Promise<ArrayBuffer> => once('depth', () => getArrayBuffer('depth'));


/* ---- Lazy assets --------------------------------------------------------- */

export const loadWhpCog = (): Promise<ArrayBuffer> => once('whp', () => getArrayBuffer('whp'));

export const loadThinning = (): Promise<FeatureCollection<Polygon | MultiPolygon, ThinningProps>> =>
  once('thinning', () => getJson('thinning'));

export const loadCountiesBiomass = (): Promise<
  FeatureCollection<Polygon | MultiPolygon, CountyBiomassProps>
> => once('countiesBiomass', () => getJson('countiesBiomass'));

export const loadBeccs = (): Promise<FeatureCollection<Point, BeccsProps>> =>
  once('beccs', () => getJson('beccs'));

/**
 * The site index is two files that are only useful together, so they load and
 * fail as one asset. `sites.bin` is 8.7 MB, which is why this is lazy: it is
 * fetched the first time Mode 2 opens, not on boot.
 */
export const loadSiteIndex = (): Promise<{ index: SitesIndexFile; buffer: ArrayBuffer }> =>
  once('sites', async () => {
    const [index, buffer] = await Promise.all([
      getJson<SitesIndexFile>('sitesIndex'),
      getArrayBuffer('sites'),
    ]);
    if (index.count * 10 + 4 !== buffer.byteLength) {
      throw new Error(
        `sites.bin is ${buffer.byteLength} bytes but sites_index.json declares ` +
          `${index.count} sites at 10 bytes each plus a 4-byte count.`,
      );
    }
    return { index, buffer };
  });

/* ---- Synchronous peeks --------------------------------------------------- */

export const peekManifest = () => peek<Manifest>('manifest');
export const peekStates = () => peek<FeatureCollection<Polygon | MultiPolygon, StateProps>>('states');
export const peekCounties = () =>
  peek<FeatureCollection<Polygon | MultiPolygon, CountyProps>>('counties');
export const peekCountiesBiomass = () =>
  peek<FeatureCollection<Polygon | MultiPolygon, CountyBiomassProps>>('countiesBiomass');
export const peekCountyStats = <T>() => peek<T>('countyStats');
export const peekThinning = () =>
  peek<FeatureCollection<Polygon | MultiPolygon, ThinningProps>>('thinning');
export const peekBeccs = () => peek<FeatureCollection<Point, BeccsProps>>('beccs');
