import { describe, expect, it } from 'vitest';

import {
  albersToLngLat,
  lngLatToAlbers,
  lngLatToMercator,
  mercatorBoundsToLngLat,
  mercatorToLngLat,
} from '../lib/crs';
import { euclideanAlbers } from '../lib/distance';
import { latLng, raw } from '../lib/units';

/** The fixture point named in 03 §9. */
const FIXTURE = latLng(44.0, -116.0);

describe('4326 <-> 5070', () => {
  it('round-trips the fixture point to under a metre', () => {
    const back = albersToLngLat(lngLatToAlbers(FIXTURE));
    // 1e-5 degrees of latitude is ~1.1 m; longitude at 44N is ~0.8 m.
    expect(back.lat).toBeCloseTo(FIXTURE.lat, 5);
    expect(back.lng).toBeCloseTo(FIXTURE.lng, 5);
  });

  it('round-trips every corner of the study area', () => {
    // sites_index.json bounds.wgs84
    const corners = [
      latLng(31.33686, -124.25401),
      latLng(31.33686, -102.04445),
      latLng(48.99675, -124.25401),
      latLng(48.99675, -102.04445),
    ];
    for (const p of corners) {
      const back = albersToLngLat(lngLatToAlbers(p));
      expect(back.lat).toBeCloseTo(p.lat, 5);
      expect(back.lng).toBeCloseTo(p.lng, 5);
    }
  });

  it('lands the fixture point inside the shipped Albers bounds', () => {
    // sites_index.json bounds.albers = [-2345106, 993487, -505443, 3149283]
    const p = lngLatToAlbers(FIXTURE);
    expect(raw(p.x)).toBeGreaterThan(-2345106);
    expect(raw(p.x)).toBeLessThan(-505443);
    expect(raw(p.y)).toBeGreaterThan(993487);
    expect(raw(p.y)).toBeLessThan(3149283);
  });

  it('measures a degree of latitude at about 111 km, so the projection is not mislabelled', () => {
    // A Mercator or degree-space mistake would be off by a large factor here.
    const d = euclideanAlbers(lngLatToAlbers(latLng(44.0, -116.0)), lngLatToAlbers(latLng(45.0, -116.0)));
    expect(raw(d)).toBeGreaterThan(110_000);
    expect(raw(d)).toBeLessThan(112_000);
  });
});

describe('web mercator helpers', () => {
  it('round-trips lng/lat', () => {
    const [x, y] = lngLatToMercator(-116, 44);
    const [lng, lat] = mercatorToLngLat(x, y);
    expect(lng).toBeCloseTo(-116, 9);
    expect(lat).toBeCloseTo(44, 9);
  });

  it('turns the shipped basemap bbox back into its 4326 bbox', () => {
    // manifest.stages[s02b_basemap].stats: bbox_3857 is a warp of
    // [-148, 25, -80, 57]. This is the inversion `basemapLayer` performs to
    // hand `BitmapLayer` its lng/lat corners, so a sign or axis-order slip in
    // `mercatorBoundsToLngLat` puts the whole basemap in the wrong hemisphere.
    const bounds = mercatorBoundsToLngLat([
      -16475284.637404488, 2875744.6243522423, -8905559.263461886, 7760118.6729024565,
    ]);
    expect(bounds[0]).toBeCloseTo(-148, 6);
    expect(bounds[1]).toBeCloseTo(25, 6);
    expect(bounds[2]).toBeCloseTo(-80, 6);
    expect(bounds[3]).toBeCloseTo(57, 6);
  });
});
