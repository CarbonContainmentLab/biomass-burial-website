# Design document 3 — Frontend architecture

**Project:** Public-facing biomass burial siting tool
**Prepared for:** Jack Lowenthal, CC Lab
**Stack:** Vite + React + TypeScript + deck.gl + Zustand
**Status:** Canonical for implementation
**Date:** August 13, 2026

This document is the architecture of the Vite app. It names every file, every
component, every store field, and every data contract. Where it disagrees with
`02_FRONTEND_DESIGN.md`, this file wins. Where it disagrees with the HTML
mockup, this file also wins — except for chrome, which is taken from the mockup.

**Inspiration:** `Website mockup requirements (1)/Burial Siting Tool.dc.html`
plus the Carbon Containment Lab design system in that same folder.

**Data:** everything under `Frontend/public/data/` is produced by
`Backend/pipeline`. The app never talks to a server.

---

## 0. Locked decisions

Taken from review, not restated as open questions.

| Topic | Decision |
|---|---|
| Layout | Mockup: 56 px header + full-bleed map; floating left rail (288 px) and right query panel (364 px) |
| Identity | CC Lab design system: Navy B `#467ED1` accent, two-family type, charcoal ink |
| Depth ramp | Mockup navy ramp on the surface **and** on the soil-column legend |
| Signature control | Vertical soil-column legend; the legend **is** the max-depth control |
| Terrain | On by default, under the depth layer |
| Header search | Keep; selecting a hit zooms the map. It does **not** fill Mode 1 |
| County hover | Keep the left-rail inspect card |
| Mode 1 depth | Min + median, captioned as county-wide |
| Money | Show **both** figures the pipeline ships (see §8.3) |
| BECCS layer | Toggle plus scenario switcher (25 / 50 / 75 / 90 / 99) |
| Map → Mode 1 | Clicking a county fills Mode 1 and opens the query panel |
| BECCS compare | Optional checkbox in Mode 2 |
| BECCS compare radius | The **user's burial radius**, not the paper's 250 mi |
| Shareable URL | Layers, max-depth, mode, and the active query. Not the camera |
| Mobile | Desktop only in v1. Below 1024 px: a “best on a larger screen” message, no map |
| 6.67 m ceiling | Do not special-case it. 10 m is the slider ceiling |
| Default layers | On: Terrain, Depth, state/county lines. Off: Biomass, WHP, Thinning, BECCS |
| WHP | Classified 1 km raster, not a county choropleth |
| Counties without biomass | Visible in the dropdown, disabled, with a reason |
| Biomass fill | User switches acres / BDMT in the layer panel |
| Type | Self-host an openly licensed UI face plus a system serif — see `ATTRIBUTIONS.md` |
| Provenance chrome | Header as in the mockup. No footer, no About sheet in v1 |
| Mode 2 ranking | Shallowest feasible first; nearest as tiebreak |
| Inspectable | Counties (hover + click) and BECCS points (click). Thinning is visual only |
| Labels | State names always. No county labels |
| Tooling | pnpm, Vitest, Playwright, GitHub Actions |
| Analytics | None |
| Host | Under the CC Lab site (path vs subdomain still open — see §18) |
| Distance copy | “Straight-line distance” everywhere. No fabricated network numbers |
| Distance math | Euclidean in EPSG:5070. Never LCC, never Mercator, never screen space |

---

## 1. What this is

A static single-page app. `index.html` plus hashed assets on a CDN. No
application server, no database, no API keys. Node is a build dependency.

### The page's one job

Let a non-specialist see where in the western US biomass burial is plausible,
and look up two things: what a county holds, and the nearest feasible site to a
point.

### Audience

Interested public, forest managers, journalists, students. Not GIS
professionals. No CRS pickers, no opacity sliders, no layer-order controls.

### Out of v1

- Phone / tablet layout
- Network / road-distance ranking
- Dark mode
- `localStorage` / `sessionStorage`
- Analytics
- Footer, About, Methods
- County labels
- Thinning click popups
- Special rendering of the 6.67–10 m band

---

## 2. Stack

| Package | Role |
|---|---|
| `vite` ^6 | Dev server and static build |
| `react` ^19 + `react-dom` | UI |
| `typescript` ^5.7 | Types; branded units in `src/lib/units.ts` |
| `deck.gl` ^9 | All map layers. No Leaflet, no MapLibre |
| `@deck.gl/react` | `<DeckGL>` |
| `@math.gl/web-mercator` | View-state helpers only |
| `zustand` ^5 | App state with selector subscriptions |
| `geotiff` | Decode `depth_display.tif` and `whp_display.tif` (COG) into typed arrays |
| `proj4` | 4326 ↔ 5070. One module wraps it |
| `geotiff` + a tiny `fromArrayBuffer` path | Depth/WHP textures; hillshade is already a WebP |

Pin exact versions in `package.json`. Add nothing that pulls a map runtime
other than deck.gl.

### Why not Leaflet

The mockup used Leaflet because it is a mockup. Numeric depth colouring has to
happen in a fragment shader; Leaflet would force a canvas redraw on every slider
tick. deck.gl is the stack `02_FRONTEND_DESIGN.md` already chose.

### Layer mapping

| Content | deck.gl layer | File |
|---|---|---|
| Hillshade | `BitmapLayer` | `src/map/layers/hillshade.ts` |
| Depth surface | custom `BitmapLayer` + fragment shader | `src/map/layers/depth.ts` |
| WHP | custom `BitmapLayer` + classified shader | `src/map/layers/whp.ts` |
| County polygons | `GeoJsonLayer` | `src/map/layers/counties.ts` |
| State outlines | `GeoJsonLayer` | `src/map/layers/states.ts` |
| Thinning | `GeoJsonLayer` | `src/map/layers/thinning.ts` |
| BECCS | `ScatterplotLayer` (diamond via `getPolygonOffset` + icon, or a 4-vertex `IconLayer`) | `src/map/layers/beccs.ts` |
| State labels | `TextLayer` | `src/map/layers/labels.ts` |
| Origin, site, radius, connectors | `ScatterplotLayer` + `PolygonLayer` + `LineLayer` | `src/map/layers/query.ts` |
| Hover / selection outline | `GeoJsonLayer` (filtered) | `src/map/layers/highlight.ts` |

