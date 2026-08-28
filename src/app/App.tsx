/**
 * Composition of chrome and stage, and nothing else — no fetching, no WebGL, no
 * query maths (03 §20).
 *
 * The map is never inset. The header is a flex row above it; both rails float
 * over it and translate off-screen when collapsed, so collapsing a panel never
 * asks the WebGL canvas to reflow.
 */

import { useEffect } from 'react';

import { Header } from '../chrome/Header';
import { Tour } from '../chrome/Tour';
import { resetFailedAssets } from '../data/source';
import { COPY } from '../lib/copy';
import { MapView } from '../map/MapView';
import { LeftRail } from '../panels/LeftRail';
import { QueryPanel } from '../panels/QueryPanel';
import { useStore } from '../state/store';
import { loadBlockingAssets } from './boot';
import { DesktopGate } from './DesktopGate';

export function App() {
  return (
    <DesktopGate>
      <Stage />
    </DesktopGate>
  );
}

function Stage() {
  const leftOpen = useStore((s) => s.ui.leftOpen);
  const rightOpen = useStore((s) => s.ui.rightOpen);
  const setLeftOpen = useStore((s) => s.setLeftOpen);
  const setRightOpen = useStore((s) => s.setRightOpen);

  useEffect(() => {
    void loadBlockingAssets();
  }, []);

  return (
    <div className="app-shell">
      <Header />
      <div className="map-stage">
        <MapView />

        {!leftOpen && (
          <button
            type="button"
            className="edge-toggle"
            data-side="left"
            title={COPY.showLayersPanel}
            aria-label={COPY.showLayersPanel}
            onClick={() => setLeftOpen(true)}
          >
            &#8250;
          </button>
        )}
        {!rightOpen && (
          <button
            type="button"
            className="edge-toggle"
            data-side="right"
            title={COPY.showQueryPanel}
            aria-label={COPY.showQueryPanel}
            onClick={() => setRightOpen(true)}
          >
            &#8249;
          </button>
        )}

        <LeftRail />
        <QueryPanel />

        <StatusCards />
      </div>
      <Tour />
    </div>
  );
}

/**
 * Loading and failure, centred over the map.
 *
 * Only a failed *manifest* gets a blocking card. Everything else degrades where
 * it is used: a layer that could not load disables its own row, and county
 * outlines failing must not stop depth and terrain from drawing (03 §8.1).
 */
function StatusCards() {
  const blockingReady = useStore((s) => s.data.blockingReady);
  const manifestFailed = useStore((s) => s.data.failed.has('manifest'));

  if (manifestFailed) {
    return (
      <div className="status-card" data-accent="error" role="alert">
        <strong>{COPY.blockingErrorTitle}</strong>
        <div>{COPY.blockingErrorBody}</div>
        <button
          type="button"
          onClick={() => {
            resetFailedAssets();
            void loadBlockingAssets();
          }}
        >
          {COPY.retry}
        </button>
      </div>
    );
  }

  if (!blockingReady) {
    return (
      <div className="status-card" role="status">
        {COPY.loading}
      </div>
    );
  }

  return null;
}
