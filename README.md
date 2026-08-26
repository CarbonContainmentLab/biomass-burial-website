# Biomass burial siting tool — frontend

A static single-page app: `index.html` plus hashed assets. No application server,
no database, no API keys. Everything under `public/data/` is committed here and
served as a static file; the app never talks to a service.

The data is produced by a separate Python pipeline that lives in the project
monorepo, not in this repository. That means the files under `public/data/` can
be served and verified here but not regenerated here — `manifest.json` records
the SHA-256 of every input they were derived from, and the pipeline is what
checks them against it.

Canonical design: [`docs/03_FRONTEND_ARCHITECTURE.md`](docs/03_FRONTEND_ARCHITECTURE.md).
Licensing of the data, basemap and fonts: [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).

## Running it

```bash
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest unit tests |
| `npm run e2e` | Playwright, against a production build |
| `npm run typecheck` | `tsc -b`, no emit |
| `npm run budget` | Payload budget check against `dist/` |

Playwright needs its browser once: `npx playwright install chromium`.

## Deploying

The only thing the hosting decision changes is the base href:

```bash
npm run build                      # served from the domain root
BASE_URL=/burial/ npm run build    # served from a path
```

Every asset URL is built from `import.meta.env.BASE_URL`, so nothing else moves.

The host must serve `image/tiff` for `.tif`, `image/webp` for `.webp`,
`application/octet-stream` for `.bin`, `font/woff2` for `.woff2`, and JSON or
`application/geo+json` for `.geojson`. Gzip or brotli the JSON and GeoJSON — but
not the fonts, which are already compressed. Long TTL on the hashed JS and CSS,
and on `public/fonts/*`, which never changes; short or revalidated TTL on
`public/data/*`, whose filenames are stable and whose contents change when the
pipeline re-runs.

## Layout

Three trees on purpose — chrome, panels, map — and not a `components/` drawer.

```
src/
├── app/         shell, desktop gate, boot sequence
├── chrome/      header and brand lockup
├── panels/      left rail and the two query modes
├── map/         DeckGL host, camera, layer constructors, shaders
├── state/       Zustand store, selectors, URL serialisation
├── data/        the only module that fetches; parsers and GPU textures
├── workers/     site-search worker and its main-thread owner
├── lib/         units, CRS, distance, geometry, formatting, copy
└── test/        Vitest + committed fixtures
e2e/             Playwright specs
```

## Things worth knowing before changing this

- **Units and CRSs are branded types.** `src/lib/units.ts` is the only file that
  constructs one. Distances are Euclidean in **EPSG:5070** and nowhere else —
  `src/lib/distance.ts` takes `AlbersXY` precisely so this cannot be
  "simplified" into Web Mercator or screen space.
- **Nothing measures a displayed pixel.** Every figure on screen comes from
  `county_stats.json` or the 5070 site index. The rasters exist to be looked at.
- **All user-facing text lives in `src/lib/copy.ts`.** That is what makes the
  house rules greppable: distances read "straight-line", the word "network"
  appears nowhere, and money is per tonne CO₂e rather than per dry ton.
- **The store holds no camera and no decoded data.** Camera is React state local
  to `MapView`; parsed GeoJSON and textures live in module caches under
  `src/data/`. Subscribe with a selector — `useStore(s => s.maxDepth)` — never
  bare `useStore()`.
- **Layer modules return descriptors only.** They never write to the store.
- **The depth raster carries two sentinels**, 65534 for "deeper than the 10 m
  display ceiling" and 65535 for nodata. Neither is zero, whatever
  `manifest.json` says about it. See `04_BUILD_PLAN.md` §1 C1.
- **Type is openly licensed, by decision.** `--font-ui` is **Archivo**,
  self-hosted from `public/fonts/` under the SIL Open Font License;
  `--font-serif` is a Georgia-first system stack used only by the empty-state
  sentences. The lab's design system is drawn in commercially licensed display
  faces, and this deliberately does not use them: a public repository cannot
  redistribute them, and a web licence would put a permanent obligation on
  everyone who forks this. That closes `03 §22` item 2. `public/fonts/OFL.txt`
  is required by the licence to ship alongside the binaries — it is not a stray
  file. Swapping families is a two-file change (`src/styles/fonts.css` and
  `src/styles/tokens.css`) and touches no component.

## Not in v1

Phone and tablet layout, road-network distance, dark mode, browser storage,
analytics, a footer, county labels, and any special rendering of the 6.67–10 m
band.

Also not here, though `03` specifies it: the **header place search**. It was
built and then removed — clicking a county is the gesture that answers a
question about a place, and "Zoom to county" moves the camera from the result
card, so a typeahead that only moved the camera was a second, weaker way to do
the same thing. `04_BUILD_PLAN.md` §5.4 has the full note.
