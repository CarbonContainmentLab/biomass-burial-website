/**
 * The Protomaps vector basemap style.
 *
 * Replaces the Natural Earth raster (`s02b_basemap`) and, before that, the
 * ETOPO hillshade. See `04_BUILD_PLAN.md` §5.10.
 *
 * Everything is same-origin: the archive, the glyphs and the sprites all come
 * from `public/`. The Protomaps docs point `glyphs` and `sprite` at
 * `protomaps.github.io`, which is exactly the third-party runtime dependency
 * `02 §7` removed from the mockup — and a basemap that loses its labels when
 * GitHub Pages has a bad day would defeat the point of downloading the whole
 * archive up front.
 *
 * ## Retuning
 *
 * Protomaps styles are CC0, so this is free to modify. It has to be modified:
 * the stock `light` flavour fights three of the data layers, which is a real
 * legibility problem rather than a matter of taste.
 *
 * | Conflict | Stock | Fix |
 * |---|---|---|
 * | Landuse green vs the USFS pine hatch `#0F754D` | `park_b #9cd3b4`, `wood_b #a0d9a0` | desaturate toward the page tone, so the only meaningful green on the map is USFS |
 * | Water cyan vs the depth ramp `#F2F5FA → #467ED1 → #004D85` | `water #80deea` | pale blue-grey, so saturated blue means depth and nothing else |
 * | Base warmth vs biomass gold and WHP ochre | warm tans throughout | pull toward neutral; the data layers must dominate |
 *
 * The retune happens at the **flavour** level rather than by rewriting `paint`
 * properties after `layers()` returns. `Flavor` is a flat object of 74 colour
 * tokens, so overriding it is a data change in one reviewable place, where
 * patching paint objects would mean pattern-matching layer ids and would break
 * silently whenever upstream renames one.
 *
 * `earth` is set to the app's own `--surface-map`, so the ground under the
 * basemap and the ground beyond its edge are the same colour and the archive's
 * bbox boundary does not read as a seam.
 */

import { layers, namedFlavor } from '@protomaps/basemaps';
import type { Flavor } from '@protomaps/basemaps';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

import { basemapUrl } from '../data/paths';

const SOURCE = 'protomaps';

/** Matches `public/data/`. Kept here so the style and the loader agree. */
export const ARCHIVE_FILE = 'basemap-west-z9.pmtiles';

/**
 * The archive's own maxzoom. Telling MapLibre this is what makes it *overzoom*
 * z9 tiles rather than request z10 tiles that do not exist — without it the map
 * goes blank above z9 (03 §10 caps the camera at 10).
 */
export const ARCHIVE_MAXZOOM = 9;

/** The extract's bbox, from `pmtiles show`. Stops MapLibre asking for tiles
 *  outside it, which would be a lookup miss on every viewport edge. */
export const ARCHIVE_BOUNDS: [number, number, number, number] = [
  -126.5, 30.5, -101.5, 49.5,
];

/* ---- Coverage, and the camera fence that follows it ---------------------- */

export type Bbox = readonly [number, number, number, number];

/**
 * What the archive **actually** covers, per zoom.
 *
 * The bbox above is what was asked for; it is not what the file contains. A
 * PMTiles extract copies whole tiles, so every tile that so much as clips the
 * bbox comes along entire — and a tile is 45° wide at z3. Coverage is therefore
 * the bbox snapped *outward* to tile edges, which means it grows sharply as you
 * zoom out. Measured off the shipped file by walking `getZxy` across every tile
 * address at z ≤ 6:
 *
 *   z4   4 tiles     lon -135.0 .. -90.0    lat 21.9 .. 55.8
 *   z5  12 tiles     lon -135.0 .. -101.3   lat 21.9 .. 55.8
 *   z6  30 tiles     lon -129.4 .. -101.3   lat 27.1 .. 52.5
 *   z7+             converges on the bbox itself
 *
 * That headroom was there all along and the camera was fenced out of it. The
 * old fence sat a shade outside the bbox, and because `maxBounds` also refuses
 * to zoom out past the point where the box stops filling the viewport, a
 * 27°-wide fence set the real floor near z4.8 on a 1080 px canvas — well above
 * the declared `minZoom`. The fence is now the z4 row, so the zoomed-out view
 * reaches the plains and the Pacific.
 *
 * The rows below z4 are what `coarseGround` exists to paper over: they are the
 * ground the camera can see but the detailed tiles stop covering as you zoom in.
 */
