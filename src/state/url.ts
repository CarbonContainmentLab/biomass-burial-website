/**
 * The only module that reads or writes `location.search` (03 §7).
 *
 * Shared: layers, max depth, mode, the active query — and, since 04_BUILD_PLAN
 * §5.8, the camera. `03 §0` and `§7` both said the camera is never serialised,
 * on the reasoning kept here for the record: "a link that pins the camera looks
 * helpful and then fights the recipient the moment they pan; a link that pins
 * the *question* answers it wherever they are looking." For a map, that loses —
 * "look at this place" is a primary thing to share, and a recipient who pans is
 * not being fought, they are just moving on.
 *
 * **The camera still does not live in the store.** That is what keeps this
 * affordable. `03 §6` keeps it out so a pan frame touches no subscriber, and
 * this module subscribes to the store; putting the camera in there would run
 * this serialiser on every frame of every drag. Instead `MapView` calls
 * `noteCameraMoved()` and the write is debounced to gesture-idle, so a drag
 * costs one `replaceState` rather than one per frame. That matters twice over:
 * browsers rate-limit `replaceState` (Safari's ceiling is around 100 calls per
 * 30 seconds, and it *throws* past it), and the per-frame budget on the Intel
 * integrated target this page is tuned for has about 8 ms of headroom, which
 * was not cheap to get (04_BUILD_PLAN §6.1).
 *
 * Writes use `replaceState`, so panning does not fill the back button with
 * hundreds of history entries.
 */

import { isCountyGeoid, isStateFips, stateOfGeoid } from '../lib/fips';
import { latLng, meters } from '../lib/units';
import { peekCamera, type CameraParams } from '../map/viewState';
import { useStore, type UrlPatch } from './store';
import {
  LAYER_IDS,
  MAX_DEPTH_MAX,
  MAX_DEPTH_MIN,
  RADIUS_OPTIONS,
  type AppState,
  type BiomassMetric,
  type LayerId,
  type Mode,
  type RadiusMi,
  type RoadIdx,
  type ScenarioPct,
  type SlopeIdx,
} from './types';

const SCENARIOS: readonly ScenarioPct[] = [25, 50, 75, 90, 99];

/* ---- Parse -------------------------------------------------------------- */

/**
 * Unknown params are ignored. So is anything invalid: a bad FIPS, an
 * out-of-range depth, a radius that is not one of the four options. A shared
 * link that has been hand-edited should degrade to the default view, never to a
 * broken one.
 */
export function parseUrl(search: string): UrlPatch {
  const q = new URLSearchParams(search);
  const patch: UrlPatch = {};

  const layersParam = q.get('layers');
  if (layersParam !== null) {
    const on = new Set(layersParam.split(',').filter(Boolean));
    const layers: Partial<Record<LayerId, boolean>> = {};
    for (const id of LAYER_IDS) layers[id] = on.has(id);
    patch.layers = layers;
  }

  const d = Number(q.get('d'));
  if (q.has('d') && Number.isFinite(d) && d >= MAX_DEPTH_MIN && d <= MAX_DEPTH_MAX) {
    patch.maxDepth = meters(d);
  }

  const mode = q.get('mode');
  if (mode === 'county' || mode === 'site') patch.mode = mode as Mode;

  const bm = q.get('bm');
  if (bm === 'acres' || bm === 'bdmt') patch.biomassMetric = bm as BiomassMetric;

  const sc = Number(q.get('sc'));
  if (SCENARIOS.includes(sc as ScenarioPct)) patch.beccsScenario = sc as ScenarioPct;

  const county: NonNullable<UrlPatch['county']> = {};
  const co = q.get('co');
  const st = q.get('st');
  // A county implies its state, so `co` alone is enough and a conflicting `st`
  // loses. That keeps `?co=04001&st=06` from producing an empty dropdown.
  if (isCountyGeoid(co)) {
    county.geoid = co;
    county.stateFips = stateOfGeoid(co);
  } else if (isStateFips(st)) {
    county.stateFips = st;
  }
  const rd = Number(q.get('rd'));
  if (q.has('rd') && (rd === 0 || rd === 1 || rd === 2)) county.roadIdx = rd as RoadIdx;
  const sl = Number(q.get('sl'));
  if (q.has('sl') && (sl === 0 || sl === 1)) county.slopeIdx = sl as SlopeIdx;
  if (Object.keys(county).length > 0) patch.county = county;

  const site: NonNullable<UrlPatch['site']> = {};
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  if (
    q.has('lat') &&
    q.has('lng') &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  ) {
    site.origin = latLng(lat, lng);
  }
  const r = Number(q.get('r'));
  if (RADIUS_OPTIONS.includes(r as RadiusMi)) site.radiusMi = r as RadiusMi;
  if (q.has('beccs')) site.compareBeccs = q.get('beccs') === '1';
  /**
   * Only meaningful alongside an origin — "a search was run" says nothing
   * without the point it was run from, and `SiteSearch` would have nothing to
   * re-run. A hand-edited `?searched=1` on its own is dropped rather than
   * leaving the panel claiming an answer it can never produce.
   */
  if (site.origin && q.get('searched') === '1') site.searched = true;
  if (Object.keys(site).length > 0) patch.site = site;

  return patch;
}

