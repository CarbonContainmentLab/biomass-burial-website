import { describe, expect, it } from 'vitest';

import {
  countyGeoid,
  isCountyGeoid,
  isStateFips,
  stateFips,
  stateName,
  STATES_ALPHABETICAL,
  stateOfGeoid,
} from '../lib/fips';

describe('FIPS padding', () => {
  it('pads the cases 01 §5 warns about', () => {
    expect(stateFips('4')).toBe('04');
    expect(stateFips(4)).toBe('04');
    expect(countyGeoid('4001')).toBe('04001');
    expect(countyGeoid(4001)).toBe('04001');
    // California is the one that fails silently if this is wrong.
    expect(countyGeoid(6001)).toBe('06001');
    expect(countyGeoid(6115)).toBe('06115');
  });

  it('leaves already-padded codes alone', () => {
    expect(stateFips('04')).toBe('04');
    expect(countyGeoid('04001')).toBe('04001');
    expect(countyGeoid('56045')).toBe('56045');
  });

  it('extracts the state half', () => {
    expect(stateOfGeoid('04001')).toBe('04');
    expect(stateOfGeoid('06115')).toBe('06');
  });

  it('validates shape, not membership', () => {
    expect(isStateFips('04')).toBe(true);
    expect(isStateFips('4')).toBe(false);
    expect(isStateFips('abc')).toBe(false);
    expect(isCountyGeoid('04001')).toBe(true);
    expect(isCountyGeoid('4001')).toBe(false);
    expect(isCountyGeoid(4001)).toBe(false);
  });
});

describe('study-area states', () => {
  it('has the eleven states from 01 §5, Stage 02', () => {
    expect(STATES_ALPHABETICAL).toHaveLength(11);
    expect(STATES_ALPHABETICAL.map((s) => s.fips).sort()).toEqual([
      '04',
      '06',
      '08',
      '16',
      '30',
      '32',
      '35',
      '41',
      '49',
      '53',
      '56',
    ]);
  });

  it('is sorted A–Z by name, which is the dropdown order', () => {
    const names = STATES_ALPHABETICAL.map((s) => s.name);
    expect(names[0]).toBe('Arizona');
    expect(names[names.length - 1]).toBe('Wyoming');
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it('names a state and passes unknown codes through', () => {
    expect(stateName('16')).toBe('Idaho');
    expect(stateName('99')).toBe('99');
  });
});