const COVERAGE: ReadonlyArray<{ zoom: number; bounds: Bbox }> = [
  { zoom: 4, bounds: [-135.0, 21.9, -90.0, 55.8] },
  { zoom: 5, bounds: [-135.0, 21.9, -101.3, 55.8] },
  { zoom: 6, bounds: [-129.4, 27.1, -101.25, 52.5] },
  { zoom: 7, bounds: ARCHIVE_BOUNDS },
];

/** Coverage at an integer tile zoom, clamped to the ends of the table. */
const coverageAt = (tileZoom: number): Bbox => {
  const first = COVERAGE[0];
  const last = COVERAGE[COVERAGE.length - 1];
  if (!first || !last) return ARCHIVE_BOUNDS;
  if (tileZoom <= first.zoom) return first.bounds;
  return COVERAGE.find((row) => row.zoom === tileZoom)?.bounds ?? last.bounds;
};

/**
 * Slack added to every fence box, in degrees.
 *
 * Only west, and only because that side is covered. Everything past the
 * archive's western edge is open Pacific at every latitude the map can reach,
 * so `oceanBackdrop` paints it and the slack costs nothing — it is what lets
 * the default view sit where it does instead of pressed against the fence.
 *
 * The other three are zero on purpose. Slack there was an earlier attempt to
 * stop the map feeling locked, and it worked by letting the camera off the end
 * of the data: a sliver of bare page colour along the edge, which reads as the
 * map being broken rather than as room to move. There is no backdrop that could
 * honestly fill it — −90° east is Missouri, not ocean — so the fence stops on
 * the last tile instead.
 */
const SLACK = { west: 8, east: 0, south: 0, north: 0 };

/**
 * Headroom between the zoom floor and the zoom at which the fence exactly fills
 * the viewport.
 *
 * Without it the camera is *pinned* at full zoom-out: box width equals viewport
 * width, so the centre has nowhere to go. Zooming in on a point then cannot
 * hold that point — MapLibre wants to slide the centre toward the cursor and
 * `maxBounds` refuses, so whatever was under the pointer creeps out from under
 * it and never comes back. A margin means the box is always a little wider than
 * the view and the centre always has somewhere to go.
 */
const ZOOM_FLOOR_MARGIN = 0.12;

/** Normalised Web Mercator y, 0 at the north edge of the world and 1 at the south. */
const mercatorY = (lat: number): number => {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
};

const fenced = (b: Bbox): [[number, number], [number, number]] => [
  [b[0] - SLACK.west, b[1] - SLACK.south],
  [b[2] + SLACK.east, b[3] + SLACK.north],
];

/** The widest the fence ever gets — the box the zoom floor is measured against. */
export const cameraFence = (): [[number, number], [number, number]] =>
  fenced(coverageAt(COVERAGE[0]?.zoom ?? 4));

/**
 * The hard zoom-out floor for a canvas of this size: the zoom at which the
 * widest fence box exactly fills it. Below this there is nothing left to show.
 *
 * This exists because `maxBounds` alone is not a hard stop. MapLibre clamps
 * against the bounds *as they stand at that instant*, which made the fence and
 * the gesture race each other — either the fence won and zooming out was
 * blocked entirely, or the gesture won and a flicked scroll wheel coasted well
 * past the data before the fence yanked it back, flashing bare page colour on
 * the way. A real `minZoom` is enforced inside the transform, so momentum
 * simply runs out against it. Nothing to snap back from.
 *
 * Depends on the canvas, so it is recomputed on resize rather than baked in.
 */
export function minZoomFor(width: number, height: number): number {
  const [[west, south], [east, north]] = cameraFence();
  const byWidth = Math.log2((360 * width) / (512 * (east - west)));
  const byHeight = Math.log2(height / (512 * (mercatorY(south) - mercatorY(north))));
  // Whichever axis runs out of box first is the one that stops the zoom.
  return Math.max(byWidth, byHeight) + ZOOM_FLOOR_MARGIN;
}

