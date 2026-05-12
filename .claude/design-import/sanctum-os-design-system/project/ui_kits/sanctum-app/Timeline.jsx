// Timeline.jsx — 24h × 96 slots × 16px grid. 3 columns: axis / plan / actual.
// 1 slot = 15min. Hour rows have solid border, half-hour dashed, quarter dotted.

export function Timeline({ slots = [], nowSlot }) {
  const rows = Array.from({ length: 96 }, (_, i) => i);
  const tickClass = (m) => m === 0 ? '' : (m === 30 ? ' half' : ' minor');
  const cellClass = (m) => 'tl-cell' + (m === 0 ? ' hour-mark' : (m === 30 ? ' half-mark' : ''));

  return (
    <div className="timeline">
      <div className="tl-header">
        <span>시간</span><span>계획 (결단 · 캘린더)</span><span>실제 (지난 일)</span>
      </div>
      <div className="tl-body">
        <div className="tl-col" style={{ background: 'var(--surface-elevated)' }}>
          {rows.map(i => {
            const h = Math.floor(i / 4), m = (i % 4) * 15;
            return (
              <div key={i} className={'tl-tick' + tickClass(m)}>
                {m === 0 ? String(h).padStart(2, '0') : m === 30 ? ':30' : ''}
              </div>
            );
          })}
        </div>
        <Column kind="plan" rows={rows} cellClass={cellClass} slots={slots.filter(s => s.lane === 'plan')} nowSlot={nowSlot} />
        <Column kind="actual" rows={rows} cellClass={cellClass} slots={slots.filter(s => s.lane === 'actual')} nowSlot={nowSlot} />
      </div>
    </div>
  );
}

function Column({ kind, rows, cellClass, slots, nowSlot }) {
  return (
    <div className={'tl-col ' + kind} style={{ position: 'relative' }}>
      {rows.map(i => {
        const m = (i % 4) * 15;
        return <div key={i} className={cellClass(m)} />;
      })}
      {slots.map(s => (
        <div
          key={s.id}
          className={'tl-slot ' + (s.dot ? 'dot-' + s.dot : '') + (s.source === 'gcal' ? ' gcal' : '')}
          style={{ top: s.startSlot * 16, height: s.lenSlot * 16 - 2 }}
          onClick={s.onClick}
        >
          <span className="slot-time">{s.time}</span>
          <span className="slot-title">{s.title}</span>
        </div>
      ))}
      {nowSlot != null && <div className="tl-now" style={{ top: nowSlot * 16 }} />}
    </div>
  );
}
