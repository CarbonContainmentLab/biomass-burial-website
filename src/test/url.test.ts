import { describe, expect, it } from 'vitest';

import { parseCamera, parseUrl, serialiseUrl } from '../state/url';
import { DEFAULT_STATE } from '../state/store';
import { latLng, meters } from '../lib/units';
import type { AppState } from '../state/types';

/** Apply a UrlPatch the way the store's `applyUrlState` does. */
function apply(state: AppState, search: string): AppState {
  const patch = parseUrl(search);
  return {
    ...state,
    layers: patch.layers ? { ...state.layers, ...patch.layers } : state.layers,
    maxDepth: patch.maxDepth ?? state.maxDepth,
    mode: patch.mode ?? state.mode,
    biomassMetric: patch.biomassMetric ?? state.biomassMetric,
    beccsScenario: patch.beccsScenario ?? state.beccsScenario,
    county: { ...state.county, ...patch.county },
    site: { ...state.site, ...patch.site },
  };
}

describe('serialise / parse round-trip', () => {
  it('round-trips the default state', () => {
    const once = serialiseUrl(DEFAULT_STATE);
    const twice = serialiseUrl(apply(DEFAULT_STATE, once));
    expect(twice).toBe(once);
  });

  it('round-trips a fully specified state', () => {
    const state: AppState = {
      ...DEFAULT_STATE,
      layers: { depth: true, biomass: true, whp: false, thinning: true, beccs: true },
      biomassMetric: 'bdmt',
      beccsScenario: 90,
      maxDepth: meters(2.5),
      mode: 'site',
      county: { stateFips: '04', geoid: '04001', roadIdx: 2, slopeIdx: 1 },
      site: {
        ...DEFAULT_STATE.site,
        origin: latLng(44.05, -116.1),
        radiusMi: 100,
        compareBeccs: true,
      },
    };

    const search = serialiseUrl(state);
    const back = apply(DEFAULT_STATE, search);

    expect(back.layers).toEqual(state.layers);
    expect(back.biomassMetric).toBe('bdmt');
    expect(back.beccsScenario).toBe(90);
    expect(back.maxDepth as number).toBeCloseTo(2.5, 6);
    expect(back.mode).toBe('site');
    expect(back.county).toEqual(state.county);
    expect(back.site.origin).toEqual(state.site.origin);
    expect(back.site.radiusMi).toBe(100);
    expect(back.site.compareBeccs).toBe(true);
    expect(serialiseUrl(back)).toBe(search);
  });

  it('writes no camera params when there is no camera to write', () => {
    // The first write happens in bootSync, before MapView exists, so a fresh
    // visit must not gain camera params it did not ask for.
    const search = serialiseUrl(DEFAULT_STATE);
    for (const key of ['clat', 'clng', 'cz']) {
      expect(search).not.toContain(key);
    }
  });

  it('never serialises pitch or bearing, which the user cannot change', () => {
    const search = serialiseUrl(DEFAULT_STATE, { longitude: -114.5, latitude: 42.2, zoom: 5 });
    for (const key of ['bearing', 'pitch']) {
      expect(search).not.toContain(key);
    }
  });

  it('omits terrain from the layer list because it is always on', () => {
    const search = serialiseUrl(DEFAULT_STATE);
    expect(search).not.toContain('terrain');
  });

  it('writes an empty layers param when everything is off, and reads it back', () => {
    const allOff: AppState = {
      ...DEFAULT_STATE,
      layers: { depth: false, biomass: false, whp: false, thinning: false, beccs: false },
    };
    const back = apply(DEFAULT_STATE, serialiseUrl(allOff));
    expect(back.layers).toEqual(allOff.layers);
  });
});

describe('the searched flag', () => {
  const searched: AppState = {
    ...DEFAULT_STATE,
    site: {
      ...DEFAULT_STATE.site,
      origin: latLng(44.05, -116.1),
      radiusMi: 50,
      searched: true,
    },
  };

  it('round-trips, so a shared link reruns the sender search', () => {
    const search = serialiseUrl(searched);
    expect(search).toContain('searched=1');
    const back = apply(DEFAULT_STATE, search);
    expect(back.site.searched).toBe(true);
    expect(back.site.origin).toEqual(searched.site.origin);
    expect(serialiseUrl(back)).toBe(search);
  });

  it('is absent until the button has been pressed', () => {
    const unsearched = { ...searched, site: { ...searched.site, searched: false } };
    expect(serialiseUrl(unsearched)).not.toContain('searched');
    expect(apply(DEFAULT_STATE, serialiseUrl(unsearched)).site.searched).toBe(false);
  });

  it('is ignored without an origin to search from', () => {
    expect(parseUrl('?searched=1').site?.searched).toBeUndefined();
    expect(parseUrl('?searched=1&r=25').site?.searched).toBeUndefined();
    expect(parseUrl('?searched=1&lat=44.05&lng=-116.1').site?.searched).toBe(true);
  });

  it('needs an explicit 1, so ?searched=0 does not rerun', () => {
    expect(parseUrl('?searched=0&lat=44.05&lng=-116.1').site?.searched).toBeUndefined();
  });
});

