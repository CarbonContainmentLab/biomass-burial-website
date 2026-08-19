import { describe, expect, it } from 'vitest';

import type { Feature, MultiPolygon, Polygon } from 'geojson';

import { featureBbox, findContainingFeature, pointInFeature } from '../lib/pointInPolygon';

const square = (
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Feature<Polygon> => ({
  type: 'Feature',
  properties: { GEOID: id },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ],
    ],
  },
});

/** A square with a square hole in the middle, like a county enclosing a lake. */
const holed: Feature<Polygon> = {
  type: 'Feature',
  properties: { GEOID: 'holed' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
  },
};

const twoParts: Feature<MultiPolygon> = {
  type: 'Feature',
  properties: { GEOID: 'two' },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
      [
        [
          [8, 8],
          [10, 8],
          [10, 10],
          [8, 10],
          [8, 8],
        ],
      ],
    ],
  },
};

describe('pointInFeature', () => {
  it('finds points inside and rejects points outside', () => {
    const f = square('a', 0, 0, 10, 10);
    expect(pointInFeature(5, 5, f)).toBe(true);
    expect(pointInFeature(11, 5, f)).toBe(false);
    expect(pointInFeature(-1, -1, f)).toBe(false);
  });

  it('respects holes', () => {
    expect(pointInFeature(1, 1, holed)).toBe(true);
    expect(pointInFeature(5, 5, holed)).toBe(false);
  });

  it('handles both parts of a multipolygon', () => {
    expect(pointInFeature(1, 1, twoParts)).toBe(true);
    expect(pointInFeature(9, 9, twoParts)).toBe(true);
    expect(pointInFeature(5, 5, twoParts)).toBe(false);
  });
});

describe('featureBbox', () => {
  it('bounds a polygon and a multipolygon', () => {
    expect(featureBbox(square('a', -3, -4, 7, 8))).toEqual([-3, -4, 7, 8]);
    expect(featureBbox(twoParts)).toEqual([0, 0, 10, 10]);
  });
});

describe('findContainingFeature', () => {
  const features = [square('a', 0, 0, 10, 10), square('b', 10, 0, 20, 10)];
  const bboxes = features.map(featureBbox);

  it('returns the containing feature', () => {
    expect(findContainingFeature(5, 5, features, bboxes)?.properties?.GEOID).toBe('a');
    expect(findContainingFeature(15, 5, features, bboxes)?.properties?.GEOID).toBe('b');
  });

  it('returns null outside every feature', () => {
    expect(findContainingFeature(5, 50, features, bboxes)).toBeNull();
  });

  it('gives the same answer with and without the bbox prefilter', () => {
    for (const p of [
      [5, 5],
      [15, 5],
      [-1, -1],
      [12, 9],
    ] as const) {
      const withBox = findContainingFeature(p[0], p[1], features, bboxes);
      const without = findContainingFeature(p[0], p[1], features);
      expect(withBox?.properties?.GEOID ?? null).toBe(without?.properties?.GEOID ?? null);
    }
  });
});
