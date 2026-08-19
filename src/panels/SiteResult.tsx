/**
 * The Mode 2 result card.
 *
 * There is no "Network distance" row. The mockup had one, filled by multiplying
 * the straight-line figure by 1.28, and the spec does ask for road-network
 * distance where feasible — but a made-up multiplier is not a road network, and
 * labelling it as one would be the most misleading number the tool could show.
 * Every distance here says "Straight-line distance", which is also the string to
 * change when real routing lands (03 §12, §14).
 */

import { COPY } from '../lib/copy';
import { fmtCentimetersAsMeters, fmtLatLng, fmtMetersAsMiles } from '../lib/format';
import type { SiteHit } from '../state/types';

export function SiteResult({ site }: { site: SiteHit }) {
  return (
    <div className="card" data-accent="navy" style={{ boxShadow: 'none' }}>
      <div className="card-body">
        <div className="result-head">
          <span className="result-title">{COPY.siteResultHeading}</span>
          <span className="result-pill">{COPY.siteFeasible}</span>
        </div>

        <dl className="defs">
          <dt>{COPY.requiredCover}</dt>
          <dd>{fmtCentimetersAsMeters(site.depthCm)}</dd>

          <dt>{COPY.straightLineDistance}</dt>
          <dd>{fmtMetersAsMiles(site.distanceM)}</dd>

          <dt>{COPY.coordinates}</dt>
          <dd data-weight="regular">{fmtLatLng(site.point.lat, site.point.lng)}</dd>

          <dt>{COPY.county}</dt>
          <dd data-weight="regular">{site.countyLabel ?? '—'}</dd>
        </dl>
      </div>
    </div>
  );
}