BECCS mark: a 9 px pine diamond, matching the mockup swatch, not a pin.

---

## 3. Repository layout

Vite root is `Frontend/`. Pipeline already writes to `Frontend/public/data/`.

```
Frontend/
├── docs/
│   └── 03_FRONTEND_ARCHITECTURE.md   ← this file
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── playwright.config.ts
├── public/
│   ├── fonts/
│   │   ├── archivo-latin.woff2
│   │   ├── archivo-latin-ext.woff2
│   │   └── OFL.txt                   # required to travel with the binaries
│   ├── data/                         # pipeline output, committed
│   │   ├── manifest.json
│   │   ├── depth_display.tif
│   │   ├── whp_display.tif
│   │   ├── hillshade.webp
│   │   ├── counties_west.geojson
│   │   ├── counties_biomass.geojson
│   │   ├── states_west.geojson
│   │   ├── label_points.json
│   │   ├── county_stats.json
│   │   ├── thinning.geojson
│   │   ├── beccs.geojson
│   │   ├── sites.bin
│   │   └── sites_index.json
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── DesktopGate.tsx
│   │   └── boot.ts
│   ├── chrome/
│   │   ├── Header.tsx
│   │   ├── Brand.tsx
│   │   └── PlaceSearch.tsx
│   ├── panels/
│   │   ├── LeftRail.tsx
│   │   ├── LayerPanel.tsx
│   │   ├── LayerRow.tsx
│   │   ├── SoilColumn.tsx
│   │   ├── CountyHoverCard.tsx
│   │   ├── QueryPanel.tsx
│   │   ├── QueryTabs.tsx
│   │   ├── CountyLookup.tsx
│   │   ├── CountyResult.tsx
│   │   ├── SiteSearch.tsx
│   │   ├── SiteResult.tsx
│   │   ├── BeccsResult.tsx
│   │   └── EmptyState.tsx
│   ├── map/
│   │   ├── MapView.tsx
│   │   ├── viewState.ts
│   │   ├── layers/
│   │   │   ├── index.ts
│   │   │   ├── hillshade.ts
│   │   │   ├── depth.ts
│   │   │   ├── whp.ts
│   │   │   ├── counties.ts
│   │   │   ├── states.ts
│   │   │   ├── thinning.ts
│   │   │   ├── beccs.ts
│   │   │   ├── labels.ts
│   │   │   ├── query.ts
│   │   │   └── highlight.ts
│   │   └── shaders/
│   │       ├── depth.frag.glsl
│   │       └── whp.frag.glsl
│   ├── state/
│   │   ├── store.ts
│   │   ├── types.ts
│   │   ├── selectors.ts
│   │   └── url.ts
│   ├── data/
│   │   ├── source.ts
│   │   ├── paths.ts
│   │   ├── manifest.ts
│   │   ├── countyStats.ts
│   │   ├── textures.ts
│   │   └── sites.ts
│   ├── workers/
│   │   ├── siteQuery.ts
│   │   └── siteQuery.worker.ts
│   ├── lib/
│   │   ├── units.ts
│   │   ├── crs.ts
│   │   ├── distance.ts
│   │   ├── format.ts
│   │   ├── fips.ts
│   │   ├── copy.ts
│   │   └── geodesic.ts
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── fonts.css
│   │   ├── global.css
│   │   └── overlays.css
│   └── test/
│       ├── fixtures/
│       │   ├── countyStats.tiny.json
│       │   ├── sites.tiny.bin
│       │   └── sites_index.tiny.json
│       ├── units.test.ts
│       ├── crs.test.ts
│       ├── distance.test.ts
│       ├── fips.test.ts
│       ├── countyLookup.test.ts
│       ├── siteRank.test.ts
│       └── url.test.ts
└── e2e/
    ├── county-lookup.spec.ts
    └── site-search.spec.ts
```

Do not introduce `src/components/` as a junk drawer. Chrome, panels, and map
are three trees on purpose.

---

## 4. Component hierarchy

This is the runtime tree. Names match files in §3.

```
<App>
  <DesktopGate>                          // < 1024 px: message, no map
    <Header>
      <Brand />                          // “Carbon Containment Lab · Biomass burial siting tool”
      <PlaceSearch />                    // typeahead, zooms only
    </Header>
    <div.map-stage>                      // position:relative; flex 1
      <MapView />                        // DeckGL, absolute inset 0
      <button.edge-left />               // visible iff left rail collapsed
      <button.edge-right />              // visible iff query panel collapsed
      <LeftRail>                         // absolute, 16 px inset, 288 px
        <LayerPanel>
          <LayerRow id="depth" />
          <LayerRow id="biomass">
            <select acres|bdmt />        // only when biomass is on
          </LayerRow>
          <LayerRow id="whp" />
          <LayerRow id="thinning" />
          <LayerRow id="beccs">
            <select 25|50|75|90|99 />    // only when beccs is on
          </LayerRow>
          // Terrain has no row: it is on, not user-toggleable in v1
        </LayerPanel>
        <SoilColumn />                   // legend + max-depth control
        <CountyHoverCard />              // mount iff hoverCounty != null
      </LeftRail>
      <QueryPanel>                       // absolute, 16 px inset, 364 px
        <QueryTabs />                    // County statistics | Best burial site
        {mode === 'county'
          ? <CountyLookup>
              <select state>
              <select county>            // disabled options: no biomass
              <select road>
              <SlopeToggle />
              {complete ? <CountyResult /> : <EmptyState />}
            </CountyLookup>
          : <SiteSearch>
              <input lat> <input lng>
              <PickButton />
              <select radius>
              <checkbox compare BECCS>
              <button Find best burial site>
              {result ? <SiteResult /> : searched ? <EmptyState /> : null}
              {compare && result ? <BeccsResult /> : null}
            </SiteSearch>}
      </QueryPanel>
      <LoadingCard />                    // centre, blocking assets only
      <ErrorCard />                      // per-asset, never a blank page
    </div>
  </DesktopGate>
</App>
```