/**
 * Layers to stop rendering. They stay in the archive; this only hides them.
 *
 * At 1 km data resolution, street-level detail implies a precision the model
 * does not have — the same reasoning that caps the camera at zoom 10 (03 §10).
 *
 * `shield` and `oneway` are not just clutter, they are *broken* clutter here.
 * `roads_shields` composes icon names at runtime (`US:I-1`, `US:I-2`, …) and
 * `roads_oneway` wants `arrow`; none are present in the 3.5 KB `light` sprite
 * sheet, and MapLibre throws on every missing lookup, every frame. Dropping
 * them is both the fix and what this map wanted anyway.
 */
const OMIT = /(^|_)(building|minor_road|other|pois?|transit|aeroway)|shield|oneway/;

/**
 * Every colour this project changes, in one place.
 *
 * Values are drawn from `tokens.css` where an equivalent exists, so the basemap
 * belongs to the same palette as the panels rather than merely coexisting with
 * them. Anything not listed keeps the stock `light` value.
 */
export const BASEMAP_COLOURS: Partial<Flavor> = {
  // --surface-map. Also the page colour beyond the archive's edge.
  background: '#EDEDE8',
  earth: '#EDEDE8',

  // Water: readable as water, nowhere near the depth ramp's navy.
  water: '#DCE3E7',

  // Greens, desaturated hard. USFS thinning is the only real green on the map.
  park_a: '#E6E8E2',
  park_b: '#DBE1D7',
  wood_a: '#E4E7E0',
  wood_b: '#D7DED3',
  scrub_a: '#E6E8E3',
  scrub_b: '#DCE1D8',

  // Warm tones pulled toward neutral, away from biomass gold and WHP ochre.
  sand: '#EAE7DE',
  beach: '#EDE9DC',
  glacier: '#F2F2F0',

  // Institutional landuse: present but quiet.
  industrial: '#E4E6E6',
  hospital: '#E9E4E3',
  school: '#E8E5E0',
  pedestrian: '#E9E7E0',
  zoo: '#E2E7E5',
  military: '#E5E5E3',
} as const;

/** The stock flavour with this project's overrides applied. */
function flavour(): Flavor {
  return { ...namedFlavor('light'), ...BASEMAP_COLOURS } as Flavor;
}

/**
 * MapLibre 6 validates `sprite` and `glyphs` as absolute URLs and rejects a
 * root-relative path outright — "Invalid sprite URL". So these are resolved
 * against `document.baseURI` rather than passed as `/basemap/…`.
 *
 * Resolving against `baseURI` rather than concatenating `location.origin`
 * keeps the subpath-deploy rule intact: `import.meta.env.BASE_URL` still
 * supplies the path, and this only makes it absolute. Same origin either way —
 * nothing here reaches a third party.
 *
 * **Only ever pass a brace-free path.** `new URL()` percent-encodes `{` and
 * `}`, which turns MapLibre's `{fontstack}` / `{range}` placeholders into
 * `%7Bfontstack%7D` and fails validation with "url must include a
 * '{fontstack}' token". The glyph template appends its tokens *after* this.
 */
const absolute = (path: string): string => new URL(path, document.baseURI).toString();

/**
 * Everything west of the extract is open Pacific at every latitude the map can
 * reach, so the ground beyond the archive's western edge is painted water
 * rather than left as page colour.
 *
 * This is a backdrop, not data: it sits directly above the `background` layer
 * and below `earth`, so wherever the archive *does* have tiles the real
 * coastline draws straight over it and nothing changes. It only ever shows in
 * the strip of slack the fence allows past the last tile — which used to read
 * as the map having run out, and now reads as ocean.
 *
 * The eastern side gets no equivalent, deliberately: −101° is the Great Plains,
 * and painting them blue would be a lie rather than a graceful edge.
 */
