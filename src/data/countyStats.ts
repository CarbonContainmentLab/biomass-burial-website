/**
 * `county_stats.json` — the whole of Query Mode 1 (03 §8.3, §11).
 *
 * Every function here is pure and takes the parsed file, so the lookup is unit
 * testable against a tiny committed fixture. A pipeline schema change should
 * break `countyLookup.test.ts`, not the site.
 *
 * Note what is *not* derived here: the depth-scope caption. It is rendered from
 * `meta.depth_scope` so that a v2 computing depth per accessibility class
 * changes the sentence on its own (01 §5, Stage 03).
 */

import { COPY } from '../lib/copy';
import { stateName, type Geoid2, type Geoid5 } from '../lib/fips';
import { meters, type Meters } from '../lib/units';
import type { RoadIdx, SlopeIdx } from '../state/types';

export type ClassId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';

export interface AccessibilityClass {
  id: ClassId;
  road_idx: RoadIdx;
  slope_idx: SlopeIdx;
  road_ft: [number, number];
  road_m: [number, number];
  slope_pct: [number, number];
  label: string;
  /** Class-constant: A1 = 17.17, A6 = 38.03 USD per tonne CO2e. */
  cost_usd_per_mtco2e: number;
}

export interface ClassStats {
  acres: number;
  bdmt: number;
  bdmt_per_year: number;
  /** Forestry treatment. Same for a given class in every county. */
  cost_usd_per_mtco2e: number;
  /** Burial pathway. Varies by county because it includes haulage. */
  net_income_burial_usd_per_mtco2e: number;
}

export interface CountyRecord {
  name: string;
  state: Geoid2;
  /** False means "not in the residue model", not "holds no biomass". */
  has_biomass: boolean;
  depth: { min: number; mean: number; median: number; n_pixels: number } | null;
  biomass?: {
    total_acres: number;
    total_bdmt: number;
    burial_path_length_km: number;
    burial_carbon_efficiency: number;
    wildfire_hazard_potential: number;
    classes: Record<ClassId, ClassStats>;
  };
}

export interface CountyStatsFile {
  meta: {
    counties: number;
    counties_with_biomass: number;
    /** Rendered verbatim into the result caption. */
    depth_scope: string;
    units: Record<string, string>;
    notes: Record<string, string>;
    accessibility_classes: AccessibilityClass[];
  };
  counties: Record<Geoid5, CountyRecord>;
}

/* ---- Option lists -------------------------------------------------------- */

export interface CountyOption {
  geoid: Geoid5;
  name: string;
  /** Rendered as a disabled option with a reason, not hidden (03 §0). */
  disabled: boolean;
  reason?: string;
}

export function countyOptionsForState(file: CountyStatsFile, stateFips: Geoid2): CountyOption[] {
  return Object.entries(file.counties)
    .filter(([, record]) => record.state === stateFips)
    .map(([geoid, record]) => ({
      geoid,
      name: record.name,
      disabled: !record.has_biomass,
      ...(record.has_biomass ? {} : { reason: COPY.notInResidueModel }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface RoadOption {
  idx: RoadIdx;
  /** `0–152.4 m (0–500 ft)` — the mockup's wording, built from the file. */
  label: string;
}

/**
 * Three road bands, one per `road_idx`. Anything beyond 0.5 mi from a road is
 * excluded from the upstream model, so it is not offered (01 §5, Stage 03).
 */
export function roadOptions(file: CountyStatsFile): RoadOption[] {
  const seen = new Map<RoadIdx, RoadOption>();
  for (const cls of file.meta.accessibility_classes) {
    if (seen.has(cls.road_idx)) continue;
    seen.set(cls.road_idx, {
      idx: cls.road_idx,
      label: `${trim(cls.road_m[0])}–${trim(cls.road_m[1])} m (${feetPart(cls.label)})`,
    });
  }
  return [...seen.values()].sort((a, b) => a.idx - b.idx);
}

/**
 * The imperial half of a road label, taken from the class label rather than
 * reformatted from `road_ft`. The file already says `1,000 ft - 0.5 mi` for the
 * widest band, and rebuilding that from `[1000, 2640]` would mean encoding the
 * "half a mile reads better than 2,640 feet" judgement in the frontend.
 */
function feetPart(label: string): string {
  const head = label.split(' from road')[0] ?? label;
  return enDash(head);
}

/** Hyphens between numbers are ranges, so they are en dashes on screen. */
function enDash(text: string): string {
  return text.replace(/(\d)\s*-\s*(\d)/g, '$1–$2').replace(/ - /g, ' – ');
}

function trim(n: number): string {
  return String(Number(n.toFixed(1)));
}

export function classFor(
  file: CountyStatsFile,
  roadIdx: RoadIdx,
  slopeIdx: SlopeIdx,
): AccessibilityClass | null {
  return (
    file.meta.accessibility_classes.find(
      (cls) => cls.road_idx === roadIdx && cls.slope_idx === slopeIdx,
    ) ?? null
  );
}

/* ---- Lookup -------------------------------------------------------------- */

export interface CountyLookup {
  geoid: Geoid5;
  countyName: string;
  stateFips: Geoid2;
  stateName: string;
  /** Whole-county figures. Null only where no 1 km pixel centre falls inside. */
  depthMin: Meters | null;
  depthMedian: Meters | null;
  /** Verbatim from `meta.depth_scope`, for the caption. */
  depthScope: string;
  classId: ClassId;
  /** `A1 · 0–500 ft from road, <20% slope` */
  classLabel: string;
  acres: number;
  bdmt: number;
  /** Forestry treatment, USD per tonne CO2e. */
  costUsdPerTco2e: number;
  /** Burial pathway net income, USD per tonne CO2e. Positive is revenue. */
  netIncomeUsdPerTco2e: number;
}

/**
 * A result exists only when all four controls are set *and* the county is in
 * the residue model. Everything else is an empty state, not an error.
 */
export function lookupCounty(
  file: CountyStatsFile,
  geoid: Geoid5 | null,
  roadIdx: RoadIdx | null,
  slopeIdx: SlopeIdx | null,
): CountyLookup | null {
  if (!geoid || roadIdx === null || slopeIdx === null) return null;

  const record = file.counties[geoid];
  if (!record || !record.has_biomass || !record.biomass) return null;

  const cls = classFor(file, roadIdx, slopeIdx);
  if (!cls) return null;

  const stats = record.biomass.classes[cls.id];
  if (!stats) return null;

  return {
    geoid,
    countyName: record.name,
    stateFips: record.state,
    stateName: stateName(record.state),
    depthMin: record.depth ? meters(record.depth.min) : null,
    depthMedian: record.depth ? meters(record.depth.median) : null,
    depthScope: file.meta.depth_scope,
    classId: cls.id,
    classLabel: `${cls.id} · ${enDash(cls.label)}`,
    acres: stats.acres,
    bdmt: stats.bdmt,
    costUsdPerTco2e: stats.cost_usd_per_mtco2e,
    netIncomeUsdPerTco2e: stats.net_income_burial_usd_per_mtco2e,
  };
}

/** True when the county exists but is outside the residue model. */
export function isCountyExcluded(file: CountyStatsFile, geoid: Geoid5 | null): boolean {
  if (!geoid) return false;
  const record = file.counties[geoid];
  return record !== undefined && !record.has_biomass;
}

export function countyRecord(file: CountyStatsFile, geoid: Geoid5 | null): CountyRecord | null {
  if (!geoid) return null;
  return file.counties[geoid] ?? null;
}
