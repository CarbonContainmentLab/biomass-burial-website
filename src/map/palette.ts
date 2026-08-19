/**
 * The WebGL half of the design tokens.
 *
 * `src/styles/tokens.css` is authoritative for anything drawn by the browser;
 * deck.gl needs the same colours as numbers, and this file is the mirror. The
 * depth stops in particular appear in three places — the fragment shader's ramp
 * texture, the `SoilColumn` gradient, and the layer-row swatch — and 03 §5
 * requires all three to be identical, so they are defined once here and the CSS
 * gradient is written from the same five values.
 */

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

/* ---- Charcoal ------------------------------------------------------------ */
export const CHARCOAL_A: RGB = [46, 40, 34];
export const CHARCOAL_B: RGB = [122, 122, 113];
export const CHARCOAL_C: RGB = [203, 203, 189];

/* ---- Navy ---------------------------------------------------------------- */
export const NAVY_A: RGB = [0, 77, 133];
export const NAVY_B: RGB = [70, 126, 209];

/* ---- Pine ---------------------------------------------------------------- */
export const PINE_A: RGB = [15, 117, 77];
export const PINE_B: RGB = [24, 182, 119];

/* ---- Gold ---------------------------------------------------------------- */
export const GOLD_B: RGB = [189, 129, 0];

export const WHITE: RGB = [255, 255, 255];

/**
 * Depth ramp, in **metres of required cover**, 0 to 10 (03 §5).
 *
 * Shallow is light: less cover needed reads as more favourable, and the ramp is
 * monotonic in lightness so it survives colour-vision deficiency and greyscale.
 */
export const DEPTH_STOPS: readonly (readonly [number, RGB])[] = [
  [0.0, [242, 245, 250]],
  [2.5, [189, 201, 219]],
  [5.0, [130, 169, 227]],
  [7.5, [70, 126, 209]],
  [10.0, [0, 77, 133]],
];

/** Biomass choropleth, applied to a log10 stretch of acres or BDMT (03 §5). */
export const GOLD_STOPS: readonly (readonly [number, RGB])[] = [
  [0.0, [247, 239, 233]],
  [0.25, [233, 209, 177]],
  [0.5, [243, 194, 98]],
  [0.75, [189, 129, 0]],
  [1.0, [106, 77, 21]],
];

/**
 * Wildfire hazard, five discrete ochre classes (03 §10). Index 0 is class 1
 * ("very low"); class 0 in the raster is nodata and is discarded, not coloured.
 */
export const WHP_CLASS_COLORS: readonly RGB[] = [
  [240, 227, 219], // 1 very low   #F0E3DB
  [232, 197, 176], // 2 low        #E8C5B0
  [218, 141, 103], // 3 moderate   #DA8D67
  [193, 106, 62], // 4 high        #C16A3E
  [144, 88, 60], // 5 very high   #90583C
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Linear interpolation between stops. `value` is in the stops' own units. */
export function sampleStops(stops: readonly (readonly [number, RGB])[], value: number): RGB {
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];

  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i]!;
    if (value <= hi[0]) {
      const lo = stops[i - 1]!;
      const t = (value - lo[0]) / (hi[0] - lo[0]);
      return [
        Math.round(lerp(lo[1][0], hi[1][0], t)),
        Math.round(lerp(lo[1][1], hi[1][1], t)),
        Math.round(lerp(lo[1][2], hi[1][2], t)),
      ];
    }
  }
  return last[1];
}

/**
 * A 1-D RGBA ramp for the fragment shader to sample, normalised so texel 0 is
 * the shallowest stop and the last texel is the deepest.
 */
export function buildRampTexels(
  stops: readonly (readonly [number, RGB])[],
  width = 256,
): Uint8Array {
  const max = stops[stops.length - 1]![0];
  const texels = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const [r, g, b] = sampleStops(stops, (i / (width - 1)) * max);
    texels[i * 4] = r;
    texels[i * 4 + 1] = g;
    texels[i * 4 + 2] = b;
    texels[i * 4 + 3] = 255;
  }
  return texels;
}

export const rgbCss = (rgb: RGB): string => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
