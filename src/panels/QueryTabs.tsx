/**
 * Two tabs, one visible at a time, with the inactive tab's state preserved — the
 * spec asks for the query modes to be separate panels so a user is never unsure
 * which one they are in.
 *
 * State preservation is free here because both panels read the store, so
 * unmounting one does not lose its selections.
 */

import { COPY } from '../lib/copy';
import { useStore } from '../state/store';
import type { Mode } from '../state/types';

export function QueryTabs() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const rightOpen = useStore((s) => s.ui.rightOpen);
  const setRightOpen = useStore((s) => s.setRightOpen);

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      className="query-tab"
      role="tab"
      aria-selected={mode === value}
      aria-controls="query-body"
      onClick={() => setMode(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="query-tabs" role="tablist">
      <button
        type="button"
        className="collapse-btn"
        title={COPY.collapseQueryPanel}
        aria-label={COPY.collapseQueryPanel}
        aria-expanded={rightOpen}
        onClick={() => setRightOpen(false)}
      >
        &#8250;
      </button>
      {tab('county', COPY.tabCounty)}
      {tab('site', COPY.tabSite)}
    </div>
  );
}
