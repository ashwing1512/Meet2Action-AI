import React from 'react';
import { Home, CalendarRange, CheckSquare, Users, BriefcaseBusiness, UserCircle, Settings, LogOut, Menu, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', path: '/', icon: Home },
  { label: 'Meetings', path: '/meetings', icon: CalendarRange },
  { label: 'Tasks', path: '/tasks', icon: CheckSquare },
  { label: 'Team', path: '/team', icon: Users },
  { label: 'Roles', path: '/roles', icon: BriefcaseBusiness },
  { label: 'Profile', path: '/profile', icon: UserCircle },
];

function Sidebar({ isOpen, onClose, onLogout }) {
  return (
    <>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">AI</div>
          <div>
            <div className="brand-title">Meetgrow</div>
            <div className="brand-subtitle">Meetings &amp; teamwork</div>
          </div>
        </div>

        <p className="nav-section-label">Workspace</p>
        <nav className="nav-list">
          {navItems.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink to="/settings" className="nav-item footer-item" onClick={onClose}>
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
          <button className="nav-item footer-item logout-button" type="button" onClick={onLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {isOpen && <button className="sidebar-backdrop" type="button" onClick={onClose} aria-label="Close sidebar" />}
    </>
  );
}

export default function Layout({ children, user, onLogout }) {
  const [isSidebarOpen, setSidebarOpen] = React.useState(false);
  const location = useLocation();
  const pageTitles = {
    '/': ['Dashboard', 'Your workspace at a glance'],
    '/meetings': ['Meetings', 'Meet, review notes, and capture next steps'],
    '/tasks': ['Tasks', 'Keep priorities and deadlines moving'],
    '/team': ['Team', 'See how work is distributed across your team'],
    '/roles': ['Roles', 'Clarify ownership and responsibilities'],
    '/profile': ['Profile', 'Manage your personal and team details'],
    '/settings': ['Settings', 'Personalize your workspace'],
  };
  const [pageTitle, pageDescription] = pageTitles[location.pathname] || pageTitles['/'];

  return (
    <div className="app-shell">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={onLogout} />
      <div className="content-wrap">
        <header className="topbar">
          <button className="menu-button" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle navigation">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="topbar-title-wrap">
            <p className="eyebrow">Meetgrow workspace</p>
            <h1>{pageTitle}</h1>
            <p className="topbar-description">{pageDescription}</p>
          </div>
          <div className="topbar-account">
            <div className="avatar-pill" title={user?.name}>
              {user?.name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'MG'}
            </div>
            <div className="topbar-account-copy">
              <strong>{user?.name || 'My workspace'}</strong>
              {user?.email && <span>{user.email}</span>}
            </div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
