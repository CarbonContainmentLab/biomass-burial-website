/**
 * USFS priority thinning landscapes. Visual only — `pickable: false`, no popup
 * (03 §0, §8.6). Twenty-one polygons that sit over the depth surface, so a hover
 * target here would only compete with the county beneath it.
 *
 * Pine fill at ~28% with a 1.5 px dashed stroke, matching the mockup swatch
 * (03 §5). The dash is what reads as "designated area", as against the solid
 * hairlines that read as "administrative boundary".
 *
 * `PathStyleExtension` comes from `@deck.gl/extensions`, which is deck.gl itself
 * at the same version — not a second map runtime.
 */

import { PathStyleExtension } from '@deck.gl/extensions';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import type { ThinningProps } from '../../data/source';
import { PINE_A, PINE_B, type RGBA } from '../palette';

const dashed = new PathStyleExtension({ dash: true, highPrecisionDash: true });

export function thinningLayer(
  data: FeatureCollection<Polygon | MultiPolygon, ThinningProps> | null,
): GeoJsonLayer | null {
  if (!data) return null;

  return new GeoJsonLayer({
    id: 'thinning',
    data,
    pickable: false,
    stroked: true,
    filled: true,
    getFillColor: [...PINE_B, 71] as RGBA,
    getLineColor: [...PINE_A, 255] as RGBA,
    lineWidthUnits: 'pixels',
    getLineWidth: 1.5,
    lineWidthMinPixels: 1.5,
    getDashArray: [4, 3],
    dashJustified: true,
    extensions: [dashed],
  });
}
