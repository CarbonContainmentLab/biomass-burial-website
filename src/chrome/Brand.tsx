import { assetUrl } from '../data/paths';
import { COPY } from '../lib/copy';

/** The lab's site. The logo is the only thing on this page that leaves it. */
const LAB_HOME = 'https://carboncontainmentlab.org/';

/**
 * The brand lockup: the lab's stacked logo, a hairline divider, and the page
 * title.
 *
 * `03 §21` assumption 5 says text only, "no logo image and no fingerprint
 * motif". The logo replaced the wordmark at Jack's request; the fingerprint
 * motif is still not here, which is the part of that assumption that was really
 * about a full-bleed map having no spare corner.
 *
 * Only the logo is a link, not the whole lockup — the `h1` is the page's own
 * title and should not navigate away from it. It opens in a new tab because
 * this tool keeps its session in memory: leaving the page discards the decoded
 * rasters and the site index, and makes the user pay for them again on the way
 * back.
 */
export function Brand() {
  return (
    <div className="brand">
      <a
        className="brand-home"
        href={LAB_HOME}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img className="brand-logo" src={assetUrl('logo_stacked.svg')} alt={COPY.brandOrg} />
      </a>
      <span className="brand-divider" aria-hidden="true" />
      <h1 className="brand-title">
        {COPY.brandTitle} <span className="brand-version">{COPY.brandVersion}</span>
      </h1>
    </div>
  );
}
