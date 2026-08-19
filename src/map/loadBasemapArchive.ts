/**
 * Serves basemap tiles out of the Protomaps archive over HTTP Range requests.
 *
 * ## Ranged, not whole
 *
 * This used to download all 36.8 MB up front, on the reasoning (04_BUILD_PLAN
 * §5.10) that once it resolved the map would issue zero further requests and
 * would not depend on the host honouring `Range`. Both halves of that have
 * aged badly:
 *
 * - The **cost was paid by everyone, up front, before the map had a basemap at
 *   all.** 36.8 MB is ~3 s on fast broadband and ~30 s on a 10 Mbit line, and
 *   for all of it the visitor looks at flat `--surface-map` with the data
 *   layers floating on nothing. Ranged, the default view needs the four z4
 *   tiles — 339 KB — and paints in well under a second.
 * - The **`Range` worry was unfounded.** Every static host this would plausibly
 *   go to serves ranges. It was also partly a misreading: the reason PMTiles'
 *   own machinery was abandoned here was a MapLibre **6** incompatibility, and
 *   this now runs on MapLibre 5.
 *
 * A session that pans around the fenced camera area fetches roughly 1–3 MB of
 * tiles instead of 36.8 MB, and stops holding the whole archive resident in an
 * `ArrayBuffer` for the lifetime of the tab — which matters on the Intel
 * integrated targets this is tuned for.
 *
 * What is genuinely given up: the map is no longer immune to the network once
 * loaded. Panning somewhere new now needs a request. That is cushioned by the
 * coarse z4 backdrop in `basemapStyle`, which keeps real ground under the
 * viewport at every zoom, so a slow tile degrades to *less detail* rather than
 * to a blank.
 *
 * ## Failure
 *
 * A failed archive is not an error state. The map keeps working on the flat
 * background with all data intact, exactly as if the basemap had been turned
 * off. No whole-page error card — `02 §10` records that pattern as one the
 * mockup had and that should not survive.
 */

import { addProtocol } from 'maplibre-gl';
import { PMTiles } from 'pmtiles';

import { basemapUrl } from '../data/paths';

export type ArchiveStatus = 'idle' | 'loading' | 'ready' | 'failed';

let status: ArchiveStatus = 'idle';
let inFlight: Promise<boolean> | null = null;

export const archiveStatus = (): ArchiveStatus => status;

/**
 * Open the archive, register the `pmtiles://` protocol, and resolve `true` once
 * MapLibre can ask it for tiles.
 *
 * Resolves `false` rather than rejecting: every caller's response to a failure
 * is "carry on without a basemap", and a rejected promise would invite an
 * unhandled rejection at each call site for a case that is not exceptional.
 *
 * Idempotent — concurrent callers share one open, and a second call after
 * success is a no-op. `addProtocol` is global and must be called exactly once.
 */
export function loadBasemapArchive(): Promise<boolean> {
  if (status === 'ready') return Promise.resolve(true);
  if (inFlight) return inFlight;

  status = 'loading';
  inFlight = (async () => {
    const url = basemapUrl();
    try {
      // A string source gets PMTiles' own `FetchSource`, which is the ranged
      // reader. It keeps the header and directories cached, so steady-state
      // cost is one request per tile.
      const archive = new PMTiles(url);

      /**
       * One ranged read of the first bytes, before the style is swapped in.
       * It settles three things at once — the URL resolves, the bytes really
       * are a PMTiles archive, and the host honours `Range` — while the caller
       * can still decide to carry on with the flat background. Without it the
       * first evidence of a missing archive would be every tile failing
       * separately, after the style had already been replaced.
       */
      await archive.getHeader();

      /**
       * The handler is written here rather than using PMTiles' own
       * `Protocol.tile`, which carries its own MapLibre-version compatibility
       * shim. This is four lines and matches the documented signature: given
       * `pmtiles://<archive>/<z>/<x>/<y>`, return the tile bytes.
       * `basemapStyle` declares `tiles:` rather than `url:`, so MapLibre never
       * asks for TileJSON and this is the only shape to handle.
       *
       * The abort signal is forwarded, which matters more now than it did: a
       * fast pan queues tiles for viewports the camera has already left, and
       * without this each one would run to completion against the network.
       */
      addProtocol('pmtiles', async (params, abortController) => {
        const match = /\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
        if (!match) throw new Error(`unexpected pmtiles request: ${params.url}`);
        const [, z, x, y] = match;
        const tile = await archive.getZxy(
          Number(z),
          Number(x),
          Number(y),
          abortController.signal,
        );
        // A missing tile is normal — the extract is a bbox, so the corners of a
        // viewport routinely fall outside it. Empty bytes, not an error.
        return { data: tile ? tile.data : new Uint8Array() };
      });

      status = 'ready';
      return true;
    } catch (error) {
      // Logged, not thrown. The map is expected to carry on without this.
      console.warn('[basemap] archive unavailable, continuing without it:', error);
      status = 'failed';
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