### Layout numbers (from the mockup)

| Token | Value |
|---|---|
| Header height | 56 px |
| Left rail width | 288 px |
| Right panel width | 364 px |
| Overlay inset | 16 px |
| Overlay gap | 12 px |
| Card radius | 8 px |
| Control radius | 4 px |
| Header search width | 260 px |
| Collapse duration | 220 ms `cubic-bezier(.4, 0, .2, 1)` |
| Left collapsed translation | −330 px |
| Right collapsed translation | +410 px |

The map is never inset. Panels float over it. Collapsing a panel does not
reflow the WebGL canvas.

### Z-order

```
map (deck.gl)     0
loading/error   900
rails          1000
edge buttons   1001
header         1200
search hits    1300
```

---

## 5. Visual system

Port the design-system tokens into `src/styles/tokens.css`. Components use
semantic names, not raw hues.

```css
:root {
  --white: #FFFFFF;
  --error: #E52900;

  --navy-a: #004D85;
  --navy-b: #467ED1;
  --navy-c: #82A9E3;
  --navy-d: #BDC9DB;
  --navy-e: #EAECF1;

  --charcoal-a: #2E2822;
  --charcoal-b: #7A7A71;
  --charcoal-c: #CBCBBD;
  --charcoal-d: #E1E1DB;
  --charcoal-e: #F6F5F4;

  --pine-a: #0F754D;
  --pine-b: #18B677;
  --gold-a: #6A4D15;
  --gold-b: #BD8100;
  --gold-c: #F3C262;
  --gold-d: #E9D1B1;
  --gold-e: #F7EFE9;
  --ochre-a: #90583C;
  --ochre-b: #C16A3E;
  --ochre-c: #DA8D67;
  --ochre-d: #E8C5B0;
  --ochre-e: #F0E3DB;

  --text-primary: var(--charcoal-a);
  --text-secondary: var(--charcoal-b);
  --text-link: var(--navy-a);
  --surface-page: var(--charcoal-e);
  --surface-card: var(--white);
  --surface-map: #EDEDE8;
  --border-subtle: var(--charcoal-d);
  --border-default: var(--charcoal-c);
  --action-primary: var(--navy-b);
  --action-primary-hover: var(--navy-a);
  --focus-ring: 0 0 0 3px rgba(70, 126, 209, 0.35);
  --shadow-card: 0 4px 12px rgba(46, 40, 34, 0.08);
  --shadow-panel: 0 12px 32px rgba(46, 40, 34, 0.10);
}
```

### Type

- **UI face** — UI, headings, numerals. Tabular figures on every statistic.
  Shipped as Archivo (SIL OFL).
- **Serif** — empty-state sentences only (as in the mockup). Shipped as the
  Georgia-first system stack.
- Sentence case. Tracked uppercase is allowed for 11–12 px eyebrows
  (`letter-spacing: 0.14em`), matching the mockup and the design system.
- No emoji. Icons, if any, are Lucide at 16 px — but v1 can ship with none;
  the mockup used none except the collapse chevrons.

### Depth ramp (navy, mockup stops)

Stops are **metres of required cover**, 0–10:

| m | RGB |
|---|---|
| 0.0 | `242, 245, 250` |
| 2.5 | `189, 201, 219` |
| 5.0 | `130, 169, 227` |
| 7.5 | `70, 126, 209` |
| 10.0 | `0, 77, 133` |

Same stops in the fragment shader and in `SoilColumn`. Shallow is light.

### Other ramps

| Layer | Ramp | Notes |
|---|---|---|
| Biomass | gold (`#F7EFE9` → `#6A4D15`) | Log10 stretch on acres or BDMT |
| WHP | discrete ochre, 5 classes | See §11. Shader, not a stretch |
| Thinning | pine fill ~28% + 1.5 px dashed `#0F754D` stroke | |
| BECCS | pine diamond `#0F754D` | |

Nodata on the depth and WHP textures is **transparent**, so the hillshade shows
through. Do not hatch the ocean.

### Soil column

`SoilColumn` is a 48 × 220 px vertical strip.

- Fill: the navy ramp, **shallow at the top** (0 m), 10 m at the bottom. That
  is a soil column: more cover is further down.
- A horizontal cut line at `maxDepth`, navy-a, 2 px, with a 10 px grab handle
  on the right.
- The band below the cut (deeper than the threshold) is drawn at 35% opacity.
- Live label to the right of the handle: `2.5 m`, UI face 15 / navy-a.
- Caption under the strip: “Minimum required soil cover.”
- Keyboard: Up/Down and Left/Right nudge by `step` (0.5 m). Home = 0.5, End =
  10. `aria-valuemin/max/now` on the slider role. A visually hidden live
  region announces the value.

The mockup’s separate range input is **removed**. Do not ship both.

---

## 6. Application state

One Zustand store. Camera is **not** in it.