/**
 * A second view of the same archive, pinned to zoom 4.
 *
 * This is what lets the camera stop moving. The archive holds whole tiles, so
 * it reaches −90° at z4 but only −101.3° at z5 — eleven degrees of Great Plains
 * that are drawn one frame and gone the next, leaving bare page colour behind a
 * hard vertical seam. The obvious fix is to fence the camera out of that ground
 * as you zoom in, and it works, but `maxBounds` fixes it by *moving the camera*:
 * the map lurches west every time the tiles change under it, which is worse
 * than the seam it removes.
 *
 * So nothing is fenced and the ground is filled instead. Declaring `maxzoom: 4`
 * tells MapLibre never to ask for anything finer and to overzoom the z4 tiles
 * for every level above — four tiles it already holds, stretched. Underneath
 * the real basemap it is invisible; past the real basemap's edge it is a coarse
 * but honest continuation of land, forest and water.
 *
 * Fills only, and deliberately: `COARSE_LAYERS` is the ground, with no labels,
 * roads or boundaries. A z4 label overzoomed to z9 would render at thirty-two
 * times its intended size, and a city name the height of a state is a worse
 * artefact than the blank it replaced.
 */
const COARSE_SOURCE = 'protomaps-coarse';
const COARSE_MAXZOOM = 4;
const COARSE_LAYERS = new Set(['earth', 'landcover', 'landuse', 'water']);

const coarseGround = (flavor: Flavor): LayerSpecification[] =>
  layers(COARSE_SOURCE, flavor, { lang: 'en' })
    .filter((layer: LayerSpecification) => COARSE_LAYERS.has(layer.id))
    .map((layer: LayerSpecification) => ({
      ...layer,
      id: `coarse-${layer.id}`,
      // The stock layers carry minzoom hints tuned for their own level; the
      // whole point here is to draw at every zoom the camera can reach.
      minzoom: 0,
      maxzoom: 24,
    }));

const OCEAN_SOURCE = 'ocean-backdrop';
const OCEAN_EAST = ARCHIVE_BOUNDS[0];

const oceanBackdrop = (): LayerSpecification => ({
  id: 'ocean-backdrop',
  type: 'fill',
  source: OCEAN_SOURCE,
  paint: { 'fill-color': BASEMAP_COLOURS.water ?? '#DCE3E7' },
});

export function basemapStyle(): StyleSpecification {
  const base = import.meta.env.BASE_URL;

  const flavor = flavour();
  const styled = layers(SOURCE, flavor, { lang: 'en' }).filter(
    (layer: LayerSpecification) => !OMIT.test(layer.id),
  );

  // `layers()` puts `background` first. The two backdrops belong immediately
  // after it — flat page colour behind them, every real feature in front.
  const withOcean: LayerSpecification[] = [...styled];
  withOcean.splice(1, 0, oceanBackdrop(), ...coarseGround(flavor));

  return {
    version: 8,
    // Tokens appended after the URL is made absolute — see `absolute` above.
    glyphs: `${absolute(`${base}basemap/fonts/`)}{fontstack}/{range}.pbf`,
    sprite: absolute(`${base}basemap/sprites/v4/light`),
    sources: {
      [SOURCE]: {
        type: 'vector',
        // `tiles` rather than `url`: a `url` source makes MapLibre fetch
        // TileJSON through the protocol first, which is a second request shape
        // the handler would have to serve. Everything TileJSON would have told
        // it is known at build time and stated right here instead.
        tiles: [`pmtiles://${basemapUrl()}/{z}/{x}/{y}`],
        minzoom: 0,
        bounds: ARCHIVE_BOUNDS,
        // ODbL: the tileset is a Produced Work of OpenStreetMap, so this has to
        // be visible on the map, not tucked behind a collapsed toggle (§7).
        attribution:
          '<a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a> ' +
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxzoom: ARCHIVE_MAXZOOM,
      },
      [COARSE_SOURCE]: {
        type: 'vector',
        tiles: [`pmtiles://${basemapUrl()}/{z}/{x}/{y}`],
        minzoom: 0,
        bounds: coverageAt(COARSE_MAXZOOM) as [number, number, number, number],
        maxzoom: COARSE_MAXZOOM,
      },
      [OCEAN_SOURCE]: {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            // ±85° is the Mercator limit; the corners are never in view anyway.
            coordinates: [
              [
                [-180, -85],
                [OCEAN_EAST, -85],
                [OCEAN_EAST, 85],
                [-180, 85],
                [-180, -85],
              ],
            ],
          },
        },
      },
    },
    layers: withOcean,
  };
}
