/**
 * `manifest.json`: the pipeline's decisions, read rather than re-hard-coded
 * (03 §8.2). A pipeline re-run that changes the BECCS scenario list or the WHP
 * class breaks should change the interface without a frontend edit.
 *
 * Only the fields the app uses are typed. The manifest also carries source
 * checksums and per-stage statistics, which are there for a reviewer with the
 * network tab open, not for the runtime.
 */

/** The CRS the shipped distances are measured in. Mode 2 requires this exactly. */
export const REQUIRED_DISTANCE_CRS = 'EPSG:5070';

export interface Manifest {
  build: { hash: string; built_utc: string; pipeline_version: string };
  decisions: {
    depth: {
      default_max_m: number;
      display_max_m: number;
      model_feasibility_ceiling_m: number;
    };
    crs: { analysis: string; display: string; distance: string };
    wildfire_hazard: { class_breaks: number[]; class_labels: string[] };
    beccs: {
      default_scenario_pct: number;
      scenarios_pct: number[];
      search_radius_mi: number;
    };
    sites: { crs: string; count: number };
  };
  payload: { blocking: string[] };
  stages: {
    stage: string;
    stats?: Record<string, unknown>;
  }[];
}

export interface BasemapMeta {
  /** `[left, bottom, right, top]` in EPSG:3857 metres. */
  bbox3857: [number, number, number, number];
  texturePx: [number, number];
}

function stage(manifest: Manifest, id: string): Record<string, unknown> | undefined {
  return manifest.stages.find((s) => s.stage === id)?.stats;
}

/**
 * Basemap bounds come from the manifest because a WebP carries no
 * georeferencing. The two COGs carry their own, and are read from the file
 * instead (04_BUILD_PLAN §1 C2).
 *
 * The stage id is `s02b_basemap`; it was `s08_hillshade` until the grey ETOPO
 * relief was replaced by Natural Earth II (04_BUILD_PLAN §5.9). Reading the
 * bbox from the manifest rather than hard-coding it is why that swap changed
 * the frame from 23° to 68° of longitude without a coordinate landing here.
 */
export function basemapMeta(manifest: Manifest): BasemapMeta | null {
  const stats = stage(manifest, 's02b_basemap');
  const bbox = stats?.['bbox_3857'];
  const px = stats?.['texture_px'];
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  return {
    bbox3857: bbox as [number, number, number, number],
    texturePx: Array.isArray(px) && px.length === 2 ? (px as [number, number]) : [0, 0],
  };
}

export const distanceCrsSupported = (manifest: Manifest): boolean =>
  manifest.decisions.crs.distance === REQUIRED_DISTANCE_CRS;

export const displayMaxMetres = (manifest: Manifest): number =>
  manifest.decisions.depth.display_max_m;

export const defaultMaxMetres = (manifest: Manifest): number =>
  manifest.decisions.depth.default_max_m;

export const beccsScenarios = (manifest: Manifest): number[] =>
  manifest.decisions.beccs.scenarios_pct;

export const defaultBeccsScenario = (manifest: Manifest): number =>
  manifest.decisions.beccs.default_scenario_pct;

/**
 * Five class labels, sentence-cased for the legend. The manifest ships them
 * lower-case (`"very low"`); the interface shows `Very low`.
 */
export function whpClassLabels(manifest: Manifest): string[] {
  return manifest.decisions.wildfire_hazard.class_labels.map(
    (label) => label.charAt(0).toUpperCase() + label.slice(1),
  );
}

/** The allow-list the loading spinner waits on (03 §8.1). */
export const blockingFiles = (manifest: Manifest): string[] => manifest.payload.blocking;
