import { useEffect, useState } from 'react';
import { apiFetch, API_URL } from '../api';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [draft, setDraft] = useState({ title: '', assignee: '', priority: 'medium', status: 'todo', due_date: '', description: '' });
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');

  useEffect(() => {
    const loadTasks = () => apiFetch(`${API_URL}/tasks`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load tasks.');
        setTasks(await response.json());
      })
      .catch((loadError) => setError(loadError.message));
    loadTasks();
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const updateTaskStatus = async (taskId, value) => {
    try {
      const response = await apiFetch(`${API_URL}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: value }),
      });
      if (!response.ok) throw new Error('Could not update task progress.');
      const tasksResponse = await apiFetch(`${API_URL}/tasks`);
      if (!tasksResponse.ok) throw new Error('Could not refresh tasks.');
      setTasks(await tasksResponse.json());
      setError('');
    } catch (updateError) {
      setError(updateError.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await apiFetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, source: 'manual' }),
      });
      if (!response.ok) throw new Error('Could not add task.');
      setDraft({ title: '', assignee: '', priority: 'medium', status: 'todo', due_date: '', description: '' });
      const tasksResponse = await apiFetch(`${API_URL}/tasks`);
      if (!tasksResponse.ok) throw new Error('Task was added, but the task list could not be refreshed.');
      setTasks(await tasksResponse.json());
      setError('');
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  return (
    <div className="page-stack">
      <section className="panel form-panel">
        <div className="panel-header">
          <h3>Track task</h3>
        </div>
        <p className="muted-text task-deadline-help">Set a deadline to start the countdown. Unfinished tasks trigger a manager alert after the deadline passes.</p>
        {error && <p className="task-error" role="alert">{error}</p>}
        <form className="stacked-form" onSubmit={handleSubmit}>
          <div className="field-row">
            <label>
              Task title
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
            </label>
            <label>
              Assignee
              <input value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} />
            </label>
          </div>
          <div className="field-row three-col">
            <label>
              Priority
              <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label>
              Status
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} required />
            </label>
          </div>
          <label>
            Notes
            <textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <button className="primary-button" type="submit">Add task</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Task board</h3>
        </div>
        <div className="task-board">
          {tasks.map((task) => (
            <div key={task.id} className="task-board-card">
              <div className="task-head">
                <div>
                  <p className="list-title">{task.title}</p>
                  <small>{task.assignee || 'Unassigned'}</small>
                </div>
                <span className={`pill ${task.priority}`}>{task.priority}</span>
              </div>
              <p className="muted-text">{task.description || 'No description provided.'}</p>
              <div className="row-between">
                <DeadlineCountdown dueDate={task.dueDate} status={task.status} now={now} />
                <select value={task.status} onChange={(e) => updateTaskStatus(task.id, e.target.value)}>
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DeadlineCountdown({ dueDate, status, now }) {
  if (!dueDate) return <span className="muted-text">No deadline</span>;
  const dueDay = parseDueDate(dueDate);
  if (Number.isNaN(dueDay.getTime())) return <span className="muted-text">Due {dueDate}</span>;
  if (status === 'completed') return <span className="muted-text">Due {dueDay.toLocaleDateString()}</span>;

  const remaining = dueDay.getTime() - now;
  if (remaining < 0) {
    const overdueDays = Math.max(1, Math.ceil(Math.abs(remaining) / 86_400_000));
    return <span className="deadline-countdown overdue">Overdue by {overdueDays} day{overdueDays === 1 ? '' : 's'}</span>;
  }

  const days = Math.floor(remaining / 86_400_000);
  if (days === 0) return <span className="deadline-countdown due-soon">Due today</span>;
  return <span className="deadline-countdown">Due in {days} day{days === 1 ? '' : 's'}</span>;
}

function parseDueDate(value) {
  const explicitDate = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (explicitDate) return new Date(`${explicitDate}T23:59:59`);

  const lowered = value.toLowerCase();
  const today = new Date();
  if (lowered.includes('tomorrow')) {
    today.setDate(today.getDate() + 1);
  } else {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const weekday = days.findIndex((day) => lowered.includes(day));
    if (weekday < 0) return new Date(Number.NaN);
    let delta = (weekday - today.getDay() + 7) % 7;
    if (delta === 0 || lowered.includes('next')) delta += 7;
    today.setDate(today.getDate() + delta);
  }
  today.setHours(23, 59, 59, 999);
  return today;
}
