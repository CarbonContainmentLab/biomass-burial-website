/**
 * Named selectors, so subscriptions stay narrow and identical across
 * components. `useStore(selectMaxDepth)` reads better than an inline arrow and,
 * more importantly, makes it obvious in review when a component is subscribing
 * to more than it needs (03 §6).
 */

import { useStore, type Store } from './store';
import type { AssetId, LayerId } from './types';

export const selectLayers = (s: Store) => s.layers;
export const selectMaxDepth = (s: Store) => s.maxDepth;
export const selectMode = (s: Store) => s.mode;
export const selectBiomassMetric = (s: Store) => s.biomassMetric;
export const selectBeccsScenario = (s: Store) => s.beccsScenario;

export const selectLeftOpen = (s: Store) => s.ui.leftOpen;
export const selectRightOpen = (s: Store) => s.ui.rightOpen;
export const selectPicking = (s: Store) => s.ui.picking;

export const selectHoverGeoid = (s: Store) => s.hover.geoid;

export const selectCounty = (s: Store) => s.county;
export const selectSite = (s: Store) => s.site;

export const selectBlockingReady = (s: Store) => s.data.blockingReady;
export const selectDistanceCrsUnsupported = (s: Store) => s.data.distanceCrsUnsupported;

/** True once all four Mode 1 controls are set. Says nothing about biomass. */
export const selectCountySelectionComplete = (s: Store) =>
  s.county.stateFips !== null &&
  s.county.geoid !== null &&
  s.county.roadIdx !== null &&
  s.county.slopeIdx !== null;

export const selectLayerOn = (id: LayerId) => (s: Store) => s.layers[id];

/* ---- Asset status hooks -------------------------------------------------- */

export const useAssetLoaded = (id: AssetId): boolean =>
  useStore((s) => s.data.loaded.has(id));

export const useAssetFailed = (id: AssetId): boolean =>
  useStore((s) => s.data.failed.has(id));
