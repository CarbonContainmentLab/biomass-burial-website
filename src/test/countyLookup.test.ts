import { describe, expect, it } from 'vitest';

import fixture from './fixtures/countyStats.tiny.json';
import {
  classFor,
  countyOptionsForState,
  isCountyExcluded,
  lookupCounty,
  roadOptions,
  type CountyStatsFile,
} from '../data/countyStats';
import { fmtAcres, fmtMetersBare, fmtTonnes, fmtUsdPerTco2e } from '../lib/format';

const file = fixture as unknown as CountyStatsFile;

describe('accessibility classes', () => {
  it('maps road x slope to the six documented ids', () => {
    expect(classFor(file, 0, 0)?.id).toBe('A1');
    expect(classFor(file, 1, 0)?.id).toBe('A2');
    expect(classFor(file, 2, 0)?.id).toBe('A3');
    expect(classFor(file, 0, 1)?.id).toBe('A4');
    expect(classFor(file, 1, 1)?.id).toBe('A5');
    expect(classFor(file, 2, 1)?.id).toBe('A6');
  });

  it('carries the TEA bounds the pipeline verifies against', () => {
    expect(classFor(file, 0, 0)?.cost_usd_per_mtco2e).toBeCloseTo(17.17, 3);
    expect(classFor(file, 2, 1)?.cost_usd_per_mtco2e).toBeCloseTo(38.03, 3);
  });

  it('formats the three road options exactly as the mockup does', () => {
    expect(roadOptions(file).map((o) => o.label)).toEqual([
      '0–152.4 m (0–500 ft)',
      '152.4–304.8 m (500–1,000 ft)',
      '304.8–804.7 m (1,000 ft – 0.5 mi)',
    ]);
  });
});

describe('county options', () => {
  it('lists counties A–Z within a state', () => {
    const options = countyOptionsForState(file, '04');
    expect(options.map((o) => o.name)).toEqual(['Apache', 'La Paz']);
  });

  it('shows counties that are not priority treatment areas, disabled, with a reason', () => {
    const laPaz = countyOptionsForState(file, '04').find((o) => o.geoid === '04012');
    expect(laPaz?.disabled).toBe(true);
    expect(laPaz?.reason).toBe('Not selected as highest priority treatment area');

    const apache = countyOptionsForState(file, '04').find((o) => o.geoid === '04001');
    expect(apache?.disabled).toBe(false);
    expect(apache?.reason).toBeUndefined();
  });

  it('does not leak counties from another state', () => {
    expect(countyOptionsForState(file, '53').map((o) => o.geoid)).toEqual(['53055']);
  });
});

describe('lookupCounty', () => {
  it('returns the known Apache County A1 figures', () => {
    const result = lookupCounty(file, '04001', 0, 0);
    expect(result).not.toBeNull();
    expect(result!.countyName).toBe('Apache');
    expect(result!.stateName).toBe('Arizona');
    expect(result!.classId).toBe('A1');
    expect(result!.acres).toBeCloseTo(328290.3, 1);
    expect(result!.bdmt).toBeCloseTo(2644830.8, 1);
    expect(result!.costUsdPerTco2e).toBeCloseTo(17.17, 3);
    expect(result!.netIncomeUsdPerTco2e).toBeCloseTo(26.932, 3);
    expect(result!.depthMin as number).toBeCloseTo(0.32, 3);
    expect(result!.depthMedian as number).toBeCloseTo(3.561, 3);
  });

  it('renders those figures the way the card shows them', () => {
    const r = lookupCounty(file, '04001', 0, 0)!;
    expect(fmtMetersBare(r.depthMin!)).toBe('0.3');
    expect(fmtMetersBare(r.depthMedian!)).toBe('3.6');
    expect(fmtAcres(r.acres)).toBe('328,290 ac');
    expect(fmtTonnes(r.bdmt)).toBe('2,644,831 t');
    expect(fmtUsdPerTco2e(r.costUsdPerTco2e)).toBe('$17.17 / tCO₂e');
    expect(fmtUsdPerTco2e(r.netIncomeUsdPerTco2e)).toBe('$26.93 / tCO₂e');
  });

  it('labels the class with its id and its plain-language description', () => {
    expect(lookupCounty(file, '04001', 0, 0)!.classLabel).toBe(
      'A1 · 0–500 ft from road, <20% slope',
    );
    expect(lookupCounty(file, '04001', 2, 1)!.classLabel).toBe(
      'A6 · 1,000 ft – 0.5 mi from road, 20–40% slope',
    );
  });

  it('changes both money figures when the class changes', () => {
    const a1 = lookupCounty(file, '04001', 0, 0)!;
    const a6 = lookupCounty(file, '04001', 2, 1)!;
    expect(a6.costUsdPerTco2e).toBeCloseTo(38.03, 3);
    expect(a6.netIncomeUsdPerTco2e).toBeCloseTo(6.072, 3);
    expect(a6.costUsdPerTco2e).toBeGreaterThan(a1.costUsdPerTco2e);
    expect(a6.netIncomeUsdPerTco2e).toBeLessThan(a1.netIncomeUsdPerTco2e);
  });

  it('keeps forestry cost class-constant across counties but lets net income vary', () => {
    const apache = lookupCounty(file, '04001', 0, 0)!;
    const butte = lookupCounty(file, '06007', 0, 0)!;
    expect(butte.costUsdPerTco2e).toBeCloseTo(apache.costUsdPerTco2e, 6);
    expect(butte.netIncomeUsdPerTco2e).not.toBeCloseTo(apache.netIncomeUsdPerTco2e, 3);
  });

  it('carries meta.depth_scope through rather than a hard-coded caption', () => {
    expect(lookupCounty(file, '04001', 0, 0)!.depthScope).toBe('whole county');
  });

  it('returns null until all four controls are set', () => {
    expect(lookupCounty(file, null, 0, 0)).toBeNull();
    expect(lookupCounty(file, '04001', null, 0)).toBeNull();
    expect(lookupCounty(file, '04001', 0, null)).toBeNull();
  });

  it('refuses a county outside the residue model', () => {
    expect(lookupCounty(file, '04012', 0, 0)).toBeNull();
    expect(isCountyExcluded(file, '04012')).toBe(true);
    expect(isCountyExcluded(file, '04001')).toBe(false);
  });

  it('refuses an unknown GEOID without throwing', () => {
    expect(lookupCounty(file, '99999', 0, 0)).toBeNull();
    expect(isCountyExcluded(file, '99999')).toBe(false);
  });
});
