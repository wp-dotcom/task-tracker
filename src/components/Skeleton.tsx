/** Lightweight shimmering placeholders shown while data is loading, instead of bare "Loading..." text. */

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="task-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-bar skeleton-bar-title" />
          <div className="skeleton-bar skeleton-bar-badge" />
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="task-calendar" aria-hidden="true">
      <div className="skeleton-bar skeleton-bar-toolbar" />
      <div className="skeleton-calendar-grid">
        {Array.from({ length: 28 }).map((_, i) => (
          <div key={i} className="skeleton-cell" />
        ))}
      </div>
    </div>
  );
}
