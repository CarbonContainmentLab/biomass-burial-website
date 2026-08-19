/**
 * Number formatting. No sentences here — those are `lib/copy.ts`.
 *
 * Units, spelled once so they cannot drift:
 *   depth   metres, 1 decimal
 *   money   USD per tonne CO2e, 2 decimals, never "$/dry ton"
 *   acres   grouped integer + " ac"
 *   tonnes  grouped integer + " t"
 */

import { cmToM, mToMi, type Centimeters, type Meters, type Miles } from './units';

const group = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1,311,994` */
export const fmtCount = (n: number): string => group.format(n);

/** `3.2 m` */
export const fmtMeters = (m: Meters): string => `${oneDecimal.format(m as number)} m`;

/** `3.2` — for stat tiles that render their own unit at a smaller size. */
export const fmtMetersBare = (m: Meters): string => oneDecimal.format(m as number);

/** `3.2 m` from the centimetres the rasters and the site index carry. */
export const fmtCentimetersAsMeters = (cm: Centimeters): string => fmtMeters(cmToM(cm));

/** `18.4 mi` */
export const fmtMiles = (mi: Miles): string => `${oneDecimal.format(mi as number)} mi`;

/** `18.4 mi` from metres, which is what the worker returns. */
export const fmtMetersAsMiles = (m: Meters): string => fmtMiles(mToMi(m));

/** `328,290 ac` */
export const fmtAcres = (acres: number): string => `${group.format(acres)} ac`;

/** `2,644,831 t` */
export const fmtTonnes = (tonnes: number): string => `${group.format(tonnes)} t`;

/** `$17.17 / tCO₂e` */
export const fmtUsdPerTco2e = (usd: number): string => `${money.format(usd)} / tCO₂e`;

/** `65%` from a 0–1 fraction. */
export const fmtPercent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/**
 * `44.123, −116.045`
 *
 * Minus sign U+2212, not a hyphen: these are numbers being displayed, and the
 * hyphen reads as a range separator next to a comma.
 */
export function fmtLatLng(lat: number, lng: number): string {
  const three = (n: number) => n.toFixed(3).replace('-', '−');
  return `${three(lat)}, ${three(lng)}`;
}

/** `Apache County, Arizona` — or just the state when the county is unknown. */
export function fmtCountyName(county: string | null, state: string): string {
  return county ? `${county} County, ${state}` : state;
}
