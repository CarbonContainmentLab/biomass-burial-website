import { describe, expect, it } from 'vitest';

import {
  centimeters,
  cmToM,
  meters,
  miles,
  miToM,
  mToCm,
  mToMi,
  raw,
} from '../lib/units';

describe('unit conversions', () => {
  it('round-trips centimetres and metres', () => {
    for (const cm of [3, 220, 1000, 65534]) {
      expect(raw(mToCm(cmToM(centimeters(cm))))).toBeCloseTo(cm, 9);
    }
  });

  it('converts the depth values the pipeline actually ships', () => {
    // sites_index.json: min 3 cm, median 220 cm, ceiling 1000 cm.
    expect(raw(cmToM(centimeters(3)))).toBeCloseTo(0.03, 9);
    expect(raw(cmToM(centimeters(220)))).toBeCloseTo(2.2, 9);
    expect(raw(cmToM(centimeters(1000)))).toBeCloseTo(10, 9);
  });

  it('round-trips metres and miles', () => {
    for (const m of [1, 1609.344, 40233.6, 160934.4]) {
      expect(raw(miToM(mToMi(meters(m))))).toBeCloseTo(m, 6);
    }
  });

  it('uses the international mile', () => {
    expect(raw(miToM(miles(1)))).toBeCloseTo(1609.344, 9);
    // The four radius options, in metres.
    expect(raw(miToM(miles(10)))).toBeCloseTo(16093.44, 6);
    expect(raw(miToM(miles(25)))).toBeCloseTo(40233.6, 6);
    expect(raw(miToM(miles(50)))).toBeCloseTo(80467.2, 6);
    expect(raw(miToM(miles(100)))).toBeCloseTo(160934.4, 6);
  });

  it('matches the display factor quoted in 03 §9', () => {
    expect(raw(mToMi(meters(1)))).toBeCloseTo(0.000621371192, 12);
  });
});
