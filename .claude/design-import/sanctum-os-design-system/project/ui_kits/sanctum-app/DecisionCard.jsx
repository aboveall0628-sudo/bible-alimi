// DecisionCard.jsx — single decision row with drag handle, inline edit, slot badge.

export function DecisionCard({ id, text, slotLabel, placed, onChange, onDelete }) {
  return (
    <div className={'decision-card' + (placed ? ' placed' : '')}>
      <span className="handle" aria-label="드래그 핸들">⋮⋮</span>
      <input
        className="decision-text"
        value={text}
        placeholder="결단 한 줄을 적어 보세요"
        onChange={e => onChange?.(id, e.target.value)}
      />
      <span className="decision-slot">{slotLabel || '미배치'}</span>
      <button className="decision-action" title="지우기" onClick={() => onDelete?.(id)}>✕</button>
    </div>
  );
}
