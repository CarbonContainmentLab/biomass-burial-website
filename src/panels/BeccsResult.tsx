/**
 * The optional BECCS comparison card.
 *
 * `none-in-range` is a **result**, not an error, and is styled as information.
 * Several counties in Idaho, Montana and Utah have no facility in range at the
 * 25% scenario — the manifest counts 14, 13 and 13 of them — and rendering that as
 * a failure would misrepresent a finding of the underlying work (03 §12).
 */

import { COPY } from '../lib/copy';
import { fmtLatLng, fmtMetersAsMiles, fmtPercent } from '../lib/format';
import type { BeccsHit, RadiusMi, ScenarioPct } from '../state/types';

interface Props {
  hit: BeccsHit | 'none-in-range';
  scenario: ScenarioPct;
  radiusMi: RadiusMi;
}

export function BeccsResult({ hit, scenario, radiusMi }: Props) {
  return (
    <div
      className="card"
      data-accent="pine"
      style={{ boxShadow: 'none', marginTop: 10 }}
      aria-live="polite"
    >
      <div className="card-body">
        <div className="result-head">
          <span className="result-title">{COPY.beccsResultHeading}</span>
          <span className="result-pill" data-tone="muted">
            {COPY.beccsScenarioEyebrow(scenario)}
          </span>
        </div>

        {hit === 'none-in-range' ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            {COPY.beccsNoneInRange(radiusMi, scenario)}
          </p>
        ) : (
          <dl className="defs">
            <dt>{COPY.straightLineDistance}</dt>
            <dd>{fmtMetersAsMiles(hit.distanceM)}</dd>

            <dt>{COPY.coordinates}</dt>
            <dd data-weight="regular">{fmtLatLng(hit.point.lat, hit.point.lng)}</dd>

            <dt>{COPY.beccsPlantType}</dt>
            <dd data-weight="regular">{hit.plantType}</dd>

            <dt>{COPY.beccsForestryShare}</dt>
            <dd>{fmtPercent(hit.forestryFraction)}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}
