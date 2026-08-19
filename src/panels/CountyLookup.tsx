/**
 * Query Mode 1 — cascading selects, then a result.
 *
 * Counties outside the residue model are shown **disabled with a reason**, not
 * hidden and not offered-then-empty (03 §11). Hiding them would suggest the
 * county does not exist; offering them would promise an answer the model cannot
 * give. `has_biomass: false` means "not part of the residue model", not "holds no
 * biomass", and that sentence is the tooltip.
 *
 * The panel owns the selects and nothing else — no camera work beyond the result
 * card's own button (03 §20).
 */

import { countyOptionsForState, isCountyExcluded, lookupCounty, roadOptions, type CountyStatsFile } from '../data/countyStats';
import { peekCountyStats } from '../data/source';
import { COPY } from '../lib/copy';
import { STATES_ALPHABETICAL } from '../lib/fips';
import { selectCounty } from '../state/selectors';
import { useStore } from '../state/store';
import type { RoadIdx, SlopeIdx } from '../state/types';
import { CountyResult } from './CountyResult';
import { EmptyState } from './EmptyState';

export function CountyLookup() {
  const county = useStore(selectCounty);
  const loaded = useStore((s) => s.data.loaded);
  const statsFailed = useStore((s) => s.data.failed.has('countyStats'));
  const selectState = useStore((s) => s.selectState);
  const selectCountyGeoid = useStore((s) => s.selectCounty);
  const setRoadIdx = useStore((s) => s.setRoadIdx);
  const setSlopeIdx = useStore((s) => s.setSlopeIdx);

  const file = loaded.has('countyStats') ? peekCountyStats<CountyStatsFile>() : null;

  if (statsFailed) {
    return <EmptyState>{COPY.layerFailed.biomass}</EmptyState>;
  }

  const counties = file && county.stateFips ? countyOptionsForState(file, county.stateFips) : [];
  const roads = file ? roadOptions(file) : [];
  const result = file ? lookupCounty(file, county.geoid, county.roadIdx, county.slopeIdx) : null;
  const excluded = file ? isCountyExcluded(file, county.geoid) : false;

  return (
    <div>
      <p className="query-intro">{COPY.countyIntro}</p>

      <label className="field-label" htmlFor="county-state">
        {COPY.labelState}
      </label>
      <select
        id="county-state"
        value={county.stateFips ?? ''}
        onChange={(event) => selectState(event.target.value || null)}
        style={{ marginBottom: 12 }}
      >
        <option value="">{COPY.placeholderState}</option>
        {STATES_ALPHABETICAL.map((state) => (
          <option key={state.fips} value={state.fips}>
            {state.name}
          </option>
        ))}
      </select>

      <label className="field-label" htmlFor="county-county">
        {COPY.labelCounty}
      </label>
      <select
        id="county-county"
        value={county.geoid ?? ''}
        disabled={!county.stateFips || !file}
        onChange={(event) => selectCountyGeoid(event.target.value || null)}
      >
        <option value="">
          {county.stateFips ? COPY.placeholderCounty : COPY.placeholderCountyLocked}
        </option>
        {counties.map((option) => (
          <option
            key={option.geoid}
            value={option.geoid}
            disabled={option.disabled}
            title={option.reason}
          >
            {option.name}
            {option.disabled ? ' — ' + COPY.notInResidueModel : ''}
          </option>
        ))}
      </select>

      <label className="field-label" htmlFor="county-road" style={{ marginTop: 12 }}>
        {COPY.labelRoad}
      </label>
      <select
        id="county-road"
        value={county.roadIdx ?? ''}
        onChange={(event) =>
          setRoadIdx(event.target.value === '' ? null : (Number(event.target.value) as RoadIdx))
        }
      >
        <option value="">{COPY.placeholderRoad}</option>
        {roads.map((road) => (
          <option key={road.idx} value={road.idx}>
            {road.label}
          </option>
        ))}
      </select>

      <div className="field-label" style={{ marginTop: 12 }} id="county-slope-label">
        {COPY.labelSlope}
      </div>
      <div className="segmented" role="group" aria-labelledby="county-slope-label">
        {COPY.slopeOptions.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={county.slopeIdx === index}
            onClick={() => setSlopeIdx(index as SlopeIdx)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="caption" style={{ marginTop: 6 }}>
        {COPY.slopeNote}
      </div>
      <div className="caption" style={{ marginTop: 6 }}>
        {COPY.accessibilityGloss}
      </div>

      <hr className="rule" />

      {result ? (
        <CountyResult result={result} />
      ) : (
        <EmptyState>{excluded ? COPY.countyNotModelled : COPY.countyEmpty}</EmptyState>
      )}
    </div>
  );
}
