// Sidebar.jsx — reference component for Sanctum OS
// 240px fixed left rail. Active item uses brand-soft bg + brand-primary text.

export function Sidebar({ active = 'today', onNav, userName = '미수', lockSeconds = 878 }) {
  const items = [
    { id: 'goals',      icon: '🎯', label: '나의 목표' },
    { id: 'today',      icon: '📅', label: '오늘' },
    { id: 'evening',    icon: '🌙', label: '저녁 회고' },
    null,
    { id: 'dashboard',  icon: '📊', label: '대시보드' },
    { id: 'past',       icon: '📜', label: '지난 묵상' },
    { id: 'principles', icon: '📖', label: '나의 원칙' },
    { id: 'reports',    icon: '📈', label: '리포트' },
    null,
    { id: 'persons',    icon: '👥', label: '인물' },
    { id: 'orgs',       icon: '🏢', label: '조직' },
    null,
    { id: 'settings',   icon: '⚙',  label: '설정·보안' },
  ];
  const mm = String(Math.floor(lockSeconds / 60)).padStart(2, '0');
  const ss = String(lockSeconds % 60).padStart(2, '0');

  return (
    <aside className="sidebar">
      <div className="logo">Sanctum OS</div>
      <nav className="nav">
        {items.map((it, i) =>
          it === null
            ? <hr key={i} className="nav-divider" />
            : (
              <button
                key={it.id}
                className={'nav-item' + (active === it.id ? ' active' : '')}
                onClick={() => onNav?.(it.id)}
              >
                <span className="icon">{it.icon}</span> {it.label}
              </button>
            )
        )}
      </nav>
      <div className="sidebar-profile">
        <div className="avatar">{userName[0]}</div>
        <span style={{ fontSize: 14 }}>{userName}</span>
      </div>
      <div className="sidebar-footer">
        <button className="icon-btn" title="민감 정보 숨기기">👁</button>
        <span className="lock-timer">🔒 {mm}:{ss}</span>
        <button className="icon-btn" title="테마">🌙</button>
      </div>
    </aside>
  );
}
