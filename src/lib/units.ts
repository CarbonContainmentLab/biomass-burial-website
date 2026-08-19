/**
 * The only file that constructs a branded number (03 §9).
 *
 * The codebase carries metres, centimetres and miles, plus two coordinate
 * systems. Branding turns every mix-up into a compile error, which is worth far
 * more here than it sounds: a `Meters` passed where `Centimeters` was meant is
 * a hundredfold error in a depth figure, and nothing on screen would look
 * obviously wrong.
 */

export type Meters = number & { readonly __u: 'm' };
export type Centimeters = number & { readonly __u: 'cm' };
export type Miles = number & { readonly __u: 'mi' };

export type LatLng = {
  readonly lat: number;
  readonly lng: number;
  readonly __crs: '4326';
};

export type AlbersXY = {
  readonly x: Meters;
  readonly y: Meters;
  readonly __crs: '5070';
};

/* ---- Constructors -------------------------------------------------------- */

export const meters = (n: number): Meters => n as Meters;
export const centimeters = (n: number): Centimeters => n as Centimeters;
export const miles = (n: number): Miles => n as Miles;

export const latLng = (lat: number, lng: number): LatLng => ({ lat, lng, __crs: '4326' });

export const albers = (x: number, y: number): AlbersXY => ({
  x: x as Meters,
  y: y as Meters,
  __crs: '5070',
});

/* ---- Conversions --------------------------------------------------------- */

const METERS_PER_MILE = 1609.344;
/** Exact by definition: 1 m = 1 / 1609.344 international miles. */
const MILES_PER_METER = 1 / METERS_PER_MILE;

export const cmToM = (cm: Centimeters): Meters => (cm / 100) as Meters;
export const mToCm = (m: Meters): Centimeters => (m * 100) as Centimeters;

export const mToMi = (m: Meters): Miles => (m * MILES_PER_METER) as Miles;
export const miToM = (mi: Miles): Meters => (mi * METERS_PER_MILE) as Meters;

/** Strip a brand when handing a raw number to a shader uniform or the DOM. */
export const raw = (n: Meters | Centimeters | Miles): number => n as number;
