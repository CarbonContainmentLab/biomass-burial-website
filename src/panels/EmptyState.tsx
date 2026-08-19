/**
 * The one place the serif face appears (03 §5).
 *
 * Empty states direct rather than apologise: every string that lands here tells
 * the reader what to do next, and none of them says "no results".
 */

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
