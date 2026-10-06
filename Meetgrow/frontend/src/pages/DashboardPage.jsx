import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Bell, Bot, CheckCircle2, Clock3, Send, Sparkles, Users, Trash2 } from 'lucide-react';
import { apiFetch, API_URL } from '../api';

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState({ summary: {}, workload: [], recentMeetings: [], upcomingTasks: [] });
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState('');
  const [clearingTasks, setClearingTasks] = useState(false);
  const [taskActionMessage, setTaskActionMessage] = useState('');
  const [taskActionError, setTaskActionError] = useState('');

  useEffect(() => {
    apiFetch(`${API_URL}/dashboard`)
      .then((res) => res.json())
      .then((data) => setDashboard(data))
      .catch(() => setDashboard({ summary: {}, workload: [], recentMeetings: [], upcomingTasks: [] }));

    const loadNotifications = () => apiFetch(`${API_URL}/notifications`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load manager alerts.');
        setNotifications(await response.json());
        setNotificationError('');
      })
      .catch((error) => setNotificationError(error.message));
    loadNotifications();
    const refreshTimer = window.setInterval(loadNotifications, 30_000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  const summary = dashboard.summary || {};

  const markAlertRead = async (notificationId) => {
    try {
      const response = await apiFetch(`${API_URL}/notifications/${notificationId}/read`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not mark this alert as reviewed.');
      setNotifications((current) => current.map((notification) => (
        notification.id === notificationId ? { ...notification, read: true } : notification
      )));
      setNotificationError('');
    } catch (error) {
      setNotificationError(error.message);
    }
  };

  const clearCompletedTasks = async () => {
    setClearingTasks(true);
    setTaskActionMessage('');
    setTaskActionError('');
    try {
      const response = await apiFetch(`${API_URL}/tasks/completed`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not clear completed tasks.');
      setDashboard((current) => ({
        ...current,
        summary: {
          ...current.summary,
          totalTasks: Math.max(0, (current.summary?.totalTasks || 0) - data.deleted),
          completedTasks: Math.max(0, (current.summary?.completedTasks || 0) - data.deleted),
        },
      }));
      setTaskActionMessage(data.deleted
        ? `${data.deleted} completed task${data.deleted === 1 ? '' : 's'} cleared.`
        : 'There are no completed tasks to clear.');
    } catch (error) {
      setTaskActionError(error.message);
    } finally {
      setClearingTasks(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>Team performance at a glance</h2>
        </div>
        <div className="hero-chip">
          <Sparkles size={16} />
          AI summaries enabled
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon={<Activity size={18} />} label="Total meetings" value={summary.totalMeetings ?? 0} accent="blue" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Tasks tracked" value={summary.totalTasks ?? 0} accent="green" />
        <StatCard icon={<Clock3 size={18} />} label="Completed" value={summary.completedTasks ?? 0} accent="purple" />
        <StatCard icon={<ArrowUpRight size={18} />} label="Critical" value={summary.criticalTasks ?? 0} accent="orange" />
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3 className="with-icon"><Bell size={18} /> Overdue manager alerts</h3>
          {!!notifications.filter((notification) => !notification.read).length && (
            <span className="notification-count">{notifications.filter((notification) => !notification.read).length} new</span>
          )}
        </div>
        {notificationError && <p className="task-error" role="alert">{notificationError}</p>}
        {notifications.length === 0 ? (
          <p className="muted-text">No overdue tasks. Tasks with a deadline will appear here if they remain unfinished after their due date.</p>
        ) : (
          <div className="stack-list">
            {notifications.map((notification) => (
              <article className={`manager-alert ${notification.read ? 'read' : ''}`} key={notification.id}>
                <div className="manager-alert-copy">
                  <strong>{notification.title}</strong>
                  <p className="muted-text">{notification.message} · Due {notification.dueDate}</p>
                  <small>{emailDeliveryMessage(notification)}</small>
                </div>
                {!notification.read && (
                  <button className="secondary-button" type="button" onClick={() => markAlertRead(notification.id)}>
                    Mark reviewed
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <DashboardAssistant />

      <div className="content-grid two-column">
        <section className="panel">
          <div className="panel-header">
            <h3>Recent meetings</h3>
          </div>
          <div className="stack-list">
            {(dashboard.recentMeetings || []).map((meeting) => (
              <div className="list-card" key={meeting.id}>
                <div>
                  <p className="list-title">{meeting.title}</p>
                  <p className="muted-text">{meeting.participants}</p>
                </div>
                <p className="small-text">{meeting.summary}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Team workload</h3>
          </div>
          <div className="stack-list workload-stack">
            {(dashboard.workload || []).map((member) => (
              <div key={member.name} className="workload-row">
                <div className="title-wrap">
                  <div className="avatar-mini">{member.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
                  <div>
                    <p>{member.name}</p>
                    <small>{member.role}</small>
                  </div>
                </div>
                <div className="capacity-meter">
                  <div className="meter-fill" style={{ width: `${Math.min(100, (member.load / member.capacity) * 100)}%` }} />
                </div>
                <span>{member.load}/{member.capacity}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>Upcoming tasks</h3>
        </div>
        <div className="task-list">
          {(dashboard.upcomingTasks || []).map((task) => (
            <div className="task-card" key={task.id}>
              <div>
                <p className="list-title">{task.title}</p>
                <p className="muted-text">Assigned to {task.assignee || 'Unassigned'}</p>
              </div>
              <div className="task-meta">
                <span className={`pill ${task.priority}`}>{task.priority}</span>
                <span className="muted-text">{task.dueDate || 'No deadline'}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="dashboard-task-actions">
          <div>
            <strong>Keep your task list tidy</strong>
            <p className="muted-text">Remove completed tasks from your workspace.</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={clearCompletedTasks}
            disabled={clearingTasks || !(summary.completedTasks > 0)}
          >
            <Trash2 size={15} />
            {clearingTasks ? 'Clearing…' : `Clear completed${summary.completedTasks ? ` (${summary.completedTasks})` : ''}`}
          </button>
        </div>
        {taskActionMessage && <p className="muted-text" role="status">{taskActionMessage}</p>}
        {taskActionError && <p className="task-error" role="alert">{taskActionError}</p>}
      </section>
    </div>
  );
}

function emailDeliveryMessage(notification) {
  if (notification.emailStatus === 'sent') return `Email sent to ${notification.emailRecipients}.`;
  if (notification.emailStatus === 'not_configured') return 'Email not configured. Add SMTP settings to backend/.env to enable manager email alerts.';
  if (notification.emailStatus === 'no_manager') return 'No manager/head team member with an email address was found.';
  if (notification.emailStatus === 'failed') return 'Email delivery failed. Check the backend logs; delivery will retry.';
  return 'Manager email alert is being prepared.';
}

function DashboardAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! I can help you start or join a meeting, find action items, or check team workload. What would you like to know?',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const messagesEnd = useRef(null);

  useEffect(() => {
    apiFetch(`${API_URL}/chat/history`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not restore saved assistant chat.');
        const history = await response.json();
        if (history.length) setMessages(history);
      })
      .catch((error) => setNotice(error.message));
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const sendMessage = async (text = draft) => {
    const message = text.trim();
    if (!message || sending) return;

    const history = messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setDraft('');
    setSending(true);
    setNotice('');

    try {
      const response = await apiFetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      if (!response.ok) throw new Error('The assistant could not respond. Please try again.');
      const data = await response.json();
      setMessages((current) => [...current, { role: 'assistant', content: data.answer }]);
      setNotice(data.notice || '');
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: 'I could not reach the assistant just now. Please check that the backend is running and try again.' },
      ]);
      setNotice(error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="assistant-panel panel">
      <div className="assistant-heading">
        <div className="assistant-heading-icon"><Bot size={21} /></div>
        <div>
          <p className="eyebrow">Meetgrow AI</p>
          <h3>Ask your workspace assistant</h3>
          <p className="muted-text">Quick help for meetings, tasks, and your team.</p>
        </div>
      </div>
      <div className="assistant-chat">
        <div className="assistant-messages" aria-live="polite">
          {messages.map((item, index) => (
            <div className={`assistant-message ${item.role}`} key={`${item.role}-${index}`}>
              {item.role === 'assistant' && <span className="assistant-message-icon"><Sparkles size={14} /></span>}
              <p>{item.content}</p>
            </div>
          ))}
          {sending && <div className="assistant-typing">Thinking…</div>}
          <div ref={messagesEnd} />
        </div>
        {notice && <p className="assistant-notice">{notice}</p>}
        {messages.length === 1 && (
          <div className="assistant-suggestions">
            {['How do I join a meeting?', 'What tasks are coming up?'].map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => sendMessage(suggestion)} disabled={sending}>
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form
          className="assistant-composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <input
            aria-label="Ask Meetgrow AI"
            placeholder="Ask about joining a call, tasks, or workload…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
          />
          <button className="assistant-send" type="submit" aria-label="Send message" disabled={!draft.trim() || sending}>
            <Send size={17} />
          </button>
        </form>
      </div>
    </section>
  );
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div className={`stat-card ${accent}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <p className="muted-text">{label}</p>
        <h3>{value}</h3>
      </div>
    </div>
  );
}