```ts
// src/state/types.ts

export type LayerId =
  | 'depth'
  | 'biomass'
  | 'whp'
  | 'thinning'
  | 'beccs';
// Terrain is not a LayerId. It is always on.

export type Mode = 'county' | 'site';
export type RoadIdx = 0 | 1 | 2;
export type SlopeIdx = 0 | 1;
export type RadiusMi = 10 | 25 | 50 | 100;
export type ScenarioPct = 25 | 50 | 75 | 90 | 99;
export type BiomassMetric = 'acres' | 'bdmt';

export interface AppState {
  layers: Record<LayerId, boolean>;
  biomassMetric: BiomassMetric;
  beccsScenario: ScenarioPct;
  maxDepth: Meters;                 // default 10
  mode: Mode;

  ui: {
    leftOpen: boolean;              // default true
    rightOpen: boolean;             // default true
    picking: boolean;               // Mode 2 click-to-set
  };

  hover: {
    geoid: string | null;           // 5-digit county FIPS
  };

  county: {
    stateFips: string | null;       // 2-digit
    geoid: string | null;           // 5-digit
    roadIdx: RoadIdx | null;
    slopeIdx: SlopeIdx | null;
  };

  site: {
    origin: LatLng | null;
    radiusMi: RadiusMi;             // default 25
    compareBeccs: boolean;          // default false
    status: 'idle' | 'searching' | 'done' | 'empty' | 'error';
    result: SiteResult | null;
    beccs: BeccsHit | null | 'none-in-range';
  };

  data: {
    manifest: Manifest | null;
    loaded: Set<AssetId>;
    failed: Set<AssetId>;
    blockingReady: boolean;
  };
}
```

Defaults on first paint, before the URL is parsed:

```ts
layers: { depth: true, biomass: false, whp: false, thinning: false, beccs: false }
biomassMetric: 'acres'
beccsScenario: 25
maxDepth: 10
mode: 'county'
leftOpen: true
rightOpen: true
radiusMi: 25
compareBeccs: false
```

### What is not in the store

- `viewState` — a `useRef` inside `MapView`, driven by deck.gl’s controller.
  Putting the camera in React re-renders the tree on every pan frame.
- Decoded textures, GeoJSON, `county_stats`, the site index — module-level
  caches inside `src/data/*`. Components read them via hooks that subscribe
  only to `data.loaded`.
- The worker. `siteQuery.ts` owns the `Worker` instance.

### Selectors

Every component subscribes to the slice it needs. `LayerRow` must not
re-render when `maxDepth` changes. `SoilColumn` must not re-render when the
hover geoid changes. Use `useStore(s => s.maxDepth)` etc. Never
`useStore()`.

---

## 7. URL

`src/state/url.ts` is the only module that reads or writes `location.search`.
Subscribe to the store, write a compact query string, replaceState (not
pushState). Parse on boot in `app/boot.ts` **before** the first paint of
panels, so dropdowns are not flashed empty.

| Param | Example | Meaning |
|---|---|---|
| `layers` | `depth,biomass` | On layers, comma-separated. Terrain omitted (always on) |
| `d` | `10` | `maxDepth` metres |
| `mode` | `county` \| `site` | Active tab |
| `st` | `04` | State FIPS |
| `co` | `04001` | County GEOID |
| `rd` | `0` | Road index |
| `sl` | `0` | Slope index |
| `lat` `lng` | `44.05` `-116.10` | Mode 2 origin |
| `r` | `25` | Radius miles |
| `beccs` | `1` | Compare checkbox |
| `sc` | `25` | BECCS scenario |
| `bm` | `acres` \| `bdmt` | Biomass metric |

Unknown params are ignored. Invalid FIPS are ignored. The camera is never
serialised.

---

## 8. Data contracts

`src/data/source.ts` is the only module that `fetch`es. Paths are
`import.meta.env.BASE_URL + 'data/' + name` so a CC Lab subpath deploy works.

### 8.1 Load order

**Blocking** (usable map; spinner until these resolve or fail):

1. `manifest.json`
2. `states_west.geojson`, `counties_west.geojson`, `label_points.json`
3. `county_stats.json`
4. `depth_display.tif` (decoded to a WebGL texture)
5. `hillshade.webp` (image decode)

**Lazy on toggle:** `whp_display.tif`, `thinning.geojson`,
`counties_biomass.geojson` (biomass fill; county outlines are already loaded).

**Lazy on Mode 2 open, once:** `sites_index.json` + `sites.bin`.
**Lazy on BECCS toggle or compare-checkbox:** `beccs.geojson`.

A failed optional asset disables its `LayerRow` with
“Couldn't load fire risk data. Try reloading.” and does not blank the page.
A failed blocking asset still shows the chrome and an `ErrorCard` with Retry.
County outlines failing must not prevent depth + hillshade from rendering.

### 8.2 `manifest.json` (boot)

Read `decisions.*` rather than hard-coding:

- `decisions.depth.default_max_m` / `display_max_m`
- `decisions.crs.distance` → must be `EPSG:5070`
- `decisions.beccs.scenarios_pct` / `default_scenario_pct`
- `decisions.wildfire_hazard.class_breaks` / `class_labels`
- `stages[s08_hillshade].stats.bbox_3857` and `texture_px` for the hillshade
  `BitmapLayer` bounds
- `payload.blocking` as the allow-list for the spinner

If `decisions.crs.distance !== 'EPSG:5070'`, refuse to boot Mode 2 and log.
Do not silently fall back to LCC.

### 8.3 `county_stats.json`

Keyed by 5-digit GEOID.

```ts
interface CountyStatsFile {
  meta: {
    counties: number;
    counties_with_biomass: number;       // 173
    depth_scope: 'whole county';         // render this string as the caption
    units: Record<string, string>;
    notes: Record<string, string>;
    accessibility_classes: AccessibilityClass[];
  };
  counties: Record<Geoid5, CountyRecord>;
}

interface AccessibilityClass {
  id: 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
  road_idx: 0 | 1 | 2;
  slope_idx: 0 | 1;
  road_ft: [number, number];
  road_m: [number, number];
  slope_pct: [number, number];
  label: string;
  cost_usd_per_mtco2e: number;           // constant per class
}

interface CountyRecord {
  name: string;
  state: string;                         // 2-digit FIPS
  has_biomass: boolean;
  depth: { min: number; mean: number; median: number; n_pixels: number } | null;
  biomass?: {
    total_acres: number;
    total_bdmt: number;
    burial_path_length_km: number;
    burial_carbon_efficiency: number;
    wildfire_hazard_potential: number;   // 0–1, county aggregate
    classes: Record<ClassId, ClassStats>;
  };
}

interface ClassStats {
  acres: number;
  bdmt: number;
  bdmt_per_year: number;
  cost_usd_per_mtco2e: number;           // forestry treatment; class-constant
  net_income_burial_usd_per_mtco2e: number; // burial pathway; varies by county
}
```

