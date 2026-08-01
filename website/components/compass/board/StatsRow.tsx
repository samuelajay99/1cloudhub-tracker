'use client';

// Board's stats/summary strip — ported from renderBoard()'s
// `#statsRow.innerHTML` block. Always computed over non-deleted ("active")
// tasks regardless of the current filter/trash view, matching vanilla
// (`activeTasks`, not `displayTasks`) — see BoardTab.tsx.
export default function StatsRow({
  total,
  open,
  done,
  overdue,
  pct,
}: {
  total: number;
  open: number;
  done: number;
  overdue: number;
  pct: number;
}) {
  return (
    <div className="ch-stats-row">
      <div className="ch-stat-card">
        <div className="ch-stat-card-num">{total}</div>
        <div className="ch-stat-card-label">Total</div>
      </div>
      <div className="ch-stat-card">
        <div className="ch-stat-card-num">{open}</div>
        <div className="ch-stat-card-label">Open</div>
      </div>
      <div className="ch-stat-card">
        <div className="ch-stat-card-num">{done}</div>
        <div className="ch-stat-card-label">Done</div>
      </div>
      <div className="ch-stat-card overdue">
        <div className="ch-stat-card-num">{overdue}</div>
        <div className="ch-stat-card-label">Overdue</div>
      </div>
      <div className="ch-stat-card progress">
        <div className="ch-stat-card-label">Completion</div>
        <div className="ch-stat-card-num sm">{pct}%</div>
        <div className="ch-bar-bg">
          <div className="ch-bar-fill" style={{ width: pct + '%' }} />
        </div>
      </div>
    </div>
  );
}
