/**
 * Application state shape (03 §6).
 *
 * Three things are deliberately absent:
 *
 *   - the camera, which lives in a ref inside MapView, because putting it here
 *     re-renders the whole tree on every pan frame;
 *   - decoded data (textures, GeoJSON, county stats, the site index), which
 *     lives in module caches under src/data/ — the store carries only the fact
 *     that an asset loaded;
 *   - the worker, which `src/workers/siteQuery.ts` owns.
 */

import type { Centimeters, LatLng, Meters } from '../lib/units';

/** Terrain is not a LayerId: it is always on and has no row (03 §21.1). */
export type LayerId = 'depth' | 'biomass' | 'whp' | 'thinning' | 'beccs';

export const LAYER_IDS: readonly LayerId[] = ['depth', 'biomass', 'whp', 'thinning', 'beccs'];

export type Mode = 'county' | 'site';
export type RoadIdx = 0 | 1 | 2;
export type SlopeIdx = 0 | 1;
export type RadiusMi = 10 | 25 | 50 | 100;
export type ScenarioPct = 25 | 50 | 75 | 90 | 99;
export type BiomassMetric = 'acres' | 'bdmt';

export const RADIUS_OPTIONS: readonly RadiusMi[] = [10, 25, 50, 100];

/** Slider range and step (03 §21.3). */
export const MAX_DEPTH_MIN = 0.5;
export const MAX_DEPTH_MAX = 10;
export const MAX_DEPTH_STEP = 0.5;

export type AssetId =
  | 'manifest'
  | 'states'
  | 'counties'
  | 'labels'
  | 'countyStats'
  | 'depth'
  | 'basemap'
  | 'whp'
  | 'thinning'
  | 'countiesBiomass'
  | 'beccs'
  | 'sites';

/** The winning site, already converted back to 4326 and attributed to a county. */
export interface SiteHit {
  point: LatLng;
  depthCm: Centimeters;
  distanceM: Meters;
  countyGeoid: string | null;
  /** `Ada County, Idaho`, or the state alone when no county contains the point. */
  countyLabel: string | null;
}

export interface BeccsHit {
  facilityId: number;
  point: LatLng;
  distanceM: Meters;
  state: string;
  plantType: string;
  forestryFraction: number;
  cdrTco2: number;
  costUsdPerTco2: number;
}

export type SiteStatus = 'idle' | 'searching' | 'done' | 'empty' | 'error';

export interface AppState {
  layers: Record<LayerId, boolean>;
  biomassMetric: BiomassMetric;
  beccsScenario: ScenarioPct;
  maxDepth: Meters;
  mode: Mode;

  ui: {
    leftOpen: boolean;
    rightOpen: boolean;
    /** Mode 2 click-to-set is armed. */
    picking: boolean;
    /** The guided tour. Chrome state, never serialised to the URL. */
    tourOpen: boolean;
  };

  hover: {
    geoid: string | null;
  };

  county: {
    stateFips: string | null;
    geoid: string | null;
    roadIdx: RoadIdx | null;
    slopeIdx: SlopeIdx | null;
  };

  site: {
    origin: LatLng | null;
    radiusMi: RadiusMi;
    compareBeccs: boolean;
    status: SiteStatus;
    result: SiteHit | null;
    beccs: BeccsHit | null | 'none-in-range';
    /**
     * Whether the current origin and radius have a finished search behind them.
     *
     * `status` cannot answer this across a reload: a shared link carries the
     * *question* — origin, radius, depth — but a `SiteHit` is worker output and
     * is not serialised, so a recipient always arrives at `status: 'idle'`. This
     * is the one bit that says whether the sender had pressed the button, which
     * is what lets the link reproduce their screen rather than an empty panel.
     *
     * It clears wherever `status` returns to `idle`, so it can never claim an
     * answer for inputs that have since changed.
     */
    searched: boolean;
  };

  data: {
    /** Whether the manifest parsed and named a usable distance CRS. */
    manifestReady: boolean;
    /** True when Mode 2 must be refused because distances are not EPSG:5070. */
    distanceCrsUnsupported: boolean;
    loaded: ReadonlySet<AssetId>;
    failed: ReadonlySet<AssetId>;
    blockingReady: boolean;
  };
}