**The two money figures**, both shown whenever a class is selected:

| Field | Label in the UI | What it is |
|---|---|---|
| `cost_usd_per_mtco2e` | Forestry treatment | Always the same for a given A1–A6. A1 = $17.17, A6 = $38.03 per tCO₂e |
| `net_income_burial_usd_per_mtco2e` | Burial pathway net income | Varies by county (haulage). Positive is revenue |

Do not call either “$/dry ton”. Units are USD per tonne CO₂e. Gloss on first
appearance: “tonnes of CO₂-equivalent.”

`has_biomass === false` means the county was **not in the residue model**, not
that it has no biomass. That sentence is the disabled-option tooltip.

### 8.4 Boundaries and choropleth

`counties_west.geojson` / `states_west.geojson`: EPSG:4326, properties
`GEOID`, `STATEFP`, `NAME` (counties) and `GEOID`, `STUSPS`, `NAME` (states).

`counties_biomass.geojson`: same polygons plus `has_biomass`, `total_acres`,
`total_bdmt`, `depth_median_m`. Used only when the biomass layer is on.
Join key is `GEOID`.

`label_points.json`:

```ts
{
  counties: { geoid, name, lon, lat, state }[];  // unused in v1
  states:   { geoid, name, lon, lat, usps }[];   // TextLayer
}
```

### 8.5 Rasters

`depth_display.tif` — COG, uint16 centimetres, 0 = nodata, EPSG:3857.
`display_max_m` is 10, so 1000 cm is the top of the ramp. Values above 10 m
were clamped in the pipeline.

`whp_display.tif` — COG, uint8, 0 = nodata (masked water / non-burnable),
1–5 = very low … very high, EPSG:3857, nearest overviews.

`hillshade.webp` — 2094 × 2160, already Web Mercator. Bounds from the
manifest, not from EXIF:

```
bbox_3857 = [-13914936.35, 3632749.14, -11354588.06, 6274861.39]
```

### 8.6 `thinning.geojson`

Properties: `name`, `state`, `region`, `project_id`, `investment_year`,
`acres`, `edited`. Visual only. No click handler.

### 8.7 `beccs.geojson`

One FeatureCollection, all scenarios. Filter client-side on `scenario`.

| Property | Type | Use |
|---|---|---|
| `facility_id` | int | Stable identity across scenarios |
| `scenario` | 25 \| 50 \| 75 \| 90 \| 99 | Layer filter |
| `state` | string | Popup |
| `plant_type` | string | Popup |
| `cdr_tco2` | number | Tonnes CO₂ (not millions) |
| `cost_usd_per_tco2` | number | Popup |
| `net_cost_usd` | number | Popup |
| `forestry_fraction` | 0–1 | Popup, as a percent |
| `feedstock_tonnes` | number | Popup |
| `x_albers` `y_albers` | metres, EPSG:5070 | Distance math |
| `x_lcc` `y_lcc` | metres | Unused in v1 |
| geometry | Point 4326 | Drawing |

### 8.8 Site index

`sites_index.json` describes `sites.bin`:

- little-endian
- `int32 count` at offset 0
- `int32 dx[count]` — **deltas**, running sum = Albers X metres
- `int32 dy[count]` — same for Y
- `uint16 depth_cm[count]`
- CRS EPSG:5070, 1 m quantisation, 871,094 sites, 10 bytes/site
- Sites are 1 km pixel centres; the nearest site to an arbitrary point can be
  up to ~707 m away even where burial is feasible on that spot. Do not
  apologise for this in the UI; the coordinates are the model’s.

Decode once in the worker. Do not decode on the main thread.

---

## 9. Units and coordinates

`src/lib/units.ts` is the only file that constructs branded numbers.

```ts
export type Meters      = number & { readonly __u: 'm' };
export type Centimeters = number & { readonly __u: 'cm' };
export type Miles       = number & { readonly __u: 'mi' };

export type LatLng = { readonly lat: number; readonly lng: number; readonly __crs: '4326' };
export type AlbersXY = { readonly x: Meters; readonly y: Meters; readonly __crs: '5070' };
```

```ts
// src/lib/distance.ts
export type DistanceFn = (a: AlbersXY, b: AlbersXY) => Meters;

export const euclideanAlbers: DistanceFn = (a, b) =>
  Math.hypot(b.x - a.x, b.y - a.y) as Meters;
```

`02_FRONTEND_DESIGN.md` specified LCC for distance. The pipeline measured a
4.5% shortfall against geodesic and shipped EPSG:5070 instead. **Use 5070.**
The function name and the type brand exist so nobody “simplifies” this back to
LCC or to `map.distance()`.

Miles for display: `meters * 0.000621371192`. Round to 1 decimal.

`src/lib/crs.ts` wraps proj4 with the EPSG:5070 string. Round-trip tests live
in `src/test/crs.test.ts` against a known point (e.g. 44.0 N, 116.0 W).

### Radius drawing

`src/lib/geodesic.ts` builds a 64-vertex geodesic ring around the origin at
`radiusMi`. Feed it to `PolygonLayer`. A screen-space circle, a Mercator
circle, or an SVG circle is a bug: it will disagree with the candidate set.

---

## 10. Map runtime

### `MapView`

```ts
const INITIAL_VIEW = {
  longitude: -114.5,
  latitude: 42.2,
  zoom: 5,
  minZoom: 4,
  maxZoom: 10,          // data is 1 km; 12 implies precision the model lacks
  pitch: 0,
  bearing: 0,
};
```

