/**
 * County outlines, always on (03 §0, §21.2).
 *
 * The biomass choropleth is a second layer rather than a fill on this one:
 * `counties_west.geojson` is blocking and `counties_biomass.geojson` is lazy, so
 * the outlines have to render before the choropleth's data exists. Keeping them
 * apart also means toggling biomass never disturbs the outlines (03 §17,
 * "Toggle biomass acres/BDMT: colours change, outlines stay").
 *
 * **Outlines only, and not pickable.** Counties are still the inspectable unit,
 * but hit-testing is done on the CPU in `MapView` against the same rings, using
 * `lib/pointInPolygon.ts` with a bounding-box prefilter. The alternative — a
 * `filled: true` layer with a fully transparent fill, which is what makes a
 * polygon interior pickable — asks the GPU to rasterize and blend 414 polygons
 * across the entire viewport on every single frame to produce no pixels at all.
 * That is a real cost on integrated graphics and it is paid while panning, when
 * nothing is being hovered. A bbox reject over 414 features costs microseconds
 * and is paid only on pointer moves.
 */

import { GeoJsonLayer } from '@deck.gl/layers';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import type { CountyBiomassProps, CountyProps } from '../../data/source';
import type { BiomassMetric } from '../../state/types';
import { CHARCOAL_C, GOLD_STOPS, sampleStops, WHITE, type RGBA } from '../palette';

export function countiesLayer(
  data: FeatureCollection<Polygon | MultiPolygon, CountyProps> | null,
): GeoJsonLayer | null {
  if (!data) return null;

  return new GeoJsonLayer({
    id: 'counties',
    data,
    pickable: false,
    stroked: true,
    filled: false,
    getLineColor: [...CHARCOAL_C, 190] as RGBA,
    lineWidthUnits: 'pixels',
    getLineWidth: 0.6,
    lineWidthMinPixels: 0.6,
  });
}

/**
 * Log10 stretch, with the domain measured from the data rather than assumed.
 * Acres span 1.8e3 to 2.1e6 and BDMT 5.0e3 to 6.9e7 in the shipped file; a
 * linear ramp would put all but a dozen counties in the palest two stops.
 */
function metricDomain(
  features: readonly CountyBiomassProps[],
  metric: BiomassMetric,
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const props of features) {
    const value = metric === 'acres' ? props.total_acres : props.total_bdmt;
    if (value === null || value <= 0) continue;
    const l = Math.log10(value);
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  return Number.isFinite(lo) && hi > lo ? [lo, hi] : [0, 1];
}

export function biomassLayer(
  data: FeatureCollection<Polygon | MultiPolygon, CountyBiomassProps> | null,
  metric: BiomassMetric,
): GeoJsonLayer | null {
  if (!data) return null;

  const [lo, hi] = metricDomain(
    data.features.map((f) => f.properties),
    metric,
  );

  return new GeoJsonLayer<CountyBiomassProps>({
    id: 'biomass',
    data,
    pickable: false,
    stroked: true,
    filled: true,
    updateTriggers: { getFillColor: metric },
    getFillColor: (feature) => {
      const props = feature.properties;
      const value = metric === 'acres' ? props.total_acres : props.total_bdmt;
      // Counties outside the residue model are left unpainted rather than drawn
      // at the bottom of the ramp: "not modelled" is not "almost none".
      if (value === null || value <= 0) return [0, 0, 0, 0];
      const t = (Math.log10(value) - lo) / (hi - lo);
      return [...sampleStops(GOLD_STOPS, Math.min(1, Math.max(0, t))), 209] as RGBA;
    },
    // A hairline white edge, as in the mockup, so adjacent counties read apart
    // without competing with the charcoal outline layer above.
    getLineColor: [...WHITE, 150] as RGBA,
    lineWidthUnits: 'pixels',
    getLineWidth: 0.6,
    lineWidthMinPixels: 0.6,
  });
}
