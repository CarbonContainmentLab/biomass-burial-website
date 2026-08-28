/**
 * The depth bar: the legend *is* the max-depth control (03 §5).
 *
 * `03 §5` specifies this as a 48 × 220 px vertical strip with shallow at the top,
 * so that it looks like a soil column. It ships horizontal instead — 0 m at the
 * left, 10 m at the right — at Jack's request (04_BUILD_PLAN §5.5). The column
 * metaphor is lost; what is gained is roughly 170 px of left-rail height, since a
 * 220 px strip forced its tick labels and readout into a tall column of mostly
 * empty card.
 *
 * A vertical cut line at the threshold, draggable; everything to its right,
 * meaning deeper than the threshold, is dimmed rather than recoloured, so the
 * ramp still reads as one continuous scale.
 *
 * The mockup's separate range input is gone. Shipping both would be shipping two
 * controls for one value.
 *
 * Dragging writes `maxDepth`, which becomes one shader uniform. No refetch, no
 * CPU recolour, 60 fps.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { COPY } from '../lib/copy';
import { fmtMeters } from '../lib/format';
import { meters } from '../lib/units';
import { selectMaxDepth } from '../state/selectors';
import { useStore } from '../state/store';
import { MAX_DEPTH_MAX, MAX_DEPTH_MIN, MAX_DEPTH_STEP } from '../state/types';

const TICKS = [0, 2.5, 5, 7.5, 10] as const;

const snap = (value: number): number => {
  const stepped = Math.round(value / MAX_DEPTH_STEP) * MAX_DEPTH_STEP;
  return Math.min(MAX_DEPTH_MAX, Math.max(MAX_DEPTH_MIN, Number(stepped.toFixed(2))));
};

export function SoilColumn() {
  const maxDepth = useStore(selectMaxDepth);
  const setMaxDepth = useStore((s) => s.setMaxDepth);
  const stripRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const value = maxDepth as number;
  const fraction = value / MAX_DEPTH_MAX;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const strip = stripRef.current;
      if (!strip) return;
      const rect = strip.getBoundingClientRect();
      const t = (clientX - rect.left) / rect.width;
      setMaxDepth(meters(snap(t * MAX_DEPTH_MAX)));
    },
    [setMaxDepth],
  );

  // Pointer events on window while dragging, so the gesture survives the cursor
  // leaving the 36 px-tall bar — which it will, because the bar is short.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      setFromClientX(event.clientX);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, setFromClientX]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = value + MAX_DEPTH_STEP;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = value - MAX_DEPTH_STEP;
        break;
      case 'Home':
        next = MAX_DEPTH_MIN;
        break;
      case 'End':
        next = MAX_DEPTH_MAX;
        break;
      case 'PageUp':
        next = value + MAX_DEPTH_STEP * 4;
        break;
      case 'PageDown':
        next = value - MAX_DEPTH_STEP * 4;
        break;
      default:
        return;
    }
    event.preventDefault();
    setMaxDepth(meters(snap(next)));
  };

  const label = fmtMeters(maxDepth);

  return (
    <section className="card" data-tour="depth">
      <div className="card-body">
        {/* Heading and readout share a line: on a horizontal bar the value has
            nowhere else to sit, and it is the row's most-read number. */}
        <div className="soil-head">
          <span className="eyebrow">{COPY.soilColumnHeading}</span>
          <span className="soil-readout">{label}</span>
        </div>

        <div
          ref={stripRef}
          className="soil-strip"
          role="slider"
          tabIndex={0}
          aria-label={COPY.soilColumnAria}
          aria-orientation="horizontal"
          aria-valuemin={MAX_DEPTH_MIN}
          aria-valuemax={MAX_DEPTH_MAX}
          aria-valuenow={value}
          aria-valuetext={label}
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            event.preventDefault();
            (event.target as HTMLElement).focus?.();
            setDragging(true);
            setFromClientX(event.clientX);
          }}
        >
          <div className="soil-excluded" style={{ width: `${(1 - fraction) * 100}%` }} />
          <div className="soil-cut" style={{ left: `calc(${fraction * 100}% - 1px)` }} />
          <div className="soil-handle" style={{ left: `${fraction * 100}%` }} />
        </div>

        {/* The end labels are pinned inside the bar's edges rather than centred
            on their tick, which would hang them off the card. */}
        <div className="soil-ticks" aria-hidden="true">
          {TICKS.map((tick, index) => (
            <span
              key={tick}
              data-edge={index === 0 ? 'start' : index === TICKS.length - 1 ? 'end' : undefined}
              style={{ left: `${(tick / MAX_DEPTH_MAX) * 100}%` }}
            >
              {tick === 0 ? '0 m' : tick === MAX_DEPTH_MAX ? '10 m' : tick}
            </span>
          ))}
        </div>

        <div className="caption" style={{ marginTop: 8 }}>
          {COPY.soilColumnCaption}
        </div>
        <div className="caption" style={{ marginTop: 4 }}>
          {COPY.soilColumnHelp}
        </div>

        {/* Announced on change, so the value is available without the bar. */}
        <div className="sr-only" role="status" aria-live="polite">
          {COPY.soilColumnAnnounce(label)}
        </div>
      </div>
    </section>
  );
}
