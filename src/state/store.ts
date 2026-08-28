/**
 * The one Zustand store: defaults and actions. No I/O (03 §20).
 *
 * Every component subscribes through a selector — `useStore(s => s.maxDepth)` —
 * never bare `useStore()`. A LayerRow re-rendering on a slider tick is a bug,
 * and at 60 fps it is a visible one.
 */

import { create } from 'zustand';

import { meters, type LatLng, type Meters } from '../lib/units';
import {
  MAX_DEPTH_MAX,
  MAX_DEPTH_MIN,
  type AppState,
  type AssetId,
  type BeccsHit,
  type BiomassMetric,
  type LayerId,
  type Mode,
  type RadiusMi,
  type RoadIdx,
  type ScenarioPct,
  type SiteHit,
  type SiteStatus,
  type SlopeIdx,
} from './types';

export interface Actions {
  setLayer: (id: LayerId, on: boolean) => void;
  toggleLayer: (id: LayerId) => void;
  setBiomassMetric: (metric: BiomassMetric) => void;
  setBeccsScenario: (pct: ScenarioPct) => void;
  setMaxDepth: (m: Meters) => void;
  setMode: (mode: Mode) => void;

  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setPicking: (picking: boolean) => void;
  setTourOpen: (tourOpen: boolean) => void;

  setHoverGeoid: (geoid: string | null) => void;

  selectState: (stateFips: string | null) => void;
  selectCounty: (geoid: string | null) => void;
  /** Map click: state and county together, so the cascade never sees a mismatch. */
  selectCountyFromMap: (stateFips: string, geoid: string) => void;
  setRoadIdx: (idx: RoadIdx | null) => void;
  setSlopeIdx: (idx: SlopeIdx | null) => void;

  setSiteOrigin: (origin: LatLng | null) => void;
  setRadiusMi: (radiusMi: RadiusMi) => void;
  setCompareBeccs: (on: boolean) => void;
  setSiteStatus: (status: SiteStatus) => void;
  setSiteResult: (result: SiteHit | null, status: SiteStatus) => void;
  setBeccsResult: (beccs: BeccsHit | null | 'none-in-range') => void;

  setManifestReady: (ready: boolean, distanceCrsUnsupported: boolean) => void;
  markLoaded: (id: AssetId) => void;
  markFailed: (id: AssetId) => void;
  setBlockingReady: (ready: boolean) => void;
  /** Retry after a blocking failure: clears the failure set so loaders re-run. */
  clearFailures: () => void;

  /** Applied by boot.ts from the URL, before panels first paint (03 §7). */
  applyUrlState: (patch: UrlPatch) => void;
}

export interface UrlPatch {
  layers?: Partial<Record<LayerId, boolean>>;
  maxDepth?: Meters;
  mode?: Mode;
  biomassMetric?: BiomassMetric;
  beccsScenario?: ScenarioPct;
  county?: Partial<AppState['county']>;
  site?: Partial<Pick<AppState['site'], 'origin' | 'radiusMi' | 'compareBeccs' | 'searched'>>;
}

export type Store = AppState & Actions;

/** 03 §6 "Defaults on first paint, before the URL is parsed". */
export const DEFAULT_STATE: AppState = {
  layers: { depth: true, biomass: false, whp: false, thinning: false, beccs: false },
  biomassMetric: 'acres',
  beccsScenario: 25,
  maxDepth: meters(MAX_DEPTH_MAX),
  mode: 'county',
  ui: { leftOpen: true, rightOpen: true, picking: false, tourOpen: false },
  hover: { geoid: null },
  county: { stateFips: null, geoid: null, roadIdx: null, slopeIdx: null },
  site: {
    origin: null,
    radiusMi: 25,
    compareBeccs: false,
    status: 'idle',
    result: null,
    beccs: null,
    searched: false,
  },
  data: {
    manifestReady: false,
    distanceCrsUnsupported: false,
    loaded: new Set<AssetId>(),
    failed: new Set<AssetId>(),
    blockingReady: false,
  },
};

const clampDepth = (m: Meters): Meters =>
  meters(Math.min(MAX_DEPTH_MAX, Math.max(MAX_DEPTH_MIN, m as number)));

/** A new Set every time: Zustand compares by reference. */
const withAdded = <T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> => new Set(set).add(value);

