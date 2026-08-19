import { useEffect, useState, type ReactNode } from 'react';

import { COPY } from '../lib/copy';

const NARROW = '(max-width: 1023px)';

/**
 * Desktop only in v1 (03 §15). Below 1024 px this renders a message and
 * nothing else — children are not mounted at all, so no WebGL context is left
 * alive on a phone. Crossing 1024 px upward mounts the app.
 */
export function DesktopGate({ children }: { children: ReactNode }) {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);

  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (narrow) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="eyebrow">{COPY.brandOrg}</div>
          <p>{COPY.gate}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
