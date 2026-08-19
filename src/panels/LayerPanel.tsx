/**
 * Five rows, in the mockup's order. Terrain has no row: it is always on
 * (03 §21.1), which keeps this list identical to the mockup's.
 *
 * Sub-controls appear only while their layer is on. A metric switcher for a layer
 * you cannot see is a control with no feedback.
 */

import { beccsScenarios, whpClassLabels } from '../data/manifest';
import { peekManifest } from '../data/source';
import { COPY } from '../lib/copy';
import { rgbCss, WHP_CLASS_COLORS } from '../map/palette';
import { useStore } from '../state/store';
import type { BiomassMetric, ScenarioPct } from '../state/types';
import { LayerRow } from './LayerRow';

const FALLBACK_SCENARIOS: ScenarioPct[] = [25, 50, 75, 90, 99];
const FALLBACK_WHP_LABELS = ['Very low', 'Low', 'Moderate', 'High', 'Very high'];

export function LayerPanel() {
  const leftOpen = useStore((s) => s.ui.leftOpen);
  const setLeftOpen = useStore((s) => s.setLeftOpen);
  const biomassMetric = useStore((s) => s.biomassMetric);
  const setBiomassMetric = useStore((s) => s.setBiomassMetric);
  const beccsScenario = useStore((s) => s.beccsScenario);
  const setBeccsScenario = useStore((s) => s.setBeccsScenario);
  // The manifest is the source for the scenario list and the hazard labels, so a
  // pipeline that adds a scenario changes this panel without a code edit (03 §8.2).
  const loaded = useStore((s) => s.data.loaded);
  const manifest = loaded.has('manifest') ? peekManifest() : null;

  const scenarios = (manifest ? (beccsScenarios(manifest) as ScenarioPct[]) : FALLBACK_SCENARIOS);
  const hazardLabels = manifest ? whpClassLabels(manifest) : FALLBACK_WHP_LABELS;

  return (
    <section className="card">
      <div className="card-head">
        <span className="eyebrow">{COPY.layersHeading}</span>
        <button
          type="button"
          className="collapse-btn"
          title={COPY.collapseLayersPanel}
          aria-label={COPY.collapseLayersPanel}
          aria-expanded={leftOpen}
          onClick={() => setLeftOpen(false)}
        >
          &#8249;
        </button>
      </div>

      <LayerRow id="depth" swatch="depth" label={COPY.layerNames.depth} />

      <LayerRow id="biomass" swatch="biomass" label={COPY.layerNames.biomass}>
        <div className="layer-subcontrol">
          <label className="field-label" htmlFor="biomass-metric">
            {COPY.biomassMetricLabel}
          </label>
          <select
            id="biomass-metric"
            value={biomassMetric}
            onChange={(event) => setBiomassMetric(event.target.value as BiomassMetric)}
          >
            <option value="acres">{COPY.biomassMetricOptions.acres}</option>
            <option value="bdmt">{COPY.biomassMetricOptions.bdmt}</option>
          </select>
          {biomassMetric === 'bdmt' && (
            <div className="caption" style={{ marginTop: 6 }}>
              {COPY.bdmtGloss}
            </div>
          )}
        </div>
      </LayerRow>

      <LayerRow id="whp" swatch="whp" label={COPY.layerNames.whp}>
        <div className="whp-legend" role="group" aria-label={COPY.whpLegendHeading}>
          {WHP_CLASS_COLORS.map((rgb, index) => (
            <div key={index} style={{ display: 'contents' }}>
              <i style={{ background: rgbCss(rgb) }} aria-hidden="true" />
              <span>{hazardLabels[index] ?? FALLBACK_WHP_LABELS[index]}</span>
            </div>
          ))}
        </div>
      </LayerRow>

      <LayerRow id="thinning" swatch="thinning" label={COPY.layerNames.thinning}>
        <div className="layer-note caption">{COPY.thinningNote}</div>
      </LayerRow>

      <LayerRow id="beccs" swatch="beccs" label={COPY.layerNames.beccs}>
        <div className="layer-subcontrol">
          <label className="field-label" htmlFor="beccs-scenario">
            {COPY.beccsScenarioLabel}
          </label>
          <select
            id="beccs-scenario"
            value={beccsScenario}
            onChange={(event) => setBeccsScenario(Number(event.target.value) as ScenarioPct)}
          >
            {scenarios.map((pct) => (
              <option key={pct} value={pct}>
                {COPY.beccsScenarioOption(pct)}
              </option>
            ))}
          </select>
          <div className="caption" style={{ marginTop: 6 }}>
            {COPY.beccsGloss}
          </div>
        </div>
      </LayerRow>
    </section>
  );
}
