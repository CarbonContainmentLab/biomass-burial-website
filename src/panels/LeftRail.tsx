/**
 * The floating left rail: layers, the soil column, and the hover card.
 *
 * Order is the mockup's. The depth bar sits under the layer list because it
 * belongs to the depth row above it — and it mounts with that row, since a
 * control for a layer that is switched off has nothing to control. The hover
 * card comes last because it appears and disappears; putting it higher would
 * shove the cards above it around every time the pointer crossed a county line.
 */

import { COPY } from '../lib/copy';
import { useStore } from '../state/store';
import { CountyHoverCard } from './CountyHoverCard';
import { LayerPanel } from './LayerPanel';
import { SoilColumn } from './SoilColumn';

export function LeftRail() {
  const open = useStore((s) => s.ui.leftOpen);
  const depthOn = useStore((s) => s.layers.depth);
  const countiesFailed = useStore((s) => s.data.failed.has('counties'));

  return (
    <aside
      className="rail-left"
      data-open={open}
      aria-label={COPY.layersHeading}
      aria-hidden={!open}
    >
      <LayerPanel />
      {depthOn && <SoilColumn />}
      {countiesFailed && (
        <div className="card" data-accent="error">
          <div className="card-body caption">{COPY.countiesFailedNote}</div>
        </div>
      )}
      <CountyHoverCard />
    </aside>
  );
}
