# Attributions

The source code in this repository is MIT licensed — see [LICENSE](LICENSE).
The data, basemap and fonts it ships are **not** the Carbon Containment Lab's
to relicense, and several carry obligations that outlive this repository. Those
are set out here.

Every dataset below is also recorded in `public/data/manifest.json`
with a SHA-256 of the exact input file, so a citation here can always be traced
to the bytes the pipeline actually consumed.

## Basemap

The vector basemap is a Protomaps extract of OpenStreetMap.

- **Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors**, licensed under the
  [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/).
  The tileset is a Produced Work of an ODbL database, which is why the
  attribution is rendered on the map itself rather than tucked behind a toggle.
- **Basemap style and layer definitions** from
  [`@protomaps/basemaps`](https://github.com/protomaps/basemaps). The style is
  freely modifiable, and it *has* been modified here — colours are retuned in
  `src/map/basemapStyle.ts` so the basemap does not compete with the
  data layers. The upstream project should not be blamed for how this looks.

## Data

| Layer | Source |
|---|---|
| Burial depth, county biomass, BECCS end nodes | Clayton, Leah. 2026. *leah-clayton/biomass-carbon-storage: v1.1* [Data set]. Zenodo. <https://doi.org/10.5281/zenodo.20273624> |
| County and state boundaries | U.S. Census Bureau. 2025. *Cartographic Boundary Files: Counties and States, 1:5,000,000.* Washington, DC: U.S. Department of Commerce. |
| Wildfire hazard potential | Dillon, Gregory K. 2023. *Wildfire Hazard Potential for the United States (270-m), version 2023,* 4th Edition. Fort Collins, CO: USDA Forest Service, Rocky Mountain Research Station. |
| USFS priority thinning landscapes | U.S. Forest Service. 2023. *Wildfire Crisis Strategy Landscapes* (Feature Layer). USDA Forest Service Enterprise Data Warehouse. |

Works of the U.S. federal government are not subject to domestic copyright.
They are cited because attribution is owed as scholarship, not because a
licence compels it.

Two further sources are cited in `manifest.json` but **no longer reach the
site**: ETOPO 2022 relief (NOAA NCEI) and Natural Earth II (Patterson & Kelso,
public domain). Each was a basemap that Protomaps replaced. They remain in the
manifest until the pipeline is next run, because the manifest records what the
pipeline did rather than what the frontend currently loads.

## Fonts

- **Archivo** — [SIL Open Font License 1.1](https://openfontlicense.org).
  Self-hosted from `public/fonts/`, with the licence text alongside it
  in `OFL.txt`. This is the only font the site serves.

Earlier revisions of this repository carried Whyte (ABC Dinamo) and Signifier
(Klim Type Foundry) as design-system reference material. Both are commercially
licensed and neither is redistributable, so both have been removed and the
site never loaded either — `--font-ui` is Archivo and `--font-serif` falls back
to Georgia and the system serif stack.

## Libraries

Bundled into the deployed page:

| Package | Licence |
|---|---|
| deck.gl (`@deck.gl/*`) | MIT |
| React | MIT |
| Zustand | MIT |
| geotiff.js | MIT |
| math.gl (`@math.gl/web-mercator`) | MIT |
| MapLibre GL JS | BSD-3-Clause |
| PMTiles | BSD-3-Clause |
| `@protomaps/basemaps` | BSD-3-Clause |

Full dependency licences are resolvable from `package-lock.json`.
