/**
 * Layer composition. Bottom to top, exactly the order in 03 §10.
 *
 * Layer modules are constructors only: they return descriptors and never write
 * to the store (03 §20). Everything they need arrives as an argument, so the
 * order below is the whole of the map's visual logic and can be read in one
 * place.
 */

import type { Layer } from '@deck.gl/core';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';

import type { Manifest } from '../../data/manifest';
import type {
  BeccsProps,
  CountyBiomassProps,
  CountyProps,  StateProps,
  ThinningProps,
} from '../../data/source';
import type { RasterGrid } from '../../data/textures';
import type { LatLng, Meters } from '../../lib/units';
import type { BeccsHit, BiomassMetric, LayerId, RadiusMi, ScenarioPct, SiteHit } from '../../state/types';
import { beccsLayer } from './beccs';
import { biomassLayer, countiesLayer } from './counties';
import { depthLayer } from './depth';
import { highlightLayers } from './highlight';
import { queryLayers } from './query';
import { statesLayer } from './states';
import { thinningLayer } from './thinning';
import { whpLayer } from './whp';

export interface LayerInputs {
  manifest: Manifest | null;
  states: FeatureCollection<Polygon | MultiPolygon, StateProps> | null;
  counties: FeatureCollection<Polygon | MultiPolygon, CountyProps> | null;
  countiesBiomass: FeatureCollection<Polygon | MultiPolygon, CountyBiomassProps> | null;  depth: RasterGrid | null;
  whp: RasterGrid | null;
  thinning: FeatureCollection<Polygon | MultiPolygon, ThinningProps> | null;
  beccs: FeatureCollection<Point, BeccsProps> | null;

  layers: Record<LayerId, boolean>;
  maxDepth: Meters;
  biomassMetric: BiomassMetric;
  beccsScenario: ScenarioPct;

  hoverGeoid: string | null;
  selectedGeoid: string | null;

  origin: LatLng | null;
  radiusMi: RadiusMi;
  site: SiteHit | null;
  beccsHit: BeccsHit | null | 'none-in-range';
  compareBeccs: boolean;
}

export function buildLayers(input: LayerInputs): Layer[] {
  const on = input.layers;

  const candidates: (Layer | null)[] = [
    // 2. Terrain, under everything, always on.

    // 3. Depth.
    on.depth ? depthLayer(input.depth, input.maxDepth) : null,

    // 4. Wildfire hazard. Sits above depth at 0.85 so depth stays readable when
    //    both are on — preferred over giving the user an opacity slider.
    on.whp ? whpLayer(input.whp) : null,

    // 5. Biomass choropleth.
    on.biomass ? biomassLayer(input.countiesBiomass, input.biomassMetric) : null,

    // 6. Thinning.
    on.thinning ? thinningLayer(input.thinning) : null,

    // 7. County outlines, then hover and selection.
    countiesLayer(input.counties),
    ...highlightLayers(input.counties, input.hoverGeoid, input.selectedGeoid),

    // 8. State outlines.
    statesLayer(input.states),

    // 9. BECCS points.
    on.beccs ? beccsLayer(input.beccs, input.beccsScenario) : null,

    // 10. Place names come from the basemap now, not from here. Interleaving
    //     inserts every layer in this list *beneath* the Protomaps symbol
    //     layers, so state names and cities draw over the data instead of
    //     under it — which is what the deck `TextLayer` existed to work around.
    //     See `applyLayers` in `MapView`.

    // 11. Query overlay: origin, radius, winning site, connectors.
    ...queryLayers({
      origin: input.origin,
      radiusMi: input.radiusMi,
      site: input.site,
      beccs: input.compareBeccs ? input.beccsHit : null,
    }),
  ];

  return candidates.filter((layer): layer is Layer => layer !== null);
}
