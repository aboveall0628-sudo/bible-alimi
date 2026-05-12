// QuickReviewModal.jsx — 3초 룰 평가. 4 큰 버튼 + 만족도 슬라이더 + 단축키 1~9 / Enter / Esc.

import { useEffect, useState } from 'react';

const STATUSES = [
  { key: '1', emoji: '😀', label: '잘 했어요',    dot: 'green' },
  { key: '2', emoji: '🙂', label: '조금 했어요',   dot: 'yellow' },
  { key: '3', emoji: '🔄', label: '다른 걸 했어요', dot: 'orange' },
  { key: '4', emoji: '😣', label: '못 했어요',    dot: 'red' },
];

export function QuickReviewModal({ open, planned, onSave, onClose }) {
  const [statusKey, setStatusKey] = useState('1');
  const [sat, setSat] = useState(4);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (['1','2','3','4'].includes(e.key)) setStatusKey(e.key);
      else if (['5','6','7','8','9'].includes(e.key)) setSat(Math.min(5, e.key - 4));
      else if (e.key === 'Escape') onClose?.();
      else if (e.key === 'Enter') onSave?.({ status: statusKey, sat });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, statusKey, sat, onSave, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{planned?.title || '평가'}</h3>
        {planned?.timeLabel && <span className="planned">{planned.timeLabel} · {planned.subtitle}</span>}
        <div className="qr-grid">
          {STATUSES.map(s => (
            <button
              key={s.key}
              className={'qr-btn' + (statusKey === s.key ? ' selected' : '')}
              onClick={() => setStatusKey(s.key)}
            >
              <span className="qr-emoji">{s.emoji}</span>
              <span>{s.label}</span>
              <span className="qr-key">{s.key}</span>
            </button>
          ))}
        </div>
        <div className="qr-slider">
          <label>만족도</label>
          <input type="range" min="1" max="5" value={sat} onChange={e => setSat(+e.target.value)} />
          <span className="qr-sat">{sat}</span>
        </div>
        <div className="qr-actions">
          <button className="text-btn" onClick={onClose}>닫기</button>
          <button className="primary-btn" onClick={() => onSave?.({ status: statusKey, sat })}>저장</button>
        </div>
      </div>
    </div>
  );
}
