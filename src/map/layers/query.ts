/**
 * The Mode 2 overlay: origin marker, search radius, winning site, and the dashed
 * connectors.
 *
 * The origin and radius draw as soon as there is a valid coordinate, before any
 * search — that matches the mockup and it is the right behaviour, because seeing
 * the circle is how a user decides whether the radius is the one they wanted.
 *
 * The ring is built in EPSG:5070 by `lib/geodesic.ts`, the same CRS the worker
 * measures in. A Mercator or screen-space circle here would disagree with the
 * candidate set at the edge, which is exactly the kind of bug people screenshot.
 */

import type { Layer } from '@deck.gl/core';
import { PathStyleExtension, type PathStyleExtensionProps } from '@deck.gl/extensions';
import { PathLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';

import { geodesicRing } from '../../lib/geodesic';
import { miles, type LatLng } from '../../lib/units';
import type { BeccsHit, RadiusMi, SiteHit } from '../../state/types';
import { CHARCOAL_A, NAVY_A, NAVY_B, PINE_A, WHITE, type RGBA } from '../palette';

const dashed = new PathStyleExtension({ dash: true, highPrecisionDash: true });

export interface QueryOverlayInput {
  origin: LatLng | null;
  radiusMi: RadiusMi;
  site: SiteHit | null;
  /** Already gated on the compare checkbox by the caller. */
  beccs: BeccsHit | null | 'none-in-range';
}

export function queryLayers(input: QueryOverlayInput): Layer[] {
  const { origin, radiusMi, site, beccs } = input;
  if (!origin) return [];

  const layers: Layer[] = [];

  layers.push(
    new PolygonLayer({
      id: 'query-radius',
      data: [{ polygon: geodesicRing(origin, miles(radiusMi)) }],
      pickable: false,
      stroked: true,
      filled: false,
      getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
      getLineColor: [...CHARCOAL_A, 190] as RGBA,
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      getDashArray: [4, 4],
      dashJustified: true,
      extensions: [dashed],
    }),
  );

  const connectors: { path: [number, number][]; color: RGBA }[] = [];
  if (site) {
    connectors.push({
      path: [
        [origin.lng, origin.lat],
        [site.point.lng, site.point.lat],
      ],
      color: [...NAVY_A, 230] as RGBA,
    });
  }
  // No line to a facility that is not there: `none-in-range` is a result, and
  // drawing a connector to nothing would be a lie about coverage.
  if (beccs && beccs !== 'none-in-range') {
    connectors.push({
      path: [
        [origin.lng, origin.lat],
        [beccs.point.lng, beccs.point.lat],
      ],
      color: [...PINE_A, 230] as RGBA,
    });
  }

  if (connectors.length > 0) {
    type Connector = { path: [number, number][]; color: RGBA };
    layers.push(
      new PathLayer<Connector, PathStyleExtensionProps<Connector>>({
        id: 'query-connectors',
        data: connectors,
        pickable: false,
        getPath: (d) => d.path,
        getColor: (d) => d.color,
        widthUnits: 'pixels',
        getWidth: 2,
        widthMinPixels: 2,
        getDashArray: [2, 5],
        dashJustified: true,
        extensions: [dashed],
      }),
    );
  }

  layers.push(
    new ScatterplotLayer<{ position: [number, number] }>({
      id: 'query-origin',
      data: [{ position: [origin.lng, origin.lat] }],
      pickable: false,
      getPosition: (d) => d.position,
      radiusUnits: 'pixels',
      getRadius: 5,
      stroked: true,
      filled: true,
      getFillColor: [...CHARCOAL_A, 255] as RGBA,
      getLineColor: [...WHITE, 255] as RGBA,
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
    }),
  );

  if (site) {
    layers.push(
      new ScatterplotLayer<{ position: [number, number] }>({
        id: 'query-site',
        data: [{ position: [site.point.lng, site.point.lat] }],
        pickable: false,
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: 9,
        stroked: true,
        filled: true,
        getFillColor: [...NAVY_B, 230] as RGBA,
        getLineColor: [...NAVY_A, 255] as RGBA,
        lineWidthUnits: 'pixels',
        getLineWidth: 3,
      }),
    );
  }

  return layers;
}
