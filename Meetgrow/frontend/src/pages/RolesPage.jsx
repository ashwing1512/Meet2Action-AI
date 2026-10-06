import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { apiFetch, API_URL } from '../api';

const EMPTY_ROLE = { name: '', description: '', team_member_id: '' };

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_ROLE);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const [rolesResponse, teamResponse] = await Promise.all([
      apiFetch(`${API_URL}/roles`),
      apiFetch(`${API_URL}/team`),
    ]);
    const rolesData = await rolesResponse.json().catch(() => []);
    const teamData = await teamResponse.json().catch(() => []);
    if (!rolesResponse.ok || !teamResponse.ok) {
      throw new Error(rolesData.detail || teamData.detail || 'Could not load roles and team members.');
    }
    setRoles(rolesData);
    setTeam(teamData);
  };

  useEffect(() => {
    loadData()
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  const saveRole = async (event, roleId = null) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(
        roleId ? `${API_URL}/roles/${roleId}` : `${API_URL}/roles`,
        {
          method: roleId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            description: draft.description.trim(),
            team_member_id: draft.team_member_id ? Number(draft.team_member_id) : null,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(' ')
          : data.detail;
        throw new Error(detail || 'Could not save this role.');
      }
      await loadData();
      setEditingId(null);
      setAdding(false);
      setDraft(EMPTY_ROLE);
      setMessage(roleId ? 'Role updated.' : 'Role added.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (role) => {
    if (!window.confirm(`Delete the "${role.name}" role?`)) return;
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`${API_URL}/roles/${role.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not delete this role.');
      setRoles((current) => current.filter((item) => item.id !== role.id));
      setMessage('Role deleted.');
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  const beginEdit = (role) => {
    setAdding(false);
    setEditingId(role.id);
    setDraft({
      name: role.name,
      description: role.description || '',
      team_member_id: role.teamMemberId ? String(role.teamMemberId) : '',
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    setDraft(EMPTY_ROLE);
    setError('');
  };

  const roleForm = (roleId = null) => (
    <form className="role-edit-form" onSubmit={(event) => saveRole(event, roleId)}>
      <label>Role name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={120} required /></label>
      <label>Description<textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={2000} /></label>
      <label>Role owner
        <select value={draft.team_member_id} onChange={(event) => setDraft({ ...draft, team_member_id: event.target.value })}>
          <option value="">Unassigned</option>
          {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>
      <div className="team-edit-actions">
        <button className="primary-button" type="submit" disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save'}</button>
        <button className="secondary-button" type="button" onClick={cancelEdit} disabled={saving}><X size={14} />Cancel</button>
      </div>
    </form>
  );

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">RESPONSIBILITIES</p>
            <h3>Roles &amp; ownership</h3>
          </div>
          {!adding && editingId === null && (
            <button className="primary-button" type="button" onClick={() => {
              setAdding(true);
              setDraft(EMPTY_ROLE);
              setError('');
            }}>
              <Plus size={15} /> Add role
            </button>
          )}
        </div>
        <p className="muted-text team-page-intro">Define responsibilities and assign each role to a team member.</p>
        {error && <p className="task-error" role="alert">{error}</p>}
        {message && <p className="muted-text" role="status">{message}</p>}
        {adding && <div className="info-card role-editor">{roleForm()}</div>}
        {loading ? <p className="muted-text">Loading roles…</p> : roles.length ? (
          <div className="role-grid">
            {roles.map((role) => (
              <article className="info-card role-card" key={role.id}>
                {editingId === role.id ? roleForm(role.id) : (
                  <>
                    <div className="role-card-heading">
                      <p className="list-title">{role.name}</p>
                      <div className="row-actions">
                        <button className="table-icon-button" type="button" onClick={() => beginEdit(role)} aria-label={`Edit ${role.name}`}><Pencil size={15} /></button>
                        <button className="table-icon-button delete" type="button" onClick={() => removeRole(role)} aria-label={`Delete ${role.name}`}><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <p className="muted-text">{role.description || 'No description provided.'}</p>
                    <div className="role-owner">
                      <span>Owner</span>
                      <strong>{team.find((member) => member.id === role.teamMemberId)?.name || 'Unassigned'}</strong>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        ) : <p className="muted-text">No roles yet. Add roles to clarify ownership.</p>}
      </section>
    </div>
  );
}