export const useStore = create<Store>()((set) => ({
  ...DEFAULT_STATE,

  setLayer: (id, on) => set((s) => ({ layers: { ...s.layers, [id]: on } })),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setBiomassMetric: (biomassMetric) => set({ biomassMetric }),
  setBeccsScenario: (beccsScenario) =>
    set((s) => ({
      beccsScenario,
      // The comparison was computed against the old scenario's facilities, so
      // it is no longer an answer to the question on screen.
      site: { ...s.site, beccs: null },
    })),
  setMaxDepth: (m) => set({ maxDepth: clampDepth(m) }),
  setMode: (mode) => set({ mode }),

  setLeftOpen: (leftOpen) => set((s) => ({ ui: { ...s.ui, leftOpen } })),
  setRightOpen: (rightOpen) => set((s) => ({ ui: { ...s.ui, rightOpen } })),
  setPicking: (picking) => set((s) => ({ ui: { ...s.ui, picking } })),
  setTourOpen: (tourOpen) => set((s) => ({ ui: { ...s.ui, tourOpen } })),

  setHoverGeoid: (geoid) =>
    set((s) => (s.hover.geoid === geoid ? s : { hover: { geoid } })),

  // Changing state clears the county; road and slope are left alone (03 §11).
  selectState: (stateFips) =>
    set((s) => ({ county: { ...s.county, stateFips, geoid: null } })),
  selectCounty: (geoid) => set((s) => ({ county: { ...s.county, geoid } })),
  selectCountyFromMap: (stateFips, geoid) =>
    set((s) => ({ county: { ...s.county, stateFips, geoid } })),
  setRoadIdx: (roadIdx) => set((s) => ({ county: { ...s.county, roadIdx } })),
  setSlopeIdx: (slopeIdx) => set((s) => ({ county: { ...s.county, slopeIdx } })),

  setSiteOrigin: (origin) =>
    set((s) => ({
      // Moving the origin invalidates both result cards but keeps the radius.
      // `searched` goes with them: the question changed, so the recorded answer
      // is no longer an answer to it, and a link written now must not tell its
      // recipient to reproduce one.
      site: { ...s.site, origin, status: 'idle', result: null, beccs: null, searched: false },
    })),
  setRadiusMi: (radiusMi) =>
    set((s) => ({
      site: { ...s.site, radiusMi, status: 'idle', result: null, beccs: null, searched: false },
    })),
  setCompareBeccs: (compareBeccs) => set((s) => ({ site: { ...s.site, compareBeccs } })),
  setSiteStatus: (status) => set((s) => ({ site: { ...s.site, status } })),
  setSiteResult: (result, status) =>
    set((s) => ({
      site: {
        ...s.site,
        result,
        status,
        // `error` is not a finished search — it is a search that did not happen.
        // Recording it would hand the recipient a link that retries a failure on
        // every load and shows them an error card they cannot act on.
        searched: status === 'done' || status === 'empty',
      },
    })),
  setBeccsResult: (beccs) => set((s) => ({ site: { ...s.site, beccs } })),

  setManifestReady: (manifestReady, distanceCrsUnsupported) =>
    set((s) => ({ data: { ...s.data, manifestReady, distanceCrsUnsupported } })),
  markLoaded: (id) =>
    set((s) => {
      const failed = new Set(s.data.failed);
      failed.delete(id);
      return { data: { ...s.data, loaded: withAdded(s.data.loaded, id), failed } };
    }),
  markFailed: (id) => set((s) => ({ data: { ...s.data, failed: withAdded(s.data.failed, id) } })),
  setBlockingReady: (blockingReady) => set((s) => ({ data: { ...s.data, blockingReady } })),
  clearFailures: () => set((s) => ({ data: { ...s.data, failed: new Set<AssetId>() } })),

  applyUrlState: (patch) =>
    set((s) => ({
      layers: patch.layers ? { ...s.layers, ...patch.layers } : s.layers,
      maxDepth: patch.maxDepth === undefined ? s.maxDepth : clampDepth(patch.maxDepth),
      mode: patch.mode ?? s.mode,
      biomassMetric: patch.biomassMetric ?? s.biomassMetric,
      beccsScenario: patch.beccsScenario ?? s.beccsScenario,
      county: { ...s.county, ...patch.county },
      site: { ...s.site, ...patch.site },
    })),
}));

/** Non-React read, for modules outside the component tree. */
export const getState = useStore.getState;
