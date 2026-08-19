import { describe, expect, it } from 'vitest';

import type { Feature, FeatureCollection, Point } from 'geojson';

import { lngLatToAlbers } from '../lib/crs';
import { latLng, miles } from '../lib/units';
import type { BeccsProps } from '../data/source';
import { findNearestBeccs } from '../workers/siteQuery';

const ORIGIN = latLng(44.05, -116.1);

/**
 * A facility placed a given number of metres due east of the origin in
 * EPSG:5070, which is the CRS the shipped `x_albers` / `y_albers` are in and the
 * CRS the radius search measures in.
 */
function facility(
  facility_id: number,
  scenario: number,
  eastM: number,
  overrides: Partial<BeccsProps> = {},
): Feature<Point, BeccsProps> {
  const o = lngLatToAlbers(ORIGIN);
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-116.1 + eastM / 80_000, 44.05] },
    properties: {
      facility_id,
      scenario,
      state: 'Idaho',
      plant_type: 'BiCRS 2050 FP asphalt char CO2',
      cdr_tco2: 1_000_000,
      cost_usd_per_tco2: 28.24,
      net_cost_usd: 5_000_000,
      forestry_fraction: 0.65,
      feedstock_tonnes: 900_000,
      x_albers: (o.x as number) + eastM,
      y_albers: o.y as number,
      ...overrides,
    },
  };
}

const collection = (features: Feature<Point, BeccsProps>[]): FeatureCollection<Point, BeccsProps> => ({
  type: 'FeatureCollection',
  features,
});

describe('findNearestBeccs', () => {
  it('returns the nearest facility in the active scenario', () => {
    const data = collection([
      facility(1, 25, 60_000),
      facility(2, 25, 30_000),
      facility(3, 25, 90_000),
    ]);
    const hit = findNearestBeccs(data, 25, ORIGIN, miles(50));
    expect(hit?.feature.properties.facility_id).toBe(2);
    expect(hit?.distanceM).toBeCloseTo(30_000, 3);
  });

  it('ignores facilities from other scenarios', () => {
    // A much closer facility that only exists at the 99% scenario must not be
    // returned while the 25% scenario is active.
    const data = collection([facility(1, 99, 5_000), facility(2, 25, 40_000)]);
    const hit = findNearestBeccs(data, 25, ORIGIN, miles(50));
    expect(hit?.feature.properties.facility_id).toBe(2);
  });

  /**
   * The radius searched is the **user's** radius, not the paper's fixed 250 mi
   * (03 §12). This test is the record of that divergence: if someone restores the
   * published method, this is what tells them they changed a documented decision.
   */
  it('searches the user radius, so a facility beyond it is out of range', () => {
    const data = collection([facility(1, 25, 60_000)]); // ~37 mi east
    expect(findNearestBeccs(data, 25, ORIGIN, miles(50))?.feature.properties.facility_id).toBe(1);
    expect(findNearestBeccs(data, 25, ORIGIN, miles(25))).toBeNull();
    expect(findNearestBeccs(data, 25, ORIGIN, miles(10))).toBeNull();
  });

  it('returns null for an empty or absent collection', () => {
    expect(findNearestBeccs(null, 25, ORIGIN, miles(100))).toBeNull();
    expect(findNearestBeccs(collection([]), 25, ORIGIN, miles(100))).toBeNull();
    expect(findNearestBeccs(collection([facility(1, 50, 1000)]), 25, ORIGIN, miles(100))).toBeNull();
  });

  it('measures from the shipped Albers coordinates, not the drawn geometry', () => {
    // The geometry is deliberately wrong here; the properties are authoritative
    // because they are what the pipeline measured with.
    const wrong = facility(1, 25, 20_000);
    wrong.geometry.coordinates = [-100, 40];
    const hit = findNearestBeccs(collection([wrong]), 25, ORIGIN, miles(25));
    expect(hit?.distanceM).toBeCloseTo(20_000, 3);
  });
});