/**
 * The camera, read separately from `parseUrl` because it is not store state and
 * must not appear in a `UrlPatch`. `boot.ts` hands the result to
 * `viewState.setInitialCamera`.
 *
 * Three plain params rather than one packed `@lat,lng,zoom`: `URLSearchParams`
 * percent-encodes a comma, so the packed form would read `c=42.2%2C-114.5%2C5`.
 * Separate keys also match how the Mode 2 origin is already written (`lat` /
 * `lng`).
 *
 * All three are required — a half-specified camera is ignored rather than
 * guessed at, the same rule the origin coordinate follows. Zoom range is not
 * checked here; `viewState.initialViewState` clamps it, so the zoom policy lives
 * with the zoom constants.
 */
export function parseCamera(search: string): CameraParams | null {
  const q = new URLSearchParams(search);
  if (!q.has('clat') || !q.has('clng') || !q.has('cz')) return null;

  const latitude = Number(q.get('clat'));
  const longitude = Number(q.get('clng'));
  const zoom = Number(q.get('cz'));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(zoom)) {
    return null;
  }
  // 85 rather than 90: past that Web Mercator has no finite y.
  if (Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null;

  return { longitude, latitude, zoom };
}

/* ---- Serialise ----------------------------------------------------------- */

/**
 * Terrain is omitted from `layers` because it is always on (03 §7).
 *
 * `camera` is a parameter rather than a `peekCamera()` call so this stays a pure
 * function of its inputs and the round-trip tests need no map runtime. Passing
 * nothing writes no camera params, which is also what a fresh visit produces:
 * the first write happens before `MapView` mounts, so an untouched link stays
 * clean until the reader actually moves the map.
 */
export function serialiseUrl(state: AppState, camera?: CameraParams | null): string {
  const q = new URLSearchParams();

  q.set('layers', LAYER_IDS.filter((id) => state.layers[id]).join(','));
  q.set('d', trimNumber(state.maxDepth as number));
  q.set('mode', state.mode);

  if (state.county.stateFips) q.set('st', state.county.stateFips);
  if (state.county.geoid) q.set('co', state.county.geoid);
  if (state.county.roadIdx !== null) q.set('rd', String(state.county.roadIdx));
  if (state.county.slopeIdx !== null) q.set('sl', String(state.county.slopeIdx));

  if (state.site.origin) {
    q.set('lat', trimNumber(state.site.origin.lat, 4));
    q.set('lng', trimNumber(state.site.origin.lng, 4));
  }
  q.set('r', String(state.site.radiusMi));
  if (state.site.compareBeccs) q.set('beccs', '1');
  /**
   * The result itself is never written. It does not need to be: a `SiteHit` is
   * a pure function of the origin, radius and max depth already in this string,
   * so one bit saying "the button was pressed" is enough for the recipient to
   * regenerate the identical answer. Serialising the hit would be both larger
   * and a lie waiting to happen — it would keep showing a stale winner after
   * the pipeline reran with new data.
   */
  if (state.site.searched) q.set('searched', '1');

  q.set('sc', String(state.beccsScenario));
  q.set('bm', state.biomassMetric);

  // Last, so the question a link asks stays at the front of it. 4 decimals is
  // ~11 m, far finer than the 1 km data; 2 on zoom is below one visible step.
  if (camera) {
    q.set('clat', trimNumber(camera.latitude, 4));
    q.set('clng', trimNumber(camera.longitude, 4));
    q.set('cz', trimNumber(camera.zoom, 2));
  }

  return q.toString();
}

/** `10` not `10.0`; `44.05` not `44.0500`. */
function trimNumber(n: number, maxDecimals = 1): string {
  return String(Number(n.toFixed(maxDecimals)));
}

/* ---- Wiring ------------------------------------------------------------- */

let lastWritten: string | null = null;
let onCameraMoved: (() => void) | null = null;

/**
 * How long the camera has to stop moving before the URL is written. Long enough
 * that a drag, a wheel zoom, or a fly-to animation coalesces into one write;
 * short enough that a reader who pans and immediately copies the address bar
 * gets what they are looking at.
 */
const CAMERA_IDLE_MS = 400;

/**
 * Mirror the store and the camera into the query string. Returns a teardown.
 *
 * Store changes write immediately: they are discrete, a click at a time. Camera
 * changes are debounced, because they arrive at frame rate — see the note at
 * the top of this file for why that distinction is the whole design.
 *
 * Only the fields `serialiseUrl` reads are compared, so a hover or a
 * load-status change still does not touch the URL.
 */
export function startUrlSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const write = () => {
    const next = serialiseUrl(useStore.getState(), peekCamera());
    if (next === lastWritten) return;
    lastWritten = next;
    const url = `${location.pathname}?${next}${location.hash}`;
    history.replaceState(history.state, '', url);
  };

  write();
  const unsubscribe = useStore.subscribe(write);

  onCameraMoved = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(write, CAMERA_IDLE_MS);
  };

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    onCameraMoved = null;
    unsubscribe();
  };
}

/**
 * Called by `MapView` on every camera change, so it must stay this cheap: one
 * null check and a timer reset. The actual serialise happens once the camera
 * has been still for `CAMERA_IDLE_MS`.
 */
export function noteCameraMoved(): void {
  onCameraMoved?.();
}
