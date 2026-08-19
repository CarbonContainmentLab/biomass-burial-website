/**
 * Boot sequence.
 *
 * Split in two on purpose. `bootSync` runs before React renders, so the URL's
 * state is already in the store when the panels first paint and no dropdown is
 * ever flashed empty (03 §7). `loadBlockingAssets` is the async half and runs
 * from an effect once the shell is on screen.
 */

import { loadCountyStatsFile, loadCounties, loadDepthCog, loadManifest, loadStates } from '../data/source';
import { setInitialCamera } from '../map/viewState';
import { getState } from '../state/store';
import { parseCamera, parseUrl, startUrlSync } from '../state/url';

export function bootSync(): () => void {
  const { search } = location;
  getState().applyUrlState(parseUrl(search));
  // The camera is not store state (03 §6), so it takes its own route: parked in
  // `viewState` for `MapView` to pick up on its first render. Set before
  // `startUrlSync`, whose immediate write would otherwise serialise "no camera"
  // and strip the params off the link the visitor just opened.
  setInitialCamera(parseCamera(search));
  return startUrlSync();
}

/**
 * The blocking set from 03 §8.1, which is also `manifest.payload.blocking`.
 *
 * The manifest is awaited first because two later steps need it: the basemap
 * bounds, and the check that shipped distances really are EPSG:5070. Everything
 * after that runs in parallel and is allowed to fail on its own — a missing
 * county outline must not stop depth and terrain from drawing.
 *
 * `blockingReady` therefore means "every blocking request has settled", not
 * "everything arrived". What failed is in `data.failed`, and each feature
 * reports its own absence.
 */
export async function loadBlockingAssets(): Promise<void> {
  getState().setBlockingReady(false);

  try {
    await loadManifest();
  } catch {
    // A failed manifest is the one blocking failure that gets a whole-page
    // card: it is 3 KB, so if it did not arrive the data directory is
    // unreachable and nothing else will arrive either.
    getState().setBlockingReady(true);
    return;
  }

  await Promise.allSettled([
    loadStates(),
    loadCounties(),    loadCountyStatsFile(),
    loadDepthCog(),
  ]);

  getState().setBlockingReady(true);
}
