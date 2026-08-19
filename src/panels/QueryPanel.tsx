/**
 * The floating right panel: tabs plus whichever mode is active.
 */

import { COPY } from '../lib/copy';
import { useStore } from '../state/store';
import { CountyLookup } from './CountyLookup';
import { QueryTabs } from './QueryTabs';
import { SiteSearch } from './SiteSearch';

export function QueryPanel() {
  const open = useStore((s) => s.ui.rightOpen);
  const mode = useStore((s) => s.mode);

  return (
    <aside
      className="rail-right"
      data-open={open}
      aria-label={mode === 'county' ? COPY.tabCounty : COPY.tabSite}
      aria-hidden={!open}
    >
      <QueryTabs />
      <div className="query-body" id="query-body" role="tabpanel">
        {mode === 'county' ? <CountyLookup /> : <SiteSearch />}
      </div>
    </aside>
  );
}
