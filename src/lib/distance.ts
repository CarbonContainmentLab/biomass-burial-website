/**
 * Distance. One function, one CRS.
 *
 * The signature exists so that a v2 network-distance implementation is a
 * drop-in, and the `AlbersXY` brand exists so nobody can "simplify" this back to
 * the analysis LCC, to Web Mercator, or to a screen-space measurement. Mercator
 * would overstate by ~1.2x in Arizona and ~1.5x at the Montana border, which is
 * worse than the Euclidean-versus-network error v1 already accepts and admits.
 *
 * Never import anything here but units. In particular not `crs.ts`: projecting
 * and measuring are separate steps, and a caller who has not projected yet
 * should be unable to call this at all.
 */

import { type AlbersXY, type Meters, meters } from './units';

export type DistanceFn = (a: AlbersXY, b: AlbersXY) => Meters;

export const euclideanAlbers: DistanceFn = (a, b) =>
  meters(Math.hypot((b.x as number) - (a.x as number), (b.y as number) - (a.y as number)));
