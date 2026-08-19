/**
 * The camera. Deliberately not in the store (03 §6).
 *
 * `MapView` registers a host here; everything that needs to move the map —
 * "Zoom to county" and a successful Mode 2 result — calls a function in this
 * module. Nothing reads the camera to decide what to render, so a pan frame
 * never touches React.
 *
 * `prefers-reduced-motion` turns every move into a jump rather than a flight
 * (03 §15).
 */

import { FlyToInterpolator, type MapViewState as DeckMapViewState } from '@deck.gl/core';
import { fitBounds as mercatorFitBounds } from '@math.gl/web-mercator';

/**
 * 03 §10. maxZoom is 10 because the data is 1 km; 12 would imply precision the
 * model lacks.
 *
 * minZoom is a floor of last resort, not the real stop. `minZoomFor` computes
 * the actual one from the canvas — the zoom at which the basemap fence exactly
 * fills the viewport, so there is nothing further out left to show — and
 * `MapView` installs it. That lands near 4.45 on a desktop canvas. This value
 * only matters on a canvas small enough that the fence still has slack at z3.
 */
export const INITIAL_VIEW_STATE = {
  // Chosen from a live camera: the whole modelled West in frame, with enough
  // of the plains and the Pacific either side that the data's edges are inside
  // the view rather than against it.
  longitude: -114.1996,
  latitude: 40.8454,
  zoom: 4.58,
  minZoom: 3,
  maxZoom: 10,
  pitch: 0,
  bearing: 0,
};

export const MIN_ZOOM = INITIAL_VIEW_STATE.minZoom;
export const MAX_ZOOM = INITIAL_VIEW_STATE.maxZoom;

/** The zoom cap for "Zoom to county" (03 §11). */
export const COUNTY_ZOOM = 8;

/**
 * deck.gl's own view state, which already carries the transition fields. Aliased
 * rather than redeclared so `onViewStateChange` stays assignable.
 */
export type MapViewState = DeckMapViewState;

export interface CameraHost {
  get(): MapViewState;
  /** Applies a view state to the Deck instance without a React render. */
  set(next: MapViewState): void;
  size(): { width: number; height: number };
}

let host: CameraHost | null = null;

export function registerCameraHost(next: CameraHost | null): void {
  host = next;
}

/* ---- Shared-link camera -------------------------------------------------- */

/** Just the three fields a link carries. Pitch and bearing are always 0 here. */
export interface CameraParams {
  longitude: number;
  latitude: number;
  zoom: number;
}

let pendingCamera: CameraParams | null = null;

/**
 * Hand `MapView` the camera a shared link asked for. Set once by `boot.ts`
 * before the first render; the camera still never enters the store (03 §6), so
 * this module is where it waits.
 */
export function setInitialCamera(camera: CameraParams | null): void {
  pendingCamera = camera;
}

/**
 * The camera `MapView` should start at: the link's, if it carried one, else the
 * default view. Zoom is clamped here rather than at parse time so the zoom
 * policy stays next to `MIN_ZOOM` / `MAX_ZOOM` and `state/url.ts` does not have
 * to know it.
 *
 * Deliberately non-destructive: StrictMode invokes a `useState` initialiser
 * twice, and a read that consumed the value would hand the second call the
 * default and silently lose the shared camera.
 */
export function initialViewState(): MapViewState {
  if (!pendingCamera) return { ...INITIAL_VIEW_STATE };
  return {
    ...INITIAL_VIEW_STATE,
    longitude: pendingCamera.longitude,
    latitude: pendingCamera.latitude,
    zoom: clampZoom(pendingCamera.zoom),
  };
}

/**
 * The camera to serialise, or `null` if there is nothing to say yet.
 *
 * Falls back to the pending link camera before `MapView` mounts. Without that,
 * the very first URL write — which happens in `bootSync`, before any component
 * exists — would serialise "no camera" and strip the params off the link the
 * visitor just opened.
 */
export function peekCamera(): MapViewState | null {
  if (host) return host.get();
  return pendingCamera ? initialViewState() : null;
}

export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clampZoom = (zoom: number, cap = MAX_ZOOM): number => Math.max(MIN_ZOOM, Math.min(cap, zoom));

/** Move the camera to a target centre and zoom, easing unless motion is reduced. */
function moveTo(longitude: number, latitude: number, zoom: number): void {
  if (!host) return;
  const current = host.get();
  const next: MapViewState = {
    longitude,
    latitude,
    zoom,
    minZoom: current.minZoom ?? MIN_ZOOM,
    maxZoom: current.maxZoom ?? MAX_ZOOM,
    pitch: current.pitch ?? 0,
    bearing: current.bearing ?? 0,
  };
  if (!reducedMotion()) {
    next.transitionDuration = 600;
    next.transitionInterpolator = new FlyToInterpolator({ speed: 1.6 });
  }
  host.set(next);
}

/**
 * `bounds` is `[minLng, minLat, maxLng, maxLat]`.
 *
 * `pad` expands the box by a fraction on every side, matching the mockup's
 * Leaflet `pad(0.6)` rather than a pixel padding — a pixel padding frames
 * differently on a 1440 px screen than on a 2560 px one, and it is the mockup's
 * framing that is being reproduced.
 */
export function fitToBounds(
  bounds: readonly [number, number, number, number],
  options: { pad?: number; maxZoom?: number } = {},
): void {
  if (!host) return;
  const { pad = 0.2, maxZoom = MAX_ZOOM } = options;
  const { width, height } = host.size();
  if (width < 2 || height < 2) return;

  const spanLng = Math.max(bounds[2] - bounds[0], 1e-4);
  const spanLat = Math.max(bounds[3] - bounds[1], 1e-4);
  const west = bounds[0] - spanLng * pad;
  const east = bounds[2] + spanLng * pad;
  const south = Math.max(-85, bounds[1] - spanLat * pad);
  const north = Math.min(85, bounds[3] + spanLat * pad);

  const fitted = mercatorFitBounds({
    width,
    height,
    bounds: [
      [west, south],
      [east, north],
    ],
  });

  moveTo(fitted.longitude, fitted.latitude, clampZoom(fitted.zoom, maxZoom));
}
