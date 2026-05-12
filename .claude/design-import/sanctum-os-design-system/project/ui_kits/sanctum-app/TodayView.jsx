// TodayView.jsx — container for the Today screen
// 핀 띠 → 날짜 → 말씀 → 묵상 노트 → 결단 → 통합 타임라인 → 오늘 리포트 → 내일 시작 CTA

import { Timeline } from './Timeline.jsx';
import { DecisionCard } from './DecisionCard.jsx';

export function TodayView({ pinnedPrinciple, dateLabel, scripture, note, decisions, slots }) {
  return (
    <main className="content">
      {pinnedPrinciple && (
        <div className="pinned">
          <span style={{ fontSize: 14 }}>📌</span>
          <span>{pinnedPrinciple}</span>
        </div>
      )}

      <header className="page-header">
        <h1>{dateLabel}</h1>
        <input type="date" className="date-picker" />
      </header>

      <section className="card-section">
        <div className="section-head">
          <div className="section-title"><span>📖</span> 오늘의 말씀</div>
          <button className="collapse-btn">접기</button>
        </div>
        {scripture}
      </section>

      <section className="card-section">
        <div className="section-head">
          <div className="section-title"><span>✏️</span> 묵상 노트</div>
        </div>
        <div
          className="note-editor"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="말씀을 곱씹다 떠오른 생각을 한 줄씩 적어 보세요"
        >{note}</div>
      </section>

      <section className="card-section">
        <div className="section-title"><span>🙏</span> 오늘의 결단</div>
        <p className="section-desc">오늘 어디에 순종할까요? ⋮⋮ 핸들을 잡고 아래 시간표로 끌어 옮길 수 있어요.</p>
        <div className="decisions">
          {decisions?.map(d => <DecisionCard key={d.id} {...d} />)}
        </div>
        <button className="add-btn">+ 새 결단 적기</button>
      </section>

      <section className="card-section">
        <div className="section-head">
          <div className="section-title"><span>⏰</span> 오늘의 시간표</div>
        </div>
        <Timeline slots={slots} nowSlot={14 * 4 + 1} />
      </section>

      <section className="card-section">
        <div className="section-title"><span>📈</span> 오늘의 리포트</div>
        <p style={{ color: 'var(--ink-secondary)', fontSize: 13, margin: 0 }}>
          시간표에서 도트 평가를 채워가면, 오늘의 결이 여기에 자동으로 정리돼요.
        </p>
      </section>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 40px' }}>
        <button className="primary-btn" style={{ padding: '12px 24px', fontSize: 15 }}>
          내일 묵상 시작하기 →
        </button>
      </div>
    </main>
  );
}
