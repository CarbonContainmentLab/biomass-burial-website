/**
 * One row of the layer panel: a checkbox, a swatch that shows what the layer
 * looks like, and its name.
 *
 * The swatch matters more than it looks. Without it the row is a word, and "Burial
 * depth" and "Wildfire hazard potential" are both plausible names for the navy
 * raster; with it, the legend for every layer is in the control that toggles it.
 *
 * A failed optional asset disables the row and says so, rather than leaving a
 * checkbox that does nothing (03 §8.1).
 */

import type { ReactNode } from 'react';

import { COPY } from '../lib/copy';
import { useStore } from '../state/store';
import type { LayerId } from '../state/types';

interface Props {
  id: LayerId;
  swatch: 'depth' | 'biomass' | 'whp' | 'thinning' | 'beccs';
  label: string;
  /** Sub-controls and legends, rendered under the row while the layer is on. */
  children?: ReactNode;
}

export function LayerRow({ id, swatch, label, children }: Props) {
  const on = useStore((s) => s.layers[id]);
  const failed = useStore((s) => s.data.failed.has(assetFor(id)));
  const toggleLayer = useStore((s) => s.toggleLayer);

  return (
    <>
      <label className="layer-row" data-disabled={failed}>
        <input
          type="checkbox"
          checked={on && !failed}
          disabled={failed}
          onChange={() => toggleLayer(id)}
        />
        <span className="layer-swatch" data-kind={swatch} aria-hidden="true">
          {swatch === 'beccs' && <span className="layer-diamond" />}
        </span>
        <span>{label}</span>
      </label>
      {failed && <div className="layer-note caption">{COPY.layerFailed[id]}</div>}
      {on && !failed && children}
    </>
  );
}

/**
 * Which asset has to be present for a layer to work. Depth and WHP are rasters,
 * biomass is its own GeoJSON; the mapping is one-to-one but not by name, so it is
 * written out rather than inferred.
 */
function assetFor(id: LayerId) {
  switch (id) {
    case 'depth':
      return 'depth' as const;
    case 'whp':
      return 'whp' as const;
    case 'thinning':
      return 'thinning' as const;
    case 'biomass':
      return 'countiesBiomass' as const;
    case 'beccs':
      return 'beccs' as const;
  }
}