`controller: true`. `viewState` in a ref. `onViewStateChange` writes the ref
and does not `setState`.

`onClick` / `onHover`:

- If `ui.picking`: set `site.origin`, clear `picking`, draw origin + radius.
  Do not run the search until the user clicks “Find best burial site”.
- Else if the pick is a county polygon: set `hover.geoid` on hover; on click
  set `county.geoid` + `county.stateFips`, `mode = 'county'`, `rightOpen =
  true`. Do not invent road/slope; leave them as they are (or null).
- Else if the pick is a BECCS point: open a deck.gl tooltip / a small
  `BeccsPopup` with name-like fields from §8.7. No store write except
  perhaps a transient `selectedFacilityId` if the popup is React; prefer a
  deck tooltip to avoid a new store field.
- Thinning: `pickable: false`.

`getCursor`: `crosshair` while picking, `pointer` over a county, `grab`
otherwise.

### Layer order (bottom → top)

1. Solid `surface-map` background (deck.gl `parameters.clearColor`)
2. Hillshade `BitmapLayer` opacity 1
3. Depth (if on)
4. WHP (if on)
5. Biomass choropleth (if on)
6. Thinning (if on)
7. County outlines (always) + hover/selection highlight
8. State outlines (always)
9. BECCS (if on)
10. State labels (always)
11. Query overlay (origin, radius, site, connectors)

Depth and WHP are both rasters; if both are on, WHP sits on top at opacity
0.85 so depth remains readable. Prefer this over a user-facing opacity slider.

### Depth shader

`src/map/shaders/depth.frag.glsl`, sketched:

```glsl
uniform sampler2D uDepth;     // R16UI or R32F centimetres
uniform float uMaxDepthCm;    // from store.maxDepth * 100
uniform float uDisplayMaxCm;  // 1000
// navy stops as a 1D ramp texture, 256 px

float cm = texelFetch(uDepth, ivec2(uv * size), 0).r;
if (cm <= 0.0) discard;                    // nodata → hillshade
if (cm > uMaxDepthCm) discard;             // filtered → hillshade
vec3 color = texture(uRamp, vec2(cm / uDisplayMaxCm, 0.5)).rgb;
fragColor = vec4(color, 0.92);
```

Slider motion changes `uMaxDepthCm` only. No refetch, no CPU recolour.

### WHP shader

Class 0 discarded. Classes 1–5 map to:

| Class | Label | Fill |
|---|---|---|
| 1 | Very low | `#F0E3DB` |
| 2 | Low | `#E8C5B0` |
| 3 | Moderate | `#DA8D67` |
| 4 | High | `#C16A3E` |
| 5 | Very high | `#90583C` |

Nearest sampling. A legend of five labelled swatches appears under the WHP
`LayerRow` while that layer is on — not a continuous bar.

### Camera easing

`flyTo` on “Zoom to county”, header-search hits, and a successful Mode 2
result (`fitBounds` origin + site, pad 0.6, matching the mockup). Honour
`prefers-reduced-motion`: jump, don’t fly.

---

## 11. Query Mode 1 — County statistics

Tab label: **County statistics** (mockup).

Intro copy: “Look up modeled burial depth and biomass availability for one
county and one accessibility class.”

### Controls, in order

1. **State** — 11 names, A–Z, values are 2-digit FIPS.
2. **County** — names in the selected state, A–Z, values are GEOID.
   `has_biomass === false` → `<option disabled>` plus native title
   “Not in the residue model”.
3. **Distance to road** — three options from `meta.accessibility_classes`,
   formatted as in the mockup: `0–152.4 m (0–500 ft)` etc.
4. **Slope** — two buttons, `< 20%` and `20–40%`, not a select.
   Caption: “Slopes over 40% and distances beyond 0.5 mi are excluded from
   the underlying model.”

Changing state clears county. Changing county does not clear road/slope.
Results appear when all four are set **and** the county `has_biomass`.

A map click that fills a disabled county opens the tab, selects state +
county, and shows the empty state “This county is not in the residue model.”
rather than a result card.

### Result card

Two navy-e stat tiles:

- Min depth — `depth.min` in metres, 1 decimal
- Median depth — `depth.median` in metres, 1 decimal  
  (The mockup said “Avg”. The mean is skewed; do not show it.)

Then a definition list:

- Biomass available — class `acres`, formatted with grouping, ` ac`
- Estimated dry tons — class `bdmt`, ` t`
- Forestry treatment — `$17.17 / tCO₂e` (class cost)
- Burial pathway net income — `$26.93 / tCO₂e` (class net income)
- Accessibility class — `A1 · 0–500 ft from road, <20% slope`

Caption, always, from `meta.depth_scope`:

> Depth figures are for the whole county, not the selected accessibility class.

Button: **Zoom to county** — `flyTo` the feature’s bounds, zoom cap 8.

Empty state (serif): “Choose a state, county, distance class and slope to
see results.”

Lookup is a pure function of `county_stats.json`. No worker.

---

## 12. Query Mode 2 — Best burial site

Tab label: **Best burial site** (mockup).

Intro copy: “Enter a point of origin to find the shallowest feasible burial
site nearby.” Do **not** mention road-network distance.

### Controls

- Latitude, longitude — text, 4-decimal placeholders `44.05` / `-116.10`
- **Or pick a point on the map** — toggles `ui.picking`
- Search radius — 10 / 25 / 50 / 100 miles
- Checkbox: **Compare to nearest BECCS facility**
- Primary button: **Find best burial site**

Drawing the origin marker and radius polygon happens on valid lat/lng, even
before search. That matches the mockup.

### Algorithm (worker)

`src/workers/siteQuery.worker.ts` receives:

```ts
{
  origin: AlbersXY;
  radiusM: Meters;
  maxDepthCm: number;
  // Transferable: decoded { x: Float64Array, y: Float64Array, depthCm: Uint16Array }
}
```

