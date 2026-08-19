/**
 * The map. Owns the MapLibre instance, the deck.gl overlay and the pick
 * handlers, and nothing else — no panel JSX, no query maths (03 §20).
 *
 * ## Two renderers, one camera
 *
 * The vector basemap requires MapLibre; the data layers are deck.gl. MapLibre
 * owns the camera and deck.gl draws **interleaved** into its WebGL context via
 * `MapboxOverlay` (which works with MapLibre despite the name). Interleaving is
 * what lets basemap labels sit *above* the depth surface instead of being
 * buried by it, and it means there is exactly one camera rather than two kept
 * in sync — the camera-sync seam `02 §2` chose deck.gl standalone to avoid.
 *
 * deck.gl 9 requires WebGL2, so interleaving only works because MapLibre 6
 * provides a WebGL2 context. If that ever regresses, the fallback is
 * `interleaved: false`, which costs label ordering but keeps everything else.
 *
 * ## The camera is still not in React, and still not in the store
 *
 * `03 §6` and `04_BUILD_PLAN §6.1` both turn on this. The map instance lives in
 * a ref; there is no `viewState` state and no store write on a pan, so a pan
 * frame touches no React component and no subscriber. `viewState.ts` keeps its
 * public API — `fitToBounds`, `COUNTY_ZOOM`, `peekCamera` — and now drives
 * MapLibre through the same `CameraHost` interface it used to drive deck.gl.
 *
 * ## The basemap arrives late, on purpose
 *
 * The map is constructed with a flat `--surface-map` style and every data layer
 * live, then swaps to the Protomaps style once the 36.8 MB archive resolves
 * (see `loadBasemapArchive.ts`). `setStyle` drops custom layers, so the overlay
 * is re-added on `styledata`.
 */

import type { PickingInfo } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import {
  loadBeccs,
  loadCountiesBiomass,
  loadThinning,
  peekBeccs,
  peekCounties,
  peekCountiesBiomass,  peekManifest,
  peekStates,
  peekThinning,
  type BeccsFeature,
  type CountyFeature,
} from '../data/source';
import { ensureDepthGrid, ensureWhpGrid, type RasterGrid } from '../data/textures';
import { COPY } from '../lib/copy';
import { fmtCount, fmtLatLng, fmtPercent, fmtUsdPerTco2e } from '../lib/format';
import { featureBbox, findContainingFeature } from '../lib/pointInPolygon';
import { latLng } from '../lib/units';
import {
  selectBeccsScenario,
  selectBiomassMetric,
  selectHoverGeoid,
  selectLayers,
  selectMaxDepth,
  selectPicking,
  selectSite,
} from '../state/selectors';
import { useStore } from '../state/store';
import { noteCameraMoved } from '../state/url';
import { basemapStyle, cameraFence, minZoomFor } from './basemapStyle';
import { buildLayers } from './layers';
import { loadBasemapArchive } from './loadBasemapArchive';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  initialViewState,
  registerCameraHost,
  reducedMotion,
  type MapViewState,
} from './viewState';

/**
 * The zoom-out stop, from the live canvas.
 *
 * `maxBounds` is deliberately *not* the thing that stops a zoom-out. It clamps
 * after the fact, so a flicked scroll wheel coasts past the data and snaps back
 * when the inertia dies — bare page colour, then a jump. `minZoom` is enforced
 * inside the transform, so momentum just runs out against it with nothing to
 * recover from. Recomputed on resize because the floor depends on how much
 * canvas there is to fill.
 */
const applyZoomFloor = (map: MapLibreMap): void => {
  const canvas = map.getCanvas();
  const floor = minZoomFor(canvas.clientWidth || 1, canvas.clientHeight || 1);
  map.setMinZoom(Math.max(MIN_ZOOM, floor));
};

/**
 * The basemap's first text layer — the seam the data is inserted at.
 *
 * Read off the live style rather than hard-coded. It does not exist until the
 * Protomaps style has replaced the flat one, and Protomaps is free to rename
 * its layers between versions; a stale constant would silently put the data
 * back on top with no error to notice.
 */
const firstLabelLayer = (map: MapLibreMap): string | undefined =>
  map.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id;

