/**
 * The search-radius ring.
 *
 * A screen-space circle, a Mercator circle or an SVG circle would all be bugs:
 * the ring has to be the set of points the worker actually searched, or a user
 * will screenshot a candidate site sitting outside its own radius. So the ring
 * is built in EPSG:5070 — the same CRS the search measures in — and projected
 * back to lng/lat vertex by vertex.
 *
 * 64 vertices puts the maximum chord-versus-arc error under 0.1% of the radius,
 * which at 100 miles is well under a pixel at this zoom range.
 */

import { albersToLngLat, lngLatToAlbers } from './crs';
import { albers, miToM, type LatLng, type Miles } from './units';

export const RING_VERTICES = 64;

/**
 * A closed ring around `centre` at `radiusMi`, as `[lng, lat]` pairs suitable
 * for a deck.gl `PolygonLayer`. First and last vertex are the same point.
 */
export function geodesicRing(
  centre: LatLng,
  radiusMi: Miles,
  vertices: number = RING_VERTICES,
): [number, number][] {
  const origin = lngLatToAlbers(centre);
  const radiusM = miToM(radiusMi) as number;
  const ring: [number, number][] = [];

  for (let i = 0; i < vertices; i++) {
    const theta = (2 * Math.PI * i) / vertices;
    const p = albersToLngLat(
      albers((origin.x as number) + radiusM * Math.cos(theta), (origin.y as number) + radiusM * Math.sin(theta)),
    );
    ring.push([p.lng, p.lat]);
  }
  ring.push(ring[0]!);
  return ring;
}
