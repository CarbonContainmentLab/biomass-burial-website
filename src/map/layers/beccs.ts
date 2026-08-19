/**
 * Modeled BECCS facilities.
 *
 * One FeatureCollection holds all five removal scenarios, so switching scenario
 * is a client-side filter and never a refetch (03 §8.7). The shipped file has
 * 267 rows over 100 facilities — only 17 at the 25% default, which is why the
 * "no facility in range" path is the common case rather than an edge case.
 *
 * The mark is a 9 px pine diamond, matching the mockup swatch, not a pin
 * (03 §2). A pin points at a surveyed address; these are modelled end nodes, and
 * the diamond is the paper's own symbol for them.
 */

import { IconLayer } from '@deck.gl/layers';
import type { FeatureCollection, Point } from 'geojson';

import type { BeccsFeature, BeccsProps } from '../../data/source';
import type { ScenarioPct } from '../../state/types';
import { PINE_A, rgbCss } from '../palette';

const ICON_NAME = 'diamond';
const ATLAS_PX = 64;

let atlas: string | null = null;

/**
 * deck.gl has no "diamond" primitive, so the mark is a one-icon atlas drawn once
 * with Canvas 2D and handed over as a data URL. Cheaper than adding an SVG asset,
 * and it keeps the colour in `palette.ts` with every other token rather than
 * buried in an image file.
 */
function diamondAtlas(): string {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = ATLAS_PX / 2;
    const side = ATLAS_PX * 0.5;
    ctx.translate(half, half);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = rgbCss(PINE_A);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = ATLAS_PX * 0.09;
    ctx.beginPath();
    ctx.rect(-side / 2, -side / 2, side, side);
    ctx.fill();
    ctx.stroke();
  }
  atlas = canvas.toDataURL('image/png');
  return atlas;
}

const ICON_MAPPING = {
  [ICON_NAME]: { x: 0, y: 0, width: ATLAS_PX, height: ATLAS_PX, mask: false },
};

export function beccsFeaturesFor(
  data: FeatureCollection<Point, BeccsProps> | null,
  scenario: ScenarioPct,
): BeccsFeature[] {
  if (!data) return [];
  return data.features.filter((f) => f.properties.scenario === scenario);
}

export function beccsLayer(
  data: FeatureCollection<Point, BeccsProps> | null,
  scenario: ScenarioPct,
): IconLayer<BeccsFeature> | null {
  const features = beccsFeaturesFor(data, scenario);
  if (features.length === 0) return null;

  return new IconLayer<BeccsFeature>({
    // The scenario is in the id so a switch replaces the layer outright rather
    // than diffing 17 points against 96.
    id: `beccs-${scenario}`,
    data: features,
    pickable: true,
    iconAtlas: diamondAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => ICON_NAME,
    getPosition: (f) => f.geometry.coordinates as [number, number],
    getSize: 13,
    sizeUnits: 'pixels',
    sizeMinPixels: 11,
    sizeMaxPixels: 15,
  });
}
