import { describe, expect, it } from 'vitest';

import { euclideanAlbers } from '../lib/distance';
import { geodesicRing, RING_VERTICES } from '../lib/geodesic';
import { lngLatToAlbers } from '../lib/crs';
import { albers, latLng, miles, miToM, raw } from '../lib/units';

describe('euclideanAlbers', () => {
  it('matches a hand-computed 3-4-5 triangle', () => {
    const a = albers(0, 0);
    const b = albers(3000, 4000);
    expect(raw(euclideanAlbers(a, b))).toBeCloseTo(5000, 9);
  });

  it('is symmetric and zero on itself', () => {
    const a = albers(-1_500_000, 2_000_000);
    const b = albers(-1_450_000, 2_030_000);
    expect(raw(euclideanAlbers(a, b))).toBeCloseTo(raw(euclideanAlbers(b, a)), 9);
    expect(raw(euclideanAlbers(a, a))).toBe(0);
  });
});

describe('geodesicRing', () => {
  it('closes and has the documented vertex count', () => {
    const ring = geodesicRing(latLng(44, -116), miles(25));
    expect(ring).toHaveLength(RING_VERTICES + 1);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('puts every vertex at the search radius, measured the way the search measures', () => {
    // This is the property that matters: the drawn ring and the candidate set
    // have to agree, so the vertices are checked in 5070 metres, not degrees.
    const centre = latLng(44, -116);
    const radiusM = raw(miToM(miles(50)));
    const origin = lngLatToAlbers(centre);

    for (const [lng, lat] of geodesicRing(centre, miles(50))) {
      const d = raw(euclideanAlbers(origin, lngLatToAlbers(latLng(lat, lng))));
      expect(Math.abs(d - radiusM) / radiusM).toBeLessThan(0.005);
    }
  });

  it('stays a ring at the largest radius and the study-area edges', () => {
    for (const centre of [latLng(48.9, -124.0), latLng(31.5, -102.5)]) {
      const radiusM = raw(miToM(miles(100)));
      const origin = lngLatToAlbers(centre);
      for (const [lng, lat] of geodesicRing(centre, miles(100))) {
        const d = raw(euclideanAlbers(origin, lngLatToAlbers(latLng(lat, lng))));
        expect(Math.abs(d - radiusM) / radiusM).toBeLessThan(0.005);
      }
    }
  });
});
