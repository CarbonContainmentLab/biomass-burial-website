/**
 * Hover and selection outlines.
 *
 * A separate filtered layer rather than deck.gl's `autoHighlight`: the selected
 * county has to stay outlined while the pointer is somewhere else entirely, and
 * `autoHighlight` only knows about the object currently under the cursor.
 */

import { GeoJsonLayer } from '@deck.gl/layers';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import type { CountyProps } from '../../data/source';
import { CHARCOAL_A, NAVY_A, type RGBA } from '../palette';

export function highlightLayers(
  data: FeatureCollection<Polygon | MultiPolygon, CountyProps> | null,
  hoverGeoid: string | null,
  selectedGeoid: string | null,
): GeoJsonLayer[] {
  if (!data) return [];
  const layers: GeoJsonLayer[] = [];

  // Selection first, so a hover over the selected county draws on top of it.
  //
  // These two layers are the only filled county polygons in the app, and they
  // hold one feature each — the wash is what makes a selection legible under the
  // depth surface, and one polygon costs nothing.
  if (selectedGeoid) {
    const selected = data.features.filter((f) => f.properties.GEOID === selectedGeoid);
    if (selected.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: 'county-selected',
          data: { type: 'FeatureCollection', features: selected } as FeatureCollection,
          pickable: false,
          stroked: true,
          filled: true,
          getFillColor: [...NAVY_A, 28] as RGBA,
          getLineColor: [...NAVY_A, 255] as RGBA,
          lineWidthUnits: 'pixels',
          getLineWidth: 2,
          lineWidthMinPixels: 2,
        }),
      );
    }
  }

  if (hoverGeoid && hoverGeoid !== selectedGeoid) {
    const hovered = data.features.filter((f) => f.properties.GEOID === hoverGeoid);
    if (hovered.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: 'county-hover',
          data: { type: 'FeatureCollection', features: hovered } as FeatureCollection,
          pickable: false,
          stroked: true,
          filled: false,
          getLineColor: [...CHARCOAL_A, 220] as RGBA,
          lineWidthUnits: 'pixels',
          getLineWidth: 1.5,
          lineWidthMinPixels: 1.5,
        }),
      );
    }
  }

  return layers;
}
