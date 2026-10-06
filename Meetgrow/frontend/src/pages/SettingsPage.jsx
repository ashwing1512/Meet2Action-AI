import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { apiFetch, API_URL } from '../api';

const DEFAULT_SETTINGS = { theme: 'light', notifications: true, aiSummary: true, defaultExport: 'PDF' };

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [deletingTasks, setDeletingTasks] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    apiFetch(`${API_URL}/settings`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load saved settings.');
        setSettings({ ...DEFAULT_SETTINGS, ...await response.json() });
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = async (name, value) => {
    const next = { ...settings, [name]: value };
    setSettings(next);
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await apiFetch(`${API_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error('Could not save this setting.');
      setSettings({ ...DEFAULT_SETTINGS, ...await response.json() });
      setMessage('Settings saved to your account.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteAllTasks = async (event) => {
    event.preventDefault();
    setDeletingTasks(true);
    setDeleteMessage('');
    setDeleteError('');
    try {
      const response = await apiFetch(`${API_URL}/tasks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: accountPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not delete tasks.');
      setDeleteMessage(data.deleted
        ? `Deleted ${data.deleted} task${data.deleted === 1 ? '' : 's'} from your workspace.`
        : 'There were no tasks to delete.');
      setAccountPassword('');
      setConfirmDelete(false);
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message);
    } finally {
      setDeletingTasks(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h3>Workspace settings</h3>
        </div>
        {loading ? <p className="muted-text">Loading saved settings…</p> : (
        <div className="settings-list">
          <label className="toggle-row"><span>AI summary generation</span><input type="checkbox" checked={settings.aiSummary} onChange={(event) => updateSetting('aiSummary', event.target.checked)} /></label>
          <label className="toggle-row"><span>Email notifications</span><input type="checkbox" checked={settings.notifications} onChange={(event) => updateSetting('notifications', event.target.checked)} /></label>
          <label className="toggle-row"><span>Theme</span><select value={settings.theme} onChange={(event) => updateSetting('theme', event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <label className="toggle-row"><span>Default export</span><select value={settings.defaultExport} onChange={(event) => updateSetting('defaultExport', event.target.value)}><option value="PDF">PDF</option><option value="CSV">CSV</option></select></label>
        </div>
        )}
        {saving && <p className="muted-text" role="status">Saving…</p>}
        {message && <p className="muted-text" role="status">{message}</p>}
        {error && <p className="task-error" role="alert">{error}</p>}
      </section>
      <section className="panel danger-zone">
        <div className="panel-header">
          <h3 className="with-icon"><AlertTriangle size={18} /> Delete all tasks</h3>
        </div>
        <p className="muted-text">Permanently remove every task and its related overdue alerts from your workspace. This does not delete your meetings, team, or account.</p>
        {!confirmDelete ? (
          <button
            className="danger-button"
            type="button"
            onClick={() => {
              setConfirmDelete(true);
              setDeleteMessage('');
              setDeleteError('');
            }}
          >
            <Trash2 size={15} />
            Delete all tasks
          </button>
        ) : (
          <form className="delete-confirm-form" onSubmit={deleteAllTasks}>
            <label>
              Enter your account password to confirm
              <input
                type="password"
                autoComplete="current-password"
                value={accountPassword}
                onChange={(event) => setAccountPassword(event.target.value)}
                required
              />
            </label>
            <div className="delete-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => {
                setConfirmDelete(false);
                setAccountPassword('');
                setDeleteError('');
              }} disabled={deletingTasks}>
                Cancel
              </button>
              <button className="danger-button" type="submit" disabled={deletingTasks || !accountPassword}>
                <Trash2 size={15} />
                {deletingTasks ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          </form>
        )}
        {deleteMessage && <p className="muted-text" role="status">{deleteMessage}</p>}
        {deleteError && <p className="task-error" role="alert">{deleteError}</p>}
      </section>
    </div>
  );
}
