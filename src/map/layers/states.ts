/**
 * State outlines. Always on, no toggle (03 §21.2).
 *
 * Not pickable: counties are the inspectable unit, and a state polygon on top of
 * them would swallow every hover.
 */

import { GeoJsonLayer } from '@deck.gl/layers';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import type { StateProps } from '../../data/source';
import { CHARCOAL_B } from '../palette';

export function statesLayer(
  data: FeatureCollection<Polygon | MultiPolygon, StateProps> | null,
): GeoJsonLayer | null {
  if (!data) return null;

  return new GeoJsonLayer({
    id: 'states',
    data,
    pickable: false,
    stroked: true,
    filled: false,
    getLineColor: CHARCOAL_B,
    lineWidthUnits: 'pixels',
    getLineWidth: 1.2,
    lineWidthMinPixels: 1.2,
  });
}
