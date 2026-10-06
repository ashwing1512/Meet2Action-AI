import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, Sparkles, Users, Video } from 'lucide-react';
import { API_URL } from '../api';

export default function AuthPage({ mode, onAuthenticated }) {
  const isSignUp = mode === 'signup';
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
    setSuccess('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (isSignUp && form.password !== form.confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    if (isSignUp && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/${isSignUp ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isSignUp ? { name: form.name } : {}),
          email: form.email,
          password: form.password,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(' ')
          : data.detail;
        throw new Error(detail || data.message || 'We could not complete your request.');
      }
      if (isSignUp) {
        setSuccess('Your account was created successfully. Opening your workspace…');
        onAuthenticated(data);
      } else {
        onAuthenticated(data);
      }
    } catch (submitError) {
      setError(submitError instanceof TypeError
        ? 'Could not reach the backend. Start the FastAPI server and try again.'
        : submitError.message || 'Could not connect to Meetgrow. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link to="/signin" className="auth-brand" aria-label="Meetgrow sign in">
          <span className="auth-brand-mark">AI</span>
          <span>Meetgrow</span>
        </Link>
        <div className="auth-intro-content">
          <span className="auth-overline"><Sparkles size={15} /> A little more focus, together</span>
          <h1>Make every meeting<br />move work forward.</h1>
          <p>Turn conversations into clear next steps, keep your team in sync, and spend less time chasing updates.</p>
          <div className="auth-feature-list">
            <div><span><Video size={17} /></span> Simple team video meetings</div>
            <div><span><Sparkles size={17} /></span> AI meeting notes and action items</div>
            <div><span><Users size={17} /></span> A private workspace saved to your account</div>
          </div>
        </div>
        <p className="auth-footer-note">A calmer way to get things done.</p>
        <div className="auth-decoration auth-decoration-one" />
        <div className="auth-decoration auth-decoration-two" />
      </section>

      <section className="auth-form-side">
        <div className="auth-form-top">
          <span>{isSignUp ? 'Already have an account?' : 'New to Meetgrow?'}</span>
          <Link to={isSignUp ? '/signin' : '/signup'}>{isSignUp ? 'Sign in' : 'Create an account'}</Link>
        </div>

        <div className="auth-card">
          <div className="auth-mobile-brand">
            <span className="auth-brand-mark">AI</span>
            <span>Meetgrow</span>
          </div>
          <div className="auth-card-heading">
            <p className="eyebrow">{isSignUp ? 'Get started' : 'Welcome back'}</p>
            <h2>{isSignUp ? 'Create your account' : 'Sign in to your workspace'}</h2>
            <p className="muted-text">{isSignUp ? 'Create an account and start a private workspace.' : 'Your saved meetings, tasks, and profile will be restored.'}</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {isSignUp && (
              <label>
                Full name
                <input type="text" name="name" autoComplete="name" placeholder="Your name" value={form.name} onChange={updateField} maxLength={120} required />
              </label>
            )}
            <label>
              Email address
              <input type="email" name="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={updateField} maxLength={180} required />
            </label>
            <label>
              Password
              <span className="auth-password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder={isSignUp ? 'At least 8 characters' : 'Enter your password'}
                  value={form.password}
                  onChange={updateField}
                  minLength={isSignUp ? 8 : 1}
                  maxLength={128}
                  required
                />
                <button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {isSignUp && (
              <label>
                Confirm password
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Type your password again"
                  value={form.confirmPassword}
                  onChange={updateField}
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}
            {success && <p className="auth-success" role="status">{success}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="auth-secure-note">
            <Check size={14} />
            Your password is securely hashed before it is stored.
          </div>
        </div>
        <p className="auth-legal">Your workspace data is saved with your account and restored when you sign in.</p>
      </section>
    </main>
  );
}
