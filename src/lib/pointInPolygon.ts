/**
 * Point-in-polygon against the county outlines already in memory.
 *
 * Mode 2 needs the county containing the winning site (03 §12). The doc says
 * "prefer PIP" over a nearest-centroid guess, and it is right to: a nearest
 * centroid is wrong for any long or concave county, and Nevada and Montana are
 * full of them.
 *
 * Ray casting with a bbox prefilter. GeoJSON rings are [lng, lat]; holes are
 * respected, which matters for the handful of western counties that enclose an
 * independent city or a lake polygon.
 */

import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

type Ring = Position[];

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    const xi = pi[0]!;
    const yi = pi[1]!;
    const xj = pj[0]!;
    const yj = pj[1]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** A single polygon: inside the outer ring and outside every hole. */
function inPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  const outer = rings[0];
  if (!outer || !inRing(lng, lat, outer)) return false;
  for (let h = 1; h < rings.length; h++) {
    if (inRing(lng, lat, rings[h]!)) return false;
  }
  return true;
}

export function pointInFeature(
  lng: number,
  lat: number,
  feature: Feature<Polygon | MultiPolygon>,
): boolean {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') return inPolygon(lng, lat, geom.coordinates as Ring[]);
  for (const poly of geom.coordinates as Ring[][]) {
    if (inPolygon(lng, lat, poly)) return true;
  }
  return false;
}

/** `[minLng, minLat, maxLng, maxLat]`, computed once and cached per feature. */
export function featureBbox(
  feature: Feature<Polygon | MultiPolygon>,
): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (rings: Ring[]) => {
    for (const ring of rings) {
      for (const p of ring) {
        const x = p[0]!;
        const y = p[1]!;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  };
  const geom = feature.geometry;
  if (geom.type === 'Polygon') walk(geom.coordinates as Ring[]);
  else for (const poly of geom.coordinates as Ring[][]) walk(poly);
  return [minX, minY, maxX, maxY];
}

/**
 * First feature containing the point, or `null`.
 *
 * `bboxes` is a parallel array so the caller can compute it once at load rather
 * than on every query; pass `undefined` and every feature is tested in full.
 */
export function findContainingFeature<T extends Feature<Polygon | MultiPolygon>>(
  lng: number,
  lat: number,
  features: readonly T[],
  bboxes?: readonly [number, number, number, number][],
): T | null {
  for (let i = 0; i < features.length; i++) {
    const box = bboxes?.[i];
    if (box && (lng < box[0] || lng > box[2] || lat < box[1] || lat > box[3])) continue;
    const feature = features[i]!;
    if (pointInFeature(lng, lat, feature)) return feature;
  }
  return null;
}
