/**
 * The inspect card for the hovered county (03 §0, kept from the mockup).
 *
 * It shows what the county *holds*, not what the current accessibility class
 * holds: hovering has not chosen a class, so the whole-county totals are the only
 * figures that are true. The class-specific numbers are the query panel's job.
 *
 * Mounted only while something is hovered, so it does not reserve space in the
 * rail when it is empty.
 */

import { peekCountyStats } from '../data/source';
import { countyRecord, type CountyStatsFile } from '../data/countyStats';
import { COPY } from '../lib/copy';
import { stateName } from '../lib/fips';
import { fmtAcres, fmtMeters, fmtPercent, fmtTonnes } from '../lib/format';
import { meters } from '../lib/units';
import { selectHoverGeoid } from '../state/selectors';
import { useStore } from '../state/store';

export function CountyHoverCard() {
  const geoid = useStore(selectHoverGeoid);
  const loaded = useStore((s) => s.data.loaded);

  if (!geoid || !loaded.has('countyStats')) return null;

  const file = peekCountyStats<CountyStatsFile>();
  if (!file) return null;

  const record = countyRecord(file, geoid);
  if (!record) return null;

  const biomass = record.biomass;

  return (
    <section className="card" data-accent="gold">
      <div className="card-body">
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>
          {record.name} County
        </div>
        <div className="caption" style={{ marginBottom: 10 }}>
          {stateName(record.state)}
        </div>

        <dl className="defs">
          <dt>{COPY.countyHoverDepth}</dt>
          <dd>{record.depth ? fmtMeters(meters(record.depth.median)) : '—'}</dd>

          <dt>{COPY.countyHoverAcres}</dt>
          <dd>{biomass ? fmtAcres(biomass.total_acres) : '—'}</dd>

          <dt>{COPY.countyHoverBdmt}</dt>
          <dd>{biomass ? fmtTonnes(biomass.total_bdmt) : '—'}</dd>

          <dt>{COPY.countyHoverWhp}</dt>
          <dd>{biomass ? fmtPercent(biomass.wildfire_hazard_potential) : '—'}</dd>
        </dl>

        {!record.has_biomass && (
          <div className="caption" style={{ marginTop: 10 }}>
            {COPY.countyNotModelled}
          </div>
        )}
      </div>
    </section>
  );
}
