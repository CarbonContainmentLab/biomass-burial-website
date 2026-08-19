/**
 * COG to GPU texture (03 §20). Colour is the shader's job, not this file's — the
 * textures here carry the pipeline's numbers, unmodified.
 *
 * Format choice. The depth grid is uint16 centimetres over 2106 x 2320 texels,
 * and the shader samples it across the whole viewport every frame, so the format
 * is a bandwidth decision, not a storage one.
 *
 *   `r32float`  4 bytes/texel, 19.5 MB. Simplest shader, but float32 sampling is
 *               reduced-rate on integrated GPUs and it moves twice the bytes.
 *   `r16uint`   2 bytes, exact, but needs a `usampler2D` and `texelFetch`;
 *               integer samplers are unfilterable and less well trodden.
 *   `rg8unorm`  2 bytes, exact, ordinary filterable sampler. **Chosen.**
 *
 * `rg8unorm` splits each value into a low and a high byte. Recovery is exact —
 * an unorm byte is k/255 for integer k, so `floor(x * 255 + 0.5)` returns k
 * without error — which matters because this tool's premise is not quietly
 * altering the model's numbers. A single `r8unorm` channel would have been half
 * the bandwidth again, but only by quantising depth to ~4 cm, and inventing a
 * second quantisation the pipeline never sanctioned is not a trade worth 5 MB.
 *
 * WHP is `r8unorm` — five classes and a nodata zero fit in one byte, and the
 * shader recovers the class with one multiply.
 */

import type { Device, Texture } from '@luma.gl/core';

import { mercatorBoundsToLngLat } from '../lib/crs';
import { buildRampTexels, type RGB } from '../map/palette';
import { getState } from '../state/store';
import { loadDepthCog, loadWhpCog } from './source';

/** Depth-raster sentinels, verified against the shipped file (04_BUILD_PLAN §1 C1). */
export const DEPTH_NODATA_CM = 65535;
export const DEPTH_OVER_RANGE_CM = 65534;

export interface RasterGrid {
  data: Uint8Array;
  width: number;
  height: number;
  format: 'rg8unorm' | 'r8unorm';
  /** `[west, south, east, north]` in lng/lat, from the file's own georeferencing. */
  bounds: [number, number, number, number];
}

async function decodeCog(buffer: ArrayBuffer): Promise<{
  band: ArrayLike<number>;
  width: number;
  height: number;
  bounds: [number, number, number, number];
}> {
  // Imported on demand rather than at module load. `geotiff` and its codecs are
  // the largest dependency here and nothing needs them until a COG has actually
  // arrived — which is after the shell has painted. Keeping them out of the entry
  // chunk is most of the difference between meeting the initial-JS budget in
  // 03 §16 and missing it.
  const { fromArrayBuffer } = await import('geotiff');

  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();

  // The COGs are EPSG:3857. Bounds come from the file rather than from the
  // manifest, because depth and WHP sit on a larger grid than the basemap and
  // hard-coding either would silently break on a pipeline re-run.
  const bbox = image.getBoundingBox() as [number, number, number, number];
  const bounds = mercatorBoundsToLngLat(bbox);

  const rasters = await image.readRasters({ interleave: false });
  const band = (rasters as unknown as ArrayLike<number>[])[0];
  if (!band) throw new Error('GeoTIFF contained no bands');

  return { band, width, height, bounds };
}

/** Depth: uint16 centimetres split into low and high bytes. See the format note above. */
export async function decodeDepthGrid(buffer: ArrayBuffer): Promise<RasterGrid> {
  const { band, width, height, bounds } = await decodeCog(buffer);
  const count = width * height;
  const data = new Uint8Array(count * 2);
  for (let i = 0; i < count; i++) {
    const cm = band[i]!;
    data[i * 2] = cm & 0xff;
    data[i * 2 + 1] = (cm >>> 8) & 0xff;
  }
  return { data, width, height, format: 'rg8unorm', bounds };
}

/** WHP: uint8 classes, 0 = nodata, 1–5 = very low … very high. */
export async function decodeWhpGrid(buffer: ArrayBuffer): Promise<RasterGrid> {
  const { band, width, height, bounds } = await decodeCog(buffer);
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = band[i]!;
  return { data, width, height, format: 'r8unorm', bounds };
}

/* ---- Decoded-grid cache -------------------------------------------------- */

/**
 * Decoded grids are module state, not store state (03 §6): a 19.5 MB typed array
 * has no business in a React store, and nothing re-renders on its contents.
 *
 * A decode failure marks the same asset id that `source.ts` marks, so a corrupt
 * COG disables its layer row exactly as an unreachable one does. The row reads
 * `failed` before `loaded`, so the "bytes arrived, decode failed" state — where
 * both are set — behaves as a failure.
 */
const grids = new Map<'depth' | 'whp', Promise<RasterGrid>>();
const decoded = new Map<'depth' | 'whp', RasterGrid>();

function ensureGrid(
  id: 'depth' | 'whp',
  fetchBytes: () => Promise<ArrayBuffer>,
  decode: (buffer: ArrayBuffer) => Promise<RasterGrid>,
): Promise<RasterGrid> {
  const existing = grids.get(id);
  if (existing) return existing;

  const promise = fetchBytes()
    .then(decode)
    .then((grid) => {
      decoded.set(id, grid);
      return grid;
    })
    .catch((error: unknown) => {
      grids.delete(id);
      getState().markFailed(id);
      console.error(`[data] ${id} raster could not be decoded`, error);
      throw error;
    });

  grids.set(id, promise);
  return promise;
}

export const ensureDepthGrid = (): Promise<RasterGrid> =>
  ensureGrid('depth', loadDepthCog, decodeDepthGrid);

export const ensureWhpGrid = (): Promise<RasterGrid> => ensureGrid('whp', loadWhpCog, decodeWhpGrid);

export const peekDepthGrid = (): RasterGrid | null => decoded.get('depth') ?? null;
export const peekWhpGrid = (): RasterGrid | null => decoded.get('whp') ?? null;

/**
 * Nearest sampling on both axes. These textures are measurements, so a
 * bilinear read would invent depths between two modelled pixels — and for WHP it
 * would invent classes that do not exist.
 */
export function createRasterTexture(device: Device, grid: RasterGrid): Texture {
  return device.createTexture({
    data: grid.data,
    width: grid.width,
    height: grid.height,
    format: grid.format,
    sampler: {
      minFilter: 'nearest',
      magFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    },
  });
}

/**
 * A 256 x 1 colour ramp the shader samples with a normalised depth. Linear
 * filtering here is correct and wanted: it is the *colour* being interpolated,
 * not the measurement.
 */
export function createRampTexture(
  device: Device,
  stops: readonly (readonly [number, RGB])[],
  width = 256,
): Texture {
  return device.createTexture({
    data: buildRampTexels(stops, width),
    width,
    height: 1,
    format: 'rgba8unorm',
    sampler: {
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    },
  });
}

/** An N x 1 lookup of exact class colours, read with `texelFetch`. */
export function createClassTexture(device: Device, colors: readonly RGB[]): Texture {
  const texels = new Uint8Array(colors.length * 4);
  colors.forEach((rgb, i) => {
    texels[i * 4] = rgb[0];
    texels[i * 4 + 1] = rgb[1];
    texels[i * 4 + 2] = rgb[2];
    texels[i * 4 + 3] = 255;
  });
  return device.createTexture({
    data: texels,
    width: colors.length,
    height: 1,
    format: 'rgba8unorm',
    sampler: {
      minFilter: 'nearest',
      magFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    },
  });
}