1. Convert origin 4326 → 5070 on the main thread (`crs.ts`), send metres.
2. Scan sites (bbox prefilter on x/y, then hypot). 871k is fine in a worker.
3. Keep `depthCm <= maxDepthCm` and `distance <= radiusM`.
4. Rank: smallest `depthCm`; tie-break smallest distance.
5. Return `{ x, y, depthCm, distanceM }` or `null`.

Main thread converts the winner back to 4326 for the marker, looks up the
containing county by point-in-polygon against the already-loaded counties
(or nearest centroid if you must; prefer PIP).

**Do not** use the mockup’s `score = depth + miles * 0.012`. **Do not**
multiply straight-line by 1.28 and label it “network”.

Budget: < 200 ms. If it exceeds that on a mid-range laptop, add a 10 km
grid index inside the worker; do not move the scan to the main thread.

### Site result card

Accent bar navy. Heading **Best burial site**, pill **Feasible** in pine.

| Label | Value |
|---|---|
| Required cover | `3.2 m` |
| Straight-line distance | `18.4 mi` |
| Coordinates | `44.123, −116.045` |
| County | `Ada County, Idaho` |

No “Network distance” row.

Empty (serif): “No site within 25 miles at 10 m or shallower. Try a wider
radius or a greater depth.” Numbers come from the current radius and
`maxDepth`.

### BECCS comparison (optional)

Runs only if the checkbox is on and a site search has completed (including
empty site — still search BECCS from the origin).

Filter `beccs.geojson` to `beccsScenario`. Among those, nearest by Albers
euclidean, **inside the user's radius**. If none: `none-in-range`.

Card accent pine. Heading **Nearest BECCS facility**. Eyebrow
`{scenario}% scenario`.

| Label | Value |
|---|---|
| Straight-line distance | `42.1 mi` |
| Coordinates | `…` |
| Plant type | from properties |
| Forestry share of feedstock | `65%` |

`none-in-range` copy: “No modeled BECCS facility within 25 miles of this
point under the 25% removal scenario. Coverage is sparse at this scenario;
try a larger radius.”

This **deliberately diverges** from the paper’s fixed 250 mi search and from
`manifest.decisions.beccs.search_radius_mi`. v1 matches the mockup: the
radius the user set is the radius that is searched. Record that in a code
comment next to the filter so a v2 of the paper method is one constant.

Connectors: dashed navy line origin → site; dashed pine origin → facility.
Do not draw a line to a `none-in-range`.

---

## 13. Header search

Placeholder: “Search a state or county”.

Match prefix, case-insensitive, after 2 characters. Order: states first,
then counties, cap 8. Each hit: name + kind eyebrow (`State` / `County`).

Enter selects the first hit. Escape clears. Clicking a hit:

- State: `fitBounds` that feature; do not change Mode 1.
- County: `setView` centroid, zoom 8; do not change Mode 1.

This is wayfinding, not query entry. Map-click is what fills Mode 1.

---

## 14. Copy

`src/lib/copy.ts` holds every user-facing string. Components do not inline
sentences. That is what makes the “straight-line” rule enforceable.

| Instead of | Write |
|---|---|
| Submit | Find best burial site |
| Error: fetch failed | Couldn't load fire risk data. Try reloading. |
| No results | No site within 25 miles at 10 m or shallower. Try a wider radius or a greater depth. |
| L (m) | Required soil cover |
| Accessibility class (bare) | How reachable the biomass is — technical id `A1` in the result row |
| Distance (bare) | Straight-line distance |
| Network distance | *(do not write this)* |
| $/dry ton | $/tCO₂e |

Empty Mode 2, never searched: “Click the map or enter coordinates to find
the nearest feasible burial site.”

Terms with a one-sentence gloss on first use in a panel: *bone-dry metric
ton*, *tCO₂e*, *accessibility class*, *BECCS*.

Chemical notation: CO₂, tCO₂e, with subscript 2.

---

## 15. Desktop gate and accessibility

`DesktopGate`: if `window.matchMedia('(max-width: 1023px)')`, render a
centred card on `--surface-page`:

> This tool is built for a larger screen. Open it on a computer to explore
> burial siting across the western United States.

No map, no panels. Resizing above 1024 px mounts the app (do not keep a
hidden WebGL context on a phone).

Keyboard (desktop):

- Every control in both panels is in tab order.
- `SoilColumn` as in §5.
- Map is skipped in tab order (`tabIndex={-1}` on the canvas wrapper);
  picking is mouse/touch. Lat/lng fields are the keyboard path for Mode 2.
- Results live in `aria-live="polite"`.

`prefers-reduced-motion`: no panel slide (instant hide/show), no camera
easing, no layer crossfade.

Contrast: body text charcoal-a on white or charcoal-e; secondary charcoal-b
on white. WCAG AA. Depth ramp is monotonic in lightness.

---

## 16. Performance budget

| Metric | Target |
|---|---|
| Initial JS, gzipped | < 300 KB |
| Blocking data (already measured) | 3.37 MB on the wire |
| Time to interactive map, cable | < 3 s |
| Depth slider | 60 fps, uniform-only |
| Mode 2 query | < 200 ms in worker |
| Total transfer, all layers on | < 15 MB (pipeline: 7.21 MB) |

Verify against a production build on a throttled connection, not `pnpm dev`.

`DeckGL` gets `useDevicePixels: true` but depth/WHP textures stay at native
COG resolution; do not upsample.

---

## 17. Testing

### Unit (Vitest)

- `units.test.ts` — brand round-trips, cm ↔ m, m ↔ mi
- `crs.test.ts` — 4326 → 5070 → 4326 on a fixture point, < 1 m
- `distance.test.ts` — hypot against a hand-computed pair
- `fips.test.ts` — `'4'` → `'04'`, `'4001'` → `'04001'`
- `countyLookup.test.ts` — fixture county + A1 yields known acres, costs,
  min, median; a `has_biomass: false` county is not selectable
