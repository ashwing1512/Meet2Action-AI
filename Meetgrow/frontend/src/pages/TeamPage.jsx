import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { apiFetch, API_URL } from '../api';

const EMPTY_MEMBER = { name: '', role: '', email: '', team: '', capacity: 8, load: 0 };

export default function TeamPage() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_MEMBER);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTeam = async () => {
    const response = await apiFetch(`${API_URL}/team`);
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.detail || 'Could not load team members.');
    setTeam(data);
  };

  useEffect(() => {
    loadTeam()
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  const saveMember = async (event, memberId = null) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(
        memberId ? `${API_URL}/team/${memberId}` : `${API_URL}/team`,
        {
          method: memberId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...draft,
            capacity: Number(draft.capacity),
            load: Number(draft.load),
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(' ')
          : data.detail;
        throw new Error(detail || 'Could not save this team member.');
      }
      await loadTeam();
      setEditingId(null);
      setAdding(false);
      setDraft(EMPTY_MEMBER);
      setMessage(memberId ? 'Team member updated.' : 'Team member added.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (member) => {
    if (!window.confirm(`Remove ${member.name} from your team? Roles assigned to this member will be unassigned.`)) return;
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`${API_URL}/team/${member.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not remove this team member.');
      setTeam((current) => current.filter((item) => item.id !== member.id));
      setMessage('Team member removed.');
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  const beginEdit = (member) => {
    setAdding(false);
    setEditingId(member.id);
    setDraft({
      name: member.name,
      role: member.role,
      email: member.email || '',
      team: member.team,
      capacity: member.capacity,
      load: member.load,
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    setDraft(EMPTY_MEMBER);
    setError('');
  };

  const editForm = (memberId = null) => (
    <form className="team-edit-form" onSubmit={(event) => saveMember(event, memberId)}>
      <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={120} required /></label>
      <label>Role<input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} maxLength={120} required /></label>
      <label>Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} maxLength={180} /></label>
      <label>Team<input value={draft.team} onChange={(event) => setDraft({ ...draft, team: event.target.value })} maxLength={120} required /></label>
      <label>Capacity<input type="number" min="1" max="100" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} required /></label>
      <label>Load<input type="number" min="0" max="100" value={draft.load} onChange={(event) => setDraft({ ...draft, load: event.target.value })} required /></label>
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
            <p className="eyebrow">PEOPLE &amp; CAPACITY</p>
            <h3>Team workload</h3>
          </div>
          {!adding && editingId === null && (
            <button className="primary-button" type="button" onClick={() => {
              setAdding(true);
              setDraft(EMPTY_MEMBER);
              setError('');
            }}>
              <Plus size={15} /> Add member
            </button>
          )}
        </div>
        <p className="muted-text team-page-intro">Edit team details, roles, and capacity to keep workload information up to date.</p>
        {error && <p className="task-error" role="alert">{error}</p>}
        {message && <p className="muted-text" role="status">{message}</p>}
        {adding && <div className="team-new-member">{editForm()}</div>}
        {loading ? <p className="muted-text">Loading team…</p> : team.length ? (
          <div className="table-wrap">
            <table className="editable-team-table">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Team</th><th>Capacity</th><th>Load</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {team.map((member) => editingId === member.id ? (
                  <tr key={member.id}><td colSpan="6">{editForm(member.id)}</td></tr>
                ) : (
                  <tr key={member.id}>
                    <td><strong>{member.name}</strong><small>{member.email || 'No email added'}</small></td>
                    <td>{member.role}</td>
                    <td>{member.team}</td>
                    <td>{member.capacity}</td>
                    <td>{member.load}</td>
                    <td>
                      <div className="row-actions">
                        <button className="table-icon-button" type="button" onClick={() => beginEdit(member)} aria-label={`Edit ${member.name}`}><Pencil size={15} /></button>
                        <button className="table-icon-button delete" type="button" onClick={() => removeMember(member)} aria-label={`Remove ${member.name}`}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-text">No team members yet. Add your first member to track workload.</p>}
      </section>
    </div>
  );
}
