/**
 * A four-step guided tour of the chrome, opened from the `?` in the header.
 *
 * ## Why it points rather than explains
 *
 * Everything it names is already on screen and already labelled. A tour that
 * restates labels is noise, so each step says what a region is *for* — the one
 * thing the interface cannot say about itself.
 *
 * ## Why it never opens on its own
 *
 * Only the button opens it. Auto-opening on a first visit would need somewhere
 * to record that the visit happened, and this tool deliberately keeps no
 * browser storage — the URL is its entire memory (03 §7). It would also fire
 * inside the embed on the lab's site, where a modal nobody asked for is worse
 * than an undiscovered one.
 *
 * ## What it touches, and what it leaves alone
 *
 * Opening the tour switches the depth layer on (see `Header`), because that
 * step's card only exists while the layer does. That is the one piece of state
 * it sets, and it sets it before starting rather than part-way through, so the
 * visitor sees it happen rather than finding it changed later.
 *
 * Nothing else is driven. It will not switch tabs or expand a collapsed rail to
 * reach a target — a step whose target is missing is skipped, because a tour
 * that rearranges the app to suit itself leaves the visitor somewhere they did
 * not ask to be.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { COPY } from '../lib/copy';
import { reducedMotion } from '../map/viewState';
import { useStore } from '../state/store';

/** Where each step points. `null` means "the map", which has no element. */
const TARGETS: (string | null)[] = [
  '[data-tour="layers"]',
  '[data-tour="depth"]',
  null,
  '[data-tour="query"]',
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Breathing room between the cut-out and the thing it frames. */
const PAD = 8;
const GAP = 14;
const CAPTION_W = 268;

/**
 * The map has no element of its own — it is the full stage, with the rails
 * floating over it — so cutting out the canvas would dim only the rails and
 * read as nothing happening. The honest target is the gap *between* the rails,
 * which is the part of the map the visitor can actually see.
 */
function mapRect(): Rect | null {
  const stage = document.querySelector('.map-stage');
  if (!stage) return null;
  const s = stage.getBoundingClientRect();
  const left = document.querySelector('.rail-left')?.getBoundingClientRect();
  const right = document.querySelector('.rail-right')?.getBoundingClientRect();
  const x1 = left && left.right > s.left ? left.right + GAP : s.left + GAP;
  const x2 = right && right.left < s.right ? right.left - GAP : s.right - GAP;
  if (x2 - x1 < 120) return null;
  return { top: s.top + GAP, left: x1, width: x2 - x1, height: s.height - GAP * 2 };
}

function targetRect(step: number): Rect | null {
  const selector = TARGETS[step];
  if (selector === null) return mapRect();
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

/** Beside the target on whichever side has room, clamped into the viewport. */
function captionPosition(rect: Rect): { top: number; left: number } {
  const roomRight = window.innerWidth - (rect.left + rect.width);
  const left =
    roomRight > CAPTION_W + GAP * 2
      ? rect.left + rect.width + GAP
      : Math.max(GAP, rect.left - CAPTION_W - GAP);
  const top = Math.min(
    Math.max(GAP, rect.top),
    Math.max(GAP, window.innerHeight - 200),
  );
  return { top, left };
}

export function Tour() {
  const open = useStore((s) => s.ui.tourOpen);
  const setTourOpen = useStore((s) => s.setTourOpen);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const steps = COPY.tourSteps;
  const close = useCallback(() => {
    setTourOpen(false);
    setStep(0);
  }, [setTourOpen]);

  /* Measure after paint, and again whenever the window changes shape. A step
     whose target is not on screen — a collapsed rail — is skipped rather than
     pointed at, which is why this advances rather than rendering nothing. */
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const next = targetRect(step);
      if (next) setRect(next);
      else if (step < steps.length - 1) setStep((n) => n + 1);
      else close();
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, step, steps.length, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowRight') setStep((n) => Math.min(n + 1, steps.length - 1));
      else if (event.key === 'ArrowLeft') setStep((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, steps.length]);

  if (!open || !rect) return null;

  const current = steps[step];
  if (!current) return null;
  const last = step === steps.length - 1;
  const caption = captionPosition(rect);

  return (
    <div className="tour" data-still={reducedMotion() ? 'true' : undefined}>
      {/* Catches the click that dismisses. The cut-out below cannot: its dim is
          a box-shadow, which is painted outside the element and takes no
          pointer events. */}
      <div className="tour-catch" onClick={close} />

      <div
        className="tour-cutout"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />

      <div
        className="tour-caption"
        style={{ top: caption.top, left: caption.left, width: CAPTION_W }}
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
      >
        <div className="eyebrow">{COPY.tourStepOf(step + 1, steps.length)}</div>
        <h2 className="tour-title">{current.title}</h2>
        <p className="tour-body">{current.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={close}>
            {COPY.tourClose}
          </button>
          <div className="tour-nav">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)}>
                {COPY.tourBack}
              </button>
            )}
            <button
              type="button"
              className="tour-advance"
              autoFocus
              onClick={() => (last ? close() : setStep(step + 1))}
            >
              {last ? COPY.tourDone : COPY.tourNext}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