- `siteRank.test.ts` — three synthetic sites, assert shallowest-then-nearest
- `url.test.ts` — parse/serialise round-trip

Fixtures are tiny and committed. A pipeline schema change should break a
test, not the site.

### E2E (Playwright)

- County lookup: pick AZ → Apache → first road → `<20%` → tiles appear,
  caption present, both money rows present
- Site search: paste a known coordinate, radius 50, assert a result card
  containing “Straight-line” and not “Network”

### Manual

- Block `whp_display.tif` in the network tab: WHP row disables, map stays
- Drag `SoilColumn` across 0.5–10 m: no hitch
- Toggle biomass acres/BDMT: colours change, outlines stay

---

## 18. Build, deploy, hosting

```
pnpm install
pnpm dev          # vite, localhost
pnpm build        # vite build → dist/
pnpm test         # vitest
pnpm e2e          # playwright
pnpm preview
```

`vite.config.ts`:

- `base: process.env.BASE_URL ?? '/'` — required for a path under the CC
  Lab site
- `worker.format: 'es'`
- Assets in `public/data` copied as-is; do not hash `sites.bin`

GitHub Actions: install pnpm, `pnpm test`, `pnpm build` on every PR.
Playwright on `main` only (download size).

Host: static `dist/` behind the lab’s existing site. **Open:** subdomain
(`siting.carboncontainmentlab.org`) vs path
(`carboncontainmentlab.org/burial`). That choice is the `base` href. It
does not change any component.

MIME types the host must serve: `image/tiff` for `.tif`, `image/webp`,
`application/octet-stream` for `.bin`, `application/geo+json` or
`application/json` for `.geojson`. Brotli/gzip JSON and GeoJSON. Long TTL
on hashed JS/CSS; short or hashed TTL on `public/data/*` (those filenames
are stable and change when the pipeline reruns).

No footer in v1, so the build hash is **not** on screen. It remains in
`manifest.json` for anyone who opens the network tab. Adding a hash chip
later is a Header change, not an architecture change.

---

## 19. Implementation order

1. Scaffold Vite + React + TS; port `tokens.css` / `fonts.css`; `DesktopGate`.
2. `lib/units.ts`, `lib/crs.ts`, `lib/distance.ts` + their tests.
3. `data/source.ts` against fixtures; `state/store.ts`; `state/url.ts`.
4. `MapView` + hillshade + state/county outlines + state labels.
5. Depth texture + shader + `SoilColumn`.
6. `LayerPanel` (including biomass metric and BECCS scenario subcontrols).
7. Mode 1: `CountyLookup` + `CountyResult` + hover card + click-to-fill.
8. `PlaceSearch`.
9. Mode 2: worker, `sites.bin` decode, ranking, geodesic radius, result card.
10. BECCS layer + optional compare card + point popup.
11. WHP raster, thinning, biomass choropleth.
12. Copy pass, live regions, reduced-motion, Playwright.

Mode 1 is fully buildable from `county_stats.json` before any raster work.

---

## 20. File-level responsibilities

| File | Owns | Must not |
|---|---|---|
| `app/App.tsx` | Composition of chrome + stage | Fetch, WebGL, query math |
| `state/store.ts` | Defaults, actions | I/O |
| `state/url.ts` | Search string | Camera |
| `data/source.ts` | Every `fetch` | UI |
| `data/textures.ts` | COG → WebGL texture | Colour (that’s the shader) |
| `workers/siteQuery.worker.ts` | Decode + rank | DOM, deck.gl |
| `lib/crs.ts` | proj4 wrapper | Distance |
| `lib/distance.ts` | `euclideanAlbers` | Any other CRS |
| `lib/copy.ts` | Strings | Formatting of numbers |
| `lib/format.ts` | `fmt`, metres, money, percent | Sentences |
| `map/MapView.tsx` | DeckGL, viewState ref, pick handlers | Panel JSX |
| `map/layers/*.ts` | Layer constructors | Store writes (return descriptors only) |
| `panels/SoilColumn.tsx` | Max-depth gesture | Texture |
| `panels/CountyLookup.tsx` | Cascading selects | Map camera |
| `chrome/PlaceSearch.tsx` | Typeahead + flyTo | Mode 1 fields |

---

## 21. Assumptions (change if wrong)

These were not asked. They are specified so implementation does not stall.

1. Terrain is always on and has **no toggle**. The locked default was “on”;
   omitting the row keeps the layer list identical to the mockup.
2. County outlines and state outlines are always on and have **no toggle**.
3. Slider range is **0.5–10 m, step 0.5 m**, default **10**, matching the
   mockup’s control even though the soil column replaces the `<input>`.
4. Default Mode 2 radius is **25 miles**.
5. Header is the text lockup from the mockup. **No logo image, no fingerprint
   motif** on this page.
6. No `selectedFacilityId` in the store; BECCS inspect is a deck tooltip.
7. Carbon efficiency and haul distance are **not** on the Mode 1 card. The
   two money figures, acres, BDMT, class, and depths are.
8. React 19, Vite 6, deck.gl 9, Zustand 5, pnpm 10.
9. CSS: global tokens + a single `overlays.css` for the floating chrome.
   No Tailwind, no CSS-in-JS.
10. `BASE_URL` defaults to `/` until the lab picks path vs subdomain.

---

## 22. Still open

Only these. Everything else in this file is decided.

1. **Hosting path** — subdomain or a path under carboncontainmentlab.org.
   Sets Vite `base`.
2. ~~Commercial display-face web licence~~ — **closed, resolved the other
   way.** The site ships Archivo under the SIL OFL and a system serif stack.
   A public repository cannot redistribute a commercially licensed font, and
   licensing one would bind every fork of this tool; openly licensed faces
   were the better trade. See `ATTRIBUTIONS.md`.
3. ~~Missing medium weights~~ — **moot.** Archivo is a variable font and
   carries the whole weight axis.
