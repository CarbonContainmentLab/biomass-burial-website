/**
 * Query Mode 2 — origin, radius, search.
 *
 * The lat/lng fields are local state, not store state: a half-typed "-11" is not
 * a coordinate, and pushing every keystroke into the store would put an origin
 * marker at longitude −11 somewhere off the coast of Africa on the way to
 * −116.10. The store gets a coordinate only once it parses and lands inside the
 * study area, which is also when the marker and the radius appear — before any
 * search, as in the mockup.
 */

import { useEffect, useState } from 'react';

import { loadBeccs, peekBeccs } from '../data/source';
import { COPY } from '../lib/copy';
import { fmtMeters } from '../lib/format';
import { fitToBounds } from '../map/viewState';
import { latLng, meters, miles, mToCm } from '../lib/units';
import { useStore } from '../state/store';
import { RADIUS_OPTIONS, type BeccsHit, type RadiusMi } from '../state/types';
import { ensureSiteIndex, findBestSite, findNearestBeccs } from '../workers/siteQuery';
import { BeccsResult } from './BeccsResult';
import { EmptyState } from './EmptyState';
import { SiteResult } from './SiteResult';

/** The study area, from `sites_index.json → bounds.wgs84`, rounded outward. */
const BOUNDS = { minLat: 31, maxLat: 49, minLng: -125, maxLng: -102 };

const inStudyArea = (lat: number, lng: number): boolean =>
  lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lng >= BOUNDS.minLng && lng <= BOUNDS.maxLng;

