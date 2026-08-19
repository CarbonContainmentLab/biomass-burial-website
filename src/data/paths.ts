/**
 * Asset URLs. Everything is `BASE_URL + 'data/' + name`, so a deploy under a
 * path on the CC Lab site works without touching a component (03 §8).
 *
 * `import.meta.env.BASE_URL` always ends in a slash in Vite.
 */

export const DATA_FILES = {
  manifest: 'manifest.json',
  states: 'states_west.geojson',
  counties: 'counties_west.geojson',
  countiesBiomass: 'counties_biomass.geojson',  countyStats: 'county_stats.json',
  depth: 'depth_display.tif',
  whp: 'whp_display.tif',
  basemap: 'basemap-west-z9.pmtiles',
  thinning: 'thinning.geojson',
  beccs: 'beccs.geojson',
  sitesIndex: 'sites_index.json',
  sites: 'sites.bin',
} as const;

export type DataFileKey = keyof typeof DATA_FILES;

export const dataUrl = (name: string): string => `${import.meta.env.BASE_URL}data/${name}`;

export const fileUrl = (key: DataFileKey): string => dataUrl(DATA_FILES[key]);

/**
 * Static chrome assets — `public/assets/`, not pipeline output. Same BASE_URL
 * rule as the data files, for the same reason: a subpath deploy must not need a
 * component edit.
 */
export const assetUrl = (name: string): string => `${import.meta.env.BASE_URL}assets/${name}`;

/**
 * The Protomaps archive, as an **absolute** URL.
 *
 * Its own helper because two consumers must agree on the exact string:
 * `loadBasemapArchive` registers the archive under this key, and `basemapStyle`
 * hands the same string to MapLibre behind a `pmtiles://` prefix. PMTiles'
 * `Protocol` resolves a tile by looking up the text after `pmtiles://` against
 * the key the archive was registered with, so the two have to match verbatim.
 *
 * Absolute rather than root-relative because MapLibre normalises source URLs
 * before calling the protocol handler — the same normalisation that rejects a
 * relative `sprite`. Registering `/data/x.pmtiles` while MapLibre asks for
 * `http://host/data/x.pmtiles` looks up nothing, and the failure is silent:
 * the source never loads, so the style never finishes loading, so the deck.gl
 * overlay never inserts its layers and *every* data layer disappears along
 * with the basemap.
 *
 * Falls back to the relative path where there is no `document` (the Vitest
 * environment), which is fine because nothing there resolves a tile.
 */
export const basemapUrl = (): string => {
  const path = fileUrl('basemap');
  return typeof document === 'undefined' ? path : new URL(path, document.baseURI).toString();
};
