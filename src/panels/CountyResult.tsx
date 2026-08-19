/**
 * The Mode 1 result card.
 *
 * Three deliberate choices, all of them corrections to the mockup:
 *
 *   - **Median, not average.** The mockup's second tile said "Avg". The depth
 *     distribution is heavily skewed — the shipped surface has a mean of 18 m
 *     against a median of 4.3 m — so a mean would mislead in exactly the direction
 *     that matters (03 §11).
 *   - **Both money figures.** Forestry treatment is class-constant; burial
 *     pathway net income varies by county because it includes haulage. Showing
 *     one and calling it "average cost", as the mockup did, hides the pathway the
 *     tool is about (03 §8.3).
 *   - **The depth caption is not optional.** Depth is county-wide while the
 *     biomass figures are class-specific, and being quiet about that would be the
 *     most misleading thing this panel could do.
 */

import { COPY, depthScopeCaption } from '../lib/copy';
import { fmtAcres, fmtMetersBare, fmtTonnes, fmtUsdPerTco2e } from '../lib/format';
import { featureBbox } from '../lib/pointInPolygon';
import { peekCounties } from '../data/source';
import type { CountyLookup } from '../data/countyStats';
import { COUNTY_ZOOM, fitToBounds } from '../map/viewState';

export function CountyResult({ result }: { result: CountyLookup }) {
  const zoomToCounty = () => {
    const counties = peekCounties();
    const feature = counties?.features.find((f) => f.properties.GEOID === result.geoid);
    if (feature) fitToBounds(featureBbox(feature), { pad: 0.15, maxZoom: COUNTY_ZOOM });
  };

  return (
    <div aria-live="polite">
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {COPY.resultsHeading}
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="stat-tile-label">{COPY.minDepth}</div>
          <div className="stat-tile-value">
            {result.depthMin === null ? '—' : fmtMetersBare(result.depthMin)}
            <span className="stat-tile-unit"> m</span>
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">{COPY.medianDepth}</div>
          <div className="stat-tile-value">
            {result.depthMedian === null ? '—' : fmtMetersBare(result.depthMedian)}
            <span className="stat-tile-unit"> m</span>
          </div>
        </div>
      </div>

      <dl className="defs defs-boxed">
        <dt>{COPY.biomassAvailable}</dt>
        <dd>{fmtAcres(result.acres)}</dd>

        <dt>{COPY.estimatedDryTons}</dt>
        <dd>{fmtTonnes(result.bdmt)}</dd>

        <dt>{COPY.forestryTreatment}</dt>
        <dd>{fmtUsdPerTco2e(result.costUsdPerTco2e)}</dd>

        <dt>{COPY.burialNetIncome}</dt>
        <dd>{fmtUsdPerTco2e(result.netIncomeUsdPerTco2e)}</dd>

        <dt>{COPY.accessibilityClass}</dt>
        <dd data-weight="regular">{result.classLabel}</dd>
      </dl>

      <div className="caption" style={{ marginTop: 8 }}>
        {COPY.tco2eGloss}
      </div>

      {result.depthMin === null ? (
        <div className="caption" style={{ marginTop: 8 }}>
          {COPY.countyDepthUnavailable}
        </div>
      ) : (
        <div className="caption" style={{ marginTop: 8 }}>
          {depthScopeCaption(result.depthScope)}
        </div>
      )}

      <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={zoomToCounty}>
        {COPY.zoomToCounty}
      </button>
    </div>
  );
}
