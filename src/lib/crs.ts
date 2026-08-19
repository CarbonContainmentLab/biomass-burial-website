/**
 * The proj4 wrapper. This file owns the EPSG:5070 definition and the two
 * conversions that use it. It does not measure anything — that is
 * `lib/distance.ts` — because keeping projection and measurement apart is what
 * makes "distances are computed in 5070" a checkable claim rather than a habit.
 *
 * Why 5070 and not the pipeline's analysis LCC: `02_FRONTEND_DESIGN.md`
 * specified LCC, then the pipeline measured the Daymet LCC running ~4.5% short
 * against geodesic over the study area and shipped EPSG:5070 for both the BECCS
 * table and the site index (`manifest.decisions.crs.distance_note`). The
 * frontend has to agree with the file it is reading.
 */

import proj4 from 'proj4';

import { albers, latLng, type AlbersXY, type LatLng } from './units';

/** NAD83 / Conus Albers. */
export const EPSG_5070 =
  '+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 ' +
  '+datum=NAD83 +units=m +no_defs';

export const EPSG_4326 = '+proj=longlat +datum=WGS84 +no_defs';

/** Spherical Web Mercator, for turning COG bounds into lng/lat for deck.gl. */
export const EPSG_3857 =
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 ' +
  '+units=m +nadgrids=@null +no_defs';

proj4.defs('EPSG:4326', EPSG_4326);
proj4.defs('EPSG:5070', EPSG_5070);
proj4.defs('EPSG:3857', EPSG_3857);

const toAlbers = proj4('EPSG:4326', 'EPSG:5070');
const toWgs84 = proj4('EPSG:5070', 'EPSG:4326');

export function lngLatToAlbers(p: LatLng): AlbersXY {
  const [x, y] = toAlbers.forward([p.lng, p.lat]) as [number, number];
  return albers(x, y);
}

export function albersToLngLat(p: AlbersXY): LatLng {
  const [lng, lat] = toWgs84.forward([p.x as number, p.y as number]) as [number, number];
  return latLng(lat, lng);
}

/* ---- Web Mercator, for raster bounds ------------------------------------- */

const MERCATOR_R = 6378137;
const MAX_LATITUDE_RAD = Math.atan(Math.sinh(Math.PI));

/**
 * Inverse spherical Web Mercator, exact and dependency-free.
 *
 * Used for one thing: turning a COG's own `bbox_3857` into the lng/lat bounds
 * `BitmapLayer` wants. Doing it here rather than hard-coding the numbers means
 * a pipeline re-run that shifts the grid moves the imagery with it
 * (04_BUILD_PLAN §1 C2).
 */
export function mercatorToLngLat(x: number, y: number): [number, number] {
  const lng = (x / MERCATOR_R) * (180 / Math.PI);
  const lat = (Math.atan(Math.sinh(y / MERCATOR_R)) * 180) / Math.PI;
  return [lng, lat];
}

export function lngLatToMercator(lng: number, lat: number): [number, number] {
  const phi = Math.max(-MAX_LATITUDE_RAD, Math.min(MAX_LATITUDE_RAD, (lat * Math.PI) / 180));
  return [(lng * Math.PI * MERCATOR_R) / 180, MERCATOR_R * Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

/**
 * `[west, south, east, north]` in lng/lat from a 3857 bbox in the same order.
 */
export function mercatorBoundsToLngLat(
  bbox: readonly [number, number, number, number],
): [number, number, number, number] {
  const [west, south] = mercatorToLngLat(bbox[0], bbox[1]);
  const [east, north] = mercatorToLngLat(bbox[2], bbox[3]);
  return [west, south, east, north];
}