describe('camera round-trip', () => {
  const camera = { longitude: -114.5219, latitude: 42.2031, zoom: 7.25 };

  it('round-trips a camera through serialise and parse', () => {
    const back = parseCamera('?' + serialiseUrl(DEFAULT_STATE, camera));
    expect(back).toEqual(camera);
  });

  it('rounds to 4 decimals of degree and 2 of zoom', () => {
    const search = serialiseUrl(DEFAULT_STATE, {
      longitude: -114.52194444,
      latitude: 42.20316789,
      zoom: 7.2549,
    });
    expect(search).toContain('clat=42.2032');
    expect(search).toContain('clng=-114.5219');
    expect(search).toContain('cz=7.25');
  });

  it('keeps the camera out of the store patch', () => {
    // parseUrl feeds applyUrlState. A camera leaking into it would put the
    // camera back in the store, which is the thing this design avoids.
    expect(parseUrl('?clat=42.2&clng=-114.5&cz=7')).toEqual({});
  });

  it('ignores a half-specified camera', () => {
    expect(parseCamera('?clat=42.2&clng=-114.5')).toBeNull();
    expect(parseCamera('?clat=42.2&cz=7')).toBeNull();
    expect(parseCamera('?clng=-114.5&cz=7')).toBeNull();
    expect(parseCamera('')).toBeNull();
  });

  it('ignores a camera that is not finite or not on the globe', () => {
    expect(parseCamera('?clat=abc&clng=-114.5&cz=7')).toBeNull();
    expect(parseCamera('?clat=42.2&clng=-114.5&cz=abc')).toBeNull();
    // Past 85° Web Mercator has no finite y.
    expect(parseCamera('?clat=89&clng=-114.5&cz=7')).toBeNull();
    expect(parseCamera('?clat=42.2&clng=-181&cz=7')).toBeNull();
  });

  it('accepts an out-of-range zoom and leaves the clamping to viewState', () => {
    expect(parseCamera('?clat=42.2&clng=-114.5&cz=99')).toEqual({
      longitude: -114.5,
      latitude: 42.2,
      zoom: 99,
    });
  });
});

describe('parseUrl tolerance', () => {
  it('ignores unknown params', () => {
    expect(parseUrl('?nonsense=1&zoom=9')).toEqual({});
  });

  it('ignores an invalid FIPS', () => {
    expect(parseUrl('?co=4001').county).toBeUndefined();
    expect(parseUrl('?st=4').county).toBeUndefined();
    expect(parseUrl('?co=abcde').county).toBeUndefined();
  });

  it('derives the state from a county, and lets a conflicting state lose', () => {
    expect(parseUrl('?co=04001').county).toEqual({ geoid: '04001', stateFips: '04' });
    expect(parseUrl('?co=04001&st=06').county).toEqual({ geoid: '04001', stateFips: '04' });
  });

  it('accepts a state on its own', () => {
    expect(parseUrl('?st=16').county).toEqual({ stateFips: '16' });
  });

  it('ignores a depth outside the slider range', () => {
    expect(parseUrl('?d=0').maxDepth).toBeUndefined();
    expect(parseUrl('?d=25').maxDepth).toBeUndefined();
    expect(parseUrl('?d=abc').maxDepth).toBeUndefined();
    expect(parseUrl('?d=2.5').maxDepth as number).toBeCloseTo(2.5, 6);
  });

  it('ignores a radius that is not one of the four options', () => {
    expect(parseUrl('?r=30').site).toBeUndefined();
    expect(parseUrl('?r=50').site).toEqual({ radiusMi: 50 });
  });

  it('ignores a scenario that is not one of the five', () => {
    expect(parseUrl('?sc=60').beccsScenario).toBeUndefined();
    expect(parseUrl('?sc=99').beccsScenario).toBe(99);
  });

  it('requires both halves of a coordinate', () => {
    expect(parseUrl('?lat=44.05').site).toBeUndefined();
    expect(parseUrl('?lng=-116.1').site).toBeUndefined();
    expect(parseUrl('?lat=44.05&lng=-116.1').site?.origin).toEqual(latLng(44.05, -116.1));
  });

  it('ignores an out-of-range road or slope index', () => {
    expect(parseUrl('?rd=3').county).toBeUndefined();
    expect(parseUrl('?sl=2').county).toBeUndefined();
    expect(parseUrl('?rd=2&sl=1').county).toEqual({ roadIdx: 2, slopeIdx: 1 });
  });

  it('reads rd=0 and sl=0 rather than treating them as absent', () => {
    expect(parseUrl('?rd=0&sl=0').county).toEqual({ roadIdx: 0, slopeIdx: 0 });
  });

  it('treats an unknown layer name as off rather than crashing', () => {
    expect(parseUrl('?layers=depth,unicorn').layers).toEqual({
      depth: true,
      biomass: false,
      whp: false,
      thinning: false,
      beccs: false,
    });
  });
});
