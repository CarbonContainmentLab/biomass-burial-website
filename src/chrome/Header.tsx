import { COPY } from '../lib/copy';
import { useStore } from '../state/store';
import { Brand } from './Brand';

/**
 * The paper this tool visualises. Opened in a new tab for the same reason the
 * logo is: the session holds decoded rasters and an 8.7 MB site index in
 * memory, and navigating away throws them out and makes the reader pay for
 * them again coming back.
 */
const PAPER = 'https://www.science.org/doi/10.1126/sciadv.aee6185';

/**
 * The header is the brand lockup on the left, and on the right the citation
 * followed by a way into the tour.
 *
 * The mockup and `03 §0`/`§13` both specify a place-search typeahead on the
 * right. It was built and then removed at Jack's request (04_BUILD_PLAN §5.4):
 * map-click is the gesture that answers a question about a place, and a second
 * way to move the camera was not earning its keep. What sits there now is help
 * and provenance, which is a better use of the most prominent corner of a tool
 * that exists to make one paper explorable.
 */
export function Header() {
  const setTourOpen = useStore((s) => s.setTourOpen);
  const setLayer = useStore((s) => s.setLayer);

  /**
   * Turning the depth layer on is part of opening the tour, not a side effect
   * of it. Its card only exists while the layer is on, so a visitor who had
   * switched it off would be walked past a step that had nothing to point at.
   * Better to show them the thing than to skip it and leave the tour shorter
   * for the people who most need it.
   */
  const openTour = () => {
    setLayer('depth', true);
    setTourOpen(true);
  };

  return (
    <header className="header">
      <Brand />
      <a
        className="header-link"
        href={PAPER}
        target="_blank"
        rel="noopener noreferrer"
      >
        {COPY.paperLink}
      </a>
      <button type="button" className="header-help" onClick={openTour}>
        {COPY.tourOpen}
      </button>
    </header>
  );
}
