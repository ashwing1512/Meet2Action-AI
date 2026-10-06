import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { API_URL } from './api';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import MeetingsPage from './pages/MeetingsPage';
import TasksPage from './pages/TasksPage';
import TeamPage from './pages/TeamPage';
import RolesPage from './pages/RolesPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import AuthPage from './pages/AuthPage';

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('meetgrow_token');
    if (!token) {
      setCheckingSession(false);
      return;
    }

    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired.');
        return response.json();
      })
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('meetgrow_token');
        setUser(null);
      })
      .finally(() => setCheckingSession(false));
  }, []);

  const completeAuthentication = (authData) => {
    localStorage.setItem('meetgrow_token', authData.access_token);
    setUser(authData.user);
    navigate('/', { replace: true });
  };

  const logout = async () => {
    const token = localStorage.getItem('meetgrow_token');
    if (token) {
      try {
        await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch (error) {
        console.error('Could not revoke the session on the server.', error);
      }
    }
    localStorage.removeItem('meetgrow_token');
    setUser(null);
    navigate('/signin', { replace: true });
  };

  const authMode = location.pathname === '/signup' ? 'signup' : 'signin';
  if (location.pathname === '/signin' || location.pathname === '/signup') {
    if (checkingSession) return <div className="auth-loading">Loading your workspace…</div>;
    if (user) return <Navigate to="/" replace />;
    return <AuthPage mode={authMode} onAuthenticated={completeAuthentication} />;
  }

  if (checkingSession) return <div className="auth-loading">Loading your workspace…</div>;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;

  return (
    <Layout user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
