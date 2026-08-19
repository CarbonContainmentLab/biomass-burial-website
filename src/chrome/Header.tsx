import { Brand } from './Brand';

/**
 * The header is the brand lockup and nothing else.
 *
 * The mockup and `03 §0`/`§13` both specify a place-search typeahead on the
 * right. It was built and then removed at Jack's request (04_BUILD_PLAN §5.4):
 * map-click is the gesture that answers a question about a place, and a second
 * way to move the camera was not earning its keep.
 */
export function Header() {
  return (
    <header className="header">
      <Brand />
    </header>
  );
}