export function SiteSearch() {
  const site = useStore((s) => s.site);
  const maxDepth = useStore((s) => s.maxDepth);
  const beccsScenario = useStore((s) => s.beccsScenario);
  const picking = useStore((s) => s.ui.picking);
  const crsUnsupported = useStore((s) => s.data.distanceCrsUnsupported);
  const sitesFailed = useStore((s) => s.data.failed.has('sites'));

  const setSiteOrigin = useStore((s) => s.setSiteOrigin);
  const setRadiusMi = useStore((s) => s.setRadiusMi);
  const setCompareBeccs = useStore((s) => s.setCompareBeccs);
  const setPicking = useStore((s) => s.setPicking);
  const setSiteStatus = useStore((s) => s.setSiteStatus);
  const setSiteResult = useStore((s) => s.setSiteResult);
  const setBeccsResult = useStore((s) => s.setBeccsResult);

  const [latText, setLatText] = useState(() => site.origin?.lat.toFixed(4) ?? '');
  const [lngText, setLngText] = useState(() => site.origin?.lng.toFixed(4) ?? '');
  const [invalid, setInvalid] = useState(false);

  // A map pick writes the store; the fields follow it.
  useEffect(() => {
    if (!site.origin) return;
    setLatText(site.origin.lat.toFixed(4));
    setLngText(site.origin.lng.toFixed(4));
    setInvalid(false);
  }, [site.origin]);

  // Fetch and decode the 8.7 MB index on first arrival in this tab, so the button
  // is not the first thing that waits on a download (03 §8.1).
  useEffect(() => {
    if (!crsUnsupported) void ensureSiteIndex().catch(() => {});
  }, [crsUnsupported]);

  /**
   * Committed on every keystroke, not on blur.
   *
   * Two reasons. The origin marker and the radius ring are supposed to appear as
   * soon as there is a valid coordinate, before any search (03 §12) — that is how
   * a user judges whether the radius is the one they meant. And committing on
   * blur alone leaves a trap: type a coordinate, click straight through to "Find
   * best burial site", and the button is still disabled because the store has no
   * origin yet.
   *
   * A half-typed longitude like `-11` simply fails the study-area test, so no
   * marker appears until the value is real. The error line is held back until
   * both fields have something in them, so it does not accuse the user of a
   * mistake they are still in the middle of not making.
   */
  const commitCoordinates = (nextLat: string, nextLng: string) => {
    const latText = nextLat.trim();
    const lngText = nextLng.trim();
    if (latText === '' || lngText === '') {
      setInvalid(false);
      setSiteOrigin(null);
      return;
    }
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inStudyArea(lat, lng)) {
      setInvalid(true);
      setSiteOrigin(null);
      return;
    }
    setInvalid(false);
    setSiteOrigin(latLng(lat, lng));
  };

  const runSearch = async () => {
    const origin = site.origin;
    if (!origin) return;
    setSiteStatus('searching');

    try {
      const { hit } = await findBestSite(origin, miles(site.radiusMi), mToCm(maxDepth) as number);
      setSiteResult(hit, hit ? 'done' : 'empty');
      if (hit) {
        fitToBounds(
          [
            Math.min(origin.lng, hit.point.lng),
            Math.min(origin.lat, hit.point.lat),
            Math.max(origin.lng, hit.point.lng),
            Math.max(origin.lat, hit.point.lat),
          ],
          { pad: 0.6 },
        );
      }
    } catch (error) {
      console.error('[site search] failed', error);
      setSiteResult(null, 'error');
      return;
    }

    // The comparison runs even when no burial site was found: "nothing feasible
    // within 25 miles, and the nearest facility is 40 miles away" is a useful
    // answer, and the checkbox asked about the origin, not about the winner.
    if (site.compareBeccs) {
      // Awaited rather than peeked: the layer effect may still be fetching, and a
      // premature peek would report "none in range" when the answer is "not
      // loaded yet" — the two look identical on screen.
      try {
        await loadBeccs();
      } catch {
        setBeccsResult(null);
        return;
      }
      const nearest = findNearestBeccs(peekBeccs(), beccsScenario, origin, miles(site.radiusMi));
      setBeccsResult(nearest ? toBeccsHit(nearest) : 'none-in-range');
    }
  };

  /**
   * Reproduce the sender's search when the link says one was run.
   *
   * `searched` arrives true from the URL while `status` is still `idle` and
   * `result` is still null — the question survived the trip, the answer did
   * not — so this is the gap that has to be closed before the recipient sees
   * the panel. Pressing the button for them is the whole point of the flag:
   * they should land on the sender's screen, not on an empty form that happens
   * to be pre-filled.
   *
   * Guarded on `status === 'idle'` rather than run once on mount, so it cannot
   * fire on top of a search the user has already started, and cannot re-fire
   * after one finishes — `setSiteResult` moves status off `idle` and keeps it
   * there until an input changes, which clears `searched` in the same breath.
   *
   * `findBestSite` awaits the index itself, so there is nothing to wait for
   * here; a cold visit simply spends the fetch inside `runSearch`, showing
   * "Searching…" exactly as a click would.
   */
  useEffect(() => {
    if (!site.searched || site.status !== 'idle' || !site.origin) return;
    if (crsUnsupported || sitesFailed) return;
    void runSearch();
    // `runSearch` closes over the current inputs and is recreated every render;
    // the store fields it reads are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.searched, site.status, site.origin, crsUnsupported, sitesFailed]);

  if (crsUnsupported) {
    return (
      <div>
        <p className="query-intro">{COPY.siteIntro}</p>
        <EmptyState>{COPY.siteSearchUnavailable}</EmptyState>
      </div>
    );
  }

  const searchable = site.origin !== null && !sitesFailed;

  return (
    <div>
      <p className="query-intro">{COPY.siteIntro}</p>

      <div className="latlng-row">
        <div>
          <label className="field-label" htmlFor="site-lat">
            {COPY.labelLatitude}
          </label>
          <input
            id="site-lat"
            type="text"
            inputMode="decimal"
            value={latText}
            placeholder={COPY.latPlaceholder}
            onChange={(event) => {
              setLatText(event.target.value);
              commitCoordinates(event.target.value, lngText);
            }}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="site-lng">
            {COPY.labelLongitude}
          </label>
          <input
            id="site-lng"
            type="text"
            inputMode="decimal"
            value={lngText}
            placeholder={COPY.lngPlaceholder}
            onChange={(event) => {
              setLngText(event.target.value);
              commitCoordinates(latText, event.target.value);
            }}
          />
        </div>
      </div>

      {invalid && (
        <div className="caption" style={{ color: 'var(--error)', marginBottom: 8 }}>
          {COPY.siteInvalidPoint}
        </div>
      )}

      <button
        type="button"
        className="pick-button"
        aria-pressed={picking}
        onClick={() => setPicking(!picking)}
      >
        {picking ? COPY.pickActive : COPY.pickIdle}
      </button>

      <label className="field-label" htmlFor="site-radius" style={{ marginTop: 14 }}>
        {COPY.labelRadius}
      </label>
      <select
        id="site-radius"
        value={site.radiusMi}
        onChange={(event) => setRadiusMi(Number(event.target.value) as RadiusMi)}
      >
        {RADIUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {COPY.radiusOption(option)}
          </option>
        ))}
      </select>

      <label className="checkbox-row" style={{ marginTop: 12 }}>
        <input
          type="checkbox"
          checked={site.compareBeccs}
          onChange={(event) => setCompareBeccs(event.target.checked)}
        />
        <span>{COPY.compareBeccs}</span>
      </label>

      <button
        type="button"
        className="btn-primary"
        style={{ marginTop: 14 }}
        disabled={!searchable || site.status === 'searching'}
        onClick={() => void runSearch()}
      >
        {site.status === 'searching' ? COPY.searching : COPY.findSite}
      </button>

      {sitesFailed && (
        <div className="caption" style={{ marginTop: 8, color: 'var(--error)' }}>
          {COPY.layerFailed.sites}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {site.status === 'done' && site.result && <SiteResult site={site.result} />}

        {site.status === 'empty' && (
          <EmptyState>{COPY.siteEmptyNoResult(site.radiusMi, fmtMeters(maxDepth))}</EmptyState>
        )}

        {site.status === 'error' && <EmptyState>{COPY.siteError}</EmptyState>}

        {site.status === 'idle' && !site.origin && (
          <EmptyState>{COPY.siteEmptyNeverSearched}</EmptyState>
        )}

        {site.compareBeccs && site.beccs !== null && (
          <BeccsResult hit={site.beccs} scenario={beccsScenario} radiusMi={site.radiusMi} />
        )}
      </div>
    </div>
  );
}

function toBeccsHit(nearest: NonNullable<ReturnType<typeof findNearestBeccs>>): BeccsHit {
  const props = nearest.feature.properties;
  const [lng, lat] = nearest.feature.geometry.coordinates as [number, number];
  return {
    facilityId: props.facility_id,
    point: latLng(lat, lng),
    distanceM: meters(nearest.distanceM),
    state: props.state,
    plantType: props.plant_type,
    forestryFraction: props.forestry_fraction,
    cdrTco2: props.cdr_tco2,
    costUsdPerTco2: props.cost_usd_per_tco2,
  };
}
