import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { EmptyState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { allowedNav } from './nav';

export function AppLayout() {
  const { user, canAny, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sections = allowedNav(canAny);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`app ${drawerOpen ? 'drawer-open' : ''}`}>
      <header className="topbar">
        <button
          type="button"
          className="icon-btn menu-btn"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          ☰
        </button>
        <span className="brand">Material Calc</span>
        <div className="topbar-user">
          <div className="user-meta">
            <strong>{user?.name}</strong>
            <span className="muted">
              {user?.role?.name ?? 'No role'}
              {user?.department ? ` · ${user.department.name}` : ''}
            </span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <nav className="sidebar" aria-label="Main">
        {sections.map((section) => (
          <div key={section.title} className="nav-section">
            <div className="nav-title">{section.title}</div>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav-link">
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

/** "/" → the first page the user may open. */
export function HomeRedirect() {
  const { canAny } = useAuth();
  const first = allowedNav(canAny)[0]?.items[0];
  if (first) return <Navigate to={first.to} replace />;
  return (
    <div className="card">
      <EmptyState title="Your role has no pages yet.">Ask an Admin to give your role some permissions.</EmptyState>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="card">
      <EmptyState title="Page not found.">
        <NavLink to="/">Go to your home page</NavLink>
      </EmptyState>
    </div>
  );
}