/**
 * Hand the overlay its layers, anchored beneath the basemap's labels.
 *
 * This is the whole point of interleaving: basemap ground under the data,
 * basemap text over it. `@deck.gl/mapbox` collects every layer carrying the
 * same `beforeId` into one group and splices that group into the MapLibre layer
 * order at that point — so all of deck lands immediately before the first
 * symbol layer, and the eleven label layers above it draw last.
 *
 * `beforeId` is read by `@deck.gl/mapbox` rather than by deck's own core, so it
 * is absent from `LayerProps` and the cast is unavoidable.
 *
 * Falls back to unanchored — deck on top, as in overlay mode — while the flat
 * style is still up and there is no label layer to anchor to.
 */
const applyLayers = (
  map: MapLibreMap | null,
  overlay: MapboxOverlay | null,
  layers: ReturnType<typeof buildLayers>,
): void => {
  if (!overlay) return;
  const beforeId = map ? firstLabelLayer(map) : undefined;
  overlay.setProps({
    layers: beforeId ? layers.map((layer) => layer.clone({ beforeId } as never)) : layers,
  });
};

/** What the map shows before the archive lands, and if it never does. */
const FLAT_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'flat-ground',
      type: 'background',
      paint: { 'background-color': '#EDEDE8' },
    },
  ],
};

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  /** Synchronous mirror of the camera, so `viewState.ts` never subscribes. */
  const viewRef = useRef<MapViewState>(initialViewState());
  /**
   * The current layer array, readable from the map effect's callbacks.
   *
   * That effect runs once, so its closure would otherwise hold the empty layer
   * array forever — and both the `load` and post-`setStyle` handlers need
   * whatever the layers are *now*, not at construction.
   */
  const layersRef = useRef<ReturnType<typeof buildLayers>>([]);

  const layersOn = useStore(selectLayers);
  const maxDepth = useStore(selectMaxDepth);
  const biomassMetric = useStore(selectBiomassMetric);
  const beccsScenario = useStore(selectBeccsScenario);
  const hoverGeoid = useStore(selectHoverGeoid);
  const selectedGeoid = useStore((s) => s.county.geoid);
  const picking = useStore(selectPicking);
  const site = useStore(selectSite);

  // Subscribing to the Set itself: its identity changes on every markLoaded, so
  // this is the signal that a `peek*` will now return something.
  const loaded = useStore((s) => s.data.loaded);

  const setHoverGeoid = useStore((s) => s.setHoverGeoid);
  const selectCountyFromMap = useStore((s) => s.selectCountyFromMap);
  const setMode = useStore((s) => s.setMode);
  const setRightOpen = useStore((s) => s.setRightOpen);
  const setPicking = useStore((s) => s.setPicking);
  const setSiteOrigin = useStore((s) => s.setSiteOrigin);

  const [depthGrid, setDepthGrid] = useState<RasterGrid | null>(null);
  const [whpGrid, setWhpGrid] = useState<RasterGrid | null>(null);

  /* ---- Picking helpers (declared before the map effect uses them) --------- */

  const countyIndex = useMemo(() => {
    const counties = peekCounties();
    if (!counties) return null;
    return { features: counties.features, bboxes: counties.features.map(featureBbox) };
  }, [loaded]);

  const countyAt = useCallback(
    (coordinate: number[] | undefined): CountyFeature | null => {
      if (!coordinate || !countyIndex) return null;
      const lng = coordinate[0];
      const lat = coordinate[1];
      if (lng === undefined || lat === undefined) return null;
      return findContainingFeature(lng, lat, countyIndex.features, countyIndex.bboxes);
    },
    [countyIndex],
  );

  // Pick handlers read fast-changing values through a ref so the overlay's
  // props do not have to be rebuilt on every hover.
  const handlers = useRef({ picking, countyAt });
  handlers.current = { picking, countyAt };

  const onHover = useCallback(
    (info: PickingInfo) => {
      // A BECCS point under the cursor owns the interaction: its tooltip is the
      // thing being asked for, and the county behind it is still in the rail.
      if (info.layer?.id.startsWith('beccs') && info.object) return;
      setHoverGeoid(handlers.current.countyAt(info.coordinate)?.properties.GEOID ?? null);
    },
    [setHoverGeoid],
  );

  const onClick = useCallback(
    (info: PickingInfo) => {
      if (handlers.current.picking) {
        const coordinate = info.coordinate;
        if (coordinate) setSiteOrigin(latLng(coordinate[1]!, coordinate[0]!));
        setPicking(false);
        return;
      }
      const feature = handlers.current.countyAt(info.coordinate);
      if (feature) {
        // A map click fills Mode 1 and opens the panel. Road and slope are left
        // alone: the click says which county, not how reachable the biomass is.
        selectCountyFromMap(feature.properties.STATEFP, feature.properties.GEOID);
        setMode('county');
        setRightOpen(true);
      }
    },
    [selectCountyFromMap, setMode, setPicking, setRightOpen, setSiteOrigin],
  );

  const getTooltip = useCallback((info: PickingInfo) => {
    if (!info.object || !info.layer?.id.startsWith('beccs')) return null;
    const feature = info.object as BeccsFeature;
    const p = feature.properties;
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    return {
      className: 'map-tooltip',
      html: `
        <span class="eyebrow">${COPY.beccsTooltipHeading} · ${p.scenario}%</span>
        <dl>
          <dt>${COPY.beccsPlantType}</dt><dd>${escapeHtml(p.plant_type)}</dd>
          <dt>${COPY.beccsCdr}</dt><dd>${fmtCount(p.cdr_tco2)} tCO₂</dd>
          <dt>${COPY.beccsCost}</dt><dd>${fmtUsdPerTco2e(p.cost_usd_per_tco2)}</dd>
          <dt>${COPY.beccsForestryShare}</dt><dd>${fmtPercent(p.forestry_fraction)}</dd>
          <dt>${COPY.coordinates}</dt><dd>${fmtLatLng(lat, lng)}</dd>
        </dl>`,
      style: { backgroundColor: 'transparent', boxShadow: 'none', padding: '0' },
    };
  }, []);

  /* ---- Map construction, once -------------------------------------------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initial = initialViewState();
    const map = new MapLibreMap({
      container,
      style: FLAT_STYLE,
      center: [initial.longitude!, initial.latitude!],
      zoom: initial.zoom!,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: cameraFence(),
      // 03 §0 keeps the map flat: no rotation, no pitch.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // ODbL requires © OpenStreetMap to be visible, not behind a toggle (§7).
      attributionControl: { compact: false },
      // The canvas is out of tab order; lat/lng fields are the keyboard path
      // into Mode 2 (03 §15).
      keyboard: false,
      fadeDuration: reducedMotion() ? 0 : 300,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();

    /**
     * Interleaved: deck.gl draws into MapLibre's own WebGL context and its
     * layers are spliced into the MapLibre layer order, rather than being
     * stacked on a second canvas above it.
     *
     * This is what makes basemap text sit *above* the data. In overlay mode
     * deck owns a canvas in front of MapLibre's, so every place name is behind
     * the depth surface and there is no ordering knob to turn — the canvases
     * are stacked and that is that. Interleaved puts both in one canvas and one
     * layer list, where `applyLayers` can anchor the data beneath the labels.
     *
     * It also halves the number of WebGL contexts on the page, which is not
     * nothing on the Intel integrated GPUs this has to hold 60 fps on.
     */
    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      onHover,
      onClick,
      getTooltip,
    });
    overlayRef.current = overlay;

    /**
     * Interleaved mode inserts deck layers *into* the MapLibre style, so the
     * style has to exist first. Adding the control before `load` leaves the
     * layers with nowhere to go and the map renders empty.
     */
    const attach = () => {
      if (!map.hasControl(overlay)) map.addControl(overlay);
      applyLayers(map, overlay, layersRef.current);
    };
    if (map.isStyleLoaded()) attach();
    else map.once('load', attach);

    /* Camera. `viewState.ts` drives MapLibre through the same interface it
       used for deck.gl, so `fitToBounds` and "Zoom to county" are untouched. */
    const readCamera = (): MapViewState => {
      const c = map.getCenter();
      return {
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        pitch: 0,
        bearing: 0,
      };
    };
    viewRef.current = readCamera();

    registerCameraHost({
      get: () => viewRef.current,
      set: (next) => {
        const target = {
          center: [next.longitude!, next.latitude!] as [number, number],
          zoom: next.zoom!,
        };
        // `transitionDuration` is how viewState.ts asks for easing; honouring
        // reduced motion stays its decision, not this module's.
        if (next.transitionDuration && !reducedMotion()) map.flyTo({ ...target, speed: 1.6 });
        else map.jumpTo(target);
      },
      size: () => {
        const canvas = map.getCanvas();
        return { width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 };
      },
    });

    const onMove = () => {
      viewRef.current = readCamera();
      // Debounced to gesture-idle inside url.ts; this stays a timer reset.
      noteCameraMoved();
    };
    map.on('move', onMove);

    /* One fence, every zoom — it is set once at construction and never touched
       again, so nothing can move the camera out from under a gesture. The
       zoom-out is stopped by `minZoom`, and the ground past the archive's edge
       is filled by the coarse backdrop rather than fenced away. */
    const onResize = () => applyZoomFloor(map);
    applyZoomFloor(map);
    map.on('resize', onResize);

    /* The basemap, deferred. First paint does not wait on 36.8 MB. */
    let disposed = false;
    void loadBasemapArchive().then((ok) => {
      if (!ok || disposed) return;
      /**
       * No overlay teardown here, deliberately.
       *
       * `setStyle` does drop the deck layer groups out of the style, and the
       * obvious repair is to detach and reattach the overlay. That repair is
       * actively harmful: it recreates deck's `Device` and orphans the GPU
       * textures `whp.ts` and `depth.ts` hold in their layer state, which is
       * what used to make the wildfire raster render blank or garbled after a
       * reload depending on whether its texture happened to be built before or
       * after the basemap arrived. The overlay reinserts its own groups on a
       * style change; it needs nothing from us.
       *
       * What it does need is the anchor. The flat style has no text layer, so
       * the layers went in unanchored; now that the real basemap exists there
       * is a first symbol layer to sit beneath, and they are re-handed over
       * with it. `styledata` rather than `load` — the map loaded long ago.
       */
      map.once('styledata', () => {
        if (!disposed) applyLayers(map, overlay, layersRef.current);
      });
      map.setStyle(basemapStyle());
    });

    return () => {
      disposed = true;
      map.off('move', onMove);
      map.off('resize', onResize);
      registerCameraHost(null);
      overlayRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // Constructed once. Handlers are stable callbacks; layers flow in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Cursor ------------------------------------------------------------ */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = picking ? 'crosshair' : hoverGeoid ? 'pointer' : '';
  }, [picking, hoverGeoid]);

  /* ---- Asset loading ----------------------------------------------------- */

  useEffect(() => {
    let alive = true;
    ensureDepthGrid()
      .then((grid) => {
        if (alive) setDepthGrid(grid);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!layersOn.whp) return;
    let alive = true;
    ensureWhpGrid()
      .then((grid) => {
        if (alive) setWhpGrid(grid);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [layersOn.whp]);

  useEffect(() => {
    if (layersOn.thinning) void loadThinning().catch(() => {});
  }, [layersOn.thinning]);

  useEffect(() => {
    if (layersOn.biomass) void loadCountiesBiomass().catch(() => {});
  }, [layersOn.biomass]);

  useEffect(() => {
    if (layersOn.beccs || site.compareBeccs) void loadBeccs().catch(() => {});
  }, [layersOn.beccs, site.compareBeccs]);

  /* ---- Layers ------------------------------------------------------------ */

  const layers = useMemo(
    () =>
      buildLayers({
        manifest: peekManifest(),
        states: peekStates(),
        counties: peekCounties(),
        countiesBiomass: peekCountiesBiomass(),        depth: depthGrid,
        whp: whpGrid,
        thinning: peekThinning(),
        beccs: peekBeccs(),
        layers: layersOn,
        maxDepth,
        biomassMetric,
        beccsScenario,
        hoverGeoid,
        selectedGeoid,
        origin: site.origin,
        radiusMi: site.radiusMi,
        site: site.result,
        beccsHit: site.beccs,
        compareBeccs: site.compareBeccs,
      }),
    [
      loaded,
      depthGrid,
      whpGrid,
      layersOn,
      maxDepth,
      biomassMetric,
      beccsScenario,
      hoverGeoid,
      selectedGeoid,
      site,
    ],
  );

  // The only bridge from React to the overlay. A pan does not come through
  // here, which is the point: layer diffing is a no-op on a camera frame.
  //
  // The ref is written first and unconditionally, so the map effect's `load`
  // and post-`setStyle` handlers can reinsert whatever the current layers are
  // even if they fire before or after this effect.
  useEffect(() => {
    layersRef.current = layers;
    applyLayers(mapRef.current, overlayRef.current, layers);
  }, [layers]);

  return (
    <div className="map-canvas">
      <div
        ref={containerRef}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0 }}
      />
      <p className="sr-only">{COPY.mapSummary}</p>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
