import { useEffect, useRef, useState } from 'react';
import { Camera, Check, LoaderCircle, Save, UserRound } from 'lucide-react';
import { apiFetch, API_URL } from '../api';
const EMPTY_PROFILE = {
  name: '',
  email: '',
  phone: '',
  role: '',
  team: '',
  company: '',
  timezone: '',
  photo: '',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [savedProfile, setSavedProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const photoInput = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_URL}/profile`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load your profile.');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const current = { ...EMPTY_PROFILE, ...data };
        setProfile(current);
        setSavedProfile(current);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const updateField = (event) => {
    setProfile((current) => ({ ...current, [event.target.name]: event.target.value }));
    setSuccess('');
  };

  const handlePhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for your profile photo.');
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Profile photos must be 2 MB or smaller.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfile((current) => ({ ...current, photo: String(reader.result) }));
      setError('');
      setSuccess('');
    };
    reader.onerror = () => setError('Could not read that image. Please try another one.');
    reader.readAsDataURL(file);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await apiFetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone,
          role: profile.role,
          team: profile.team,
          company: profile.company,
          timezone: profile.timezone,
          photo: profile.photo,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save profile changes.');
      const current = { ...EMPTY_PROFILE, ...data };
      setProfile(current);
      setSavedProfile(current);
      setSuccess('Your profile has been saved.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const initials = profile.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const hasChanges = JSON.stringify(profile) !== JSON.stringify(savedProfile);

  if (loading) {
    return <section className="panel profile-loading"><LoaderCircle size={20} className="loading-spinner" /> Loading profile…</section>;
  }

  return (
    <div className="page-stack">
      <section className="panel profile-editor">
        <div className="profile-editor-heading">
          <div>
            <p className="eyebrow">Your account</p>
            <h2>Profile details</h2>
            <p className="muted-text">Keep your contact and team information up to date.</p>
          </div>
          <button className="primary-button profile-save-button" type="submit" form="profile-form" disabled={saving || !hasChanges}>
            {saving ? <LoaderCircle size={17} className="loading-spinner" /> : <Save size={17} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        {error && <div className="profile-message error-message" role="alert">{error}</div>}
        {success && <div className="profile-message success-message" role="status"><Check size={16} />{success}</div>}

        <form id="profile-form" onSubmit={saveProfile} className="profile-form">
          <div className="profile-photo-section">
            <div className="profile-photo-preview">
              {profile.photo ? <img src={profile.photo} alt="Profile" /> : <span>{initials || <UserRound size={28} />}</span>}
            </div>
            <div className="profile-photo-copy">
              <strong>Profile photo</strong>
              <span className="muted-text">Use a square image, up to 2 MB.</span>
              <div className="profile-photo-actions">
                <button className="secondary-button" type="button" onClick={() => photoInput.current?.click()}>
                  <Camera size={16} /> Upload photo
                </button>
                {profile.photo && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setProfile((current) => ({ ...current, photo: '' }));
                      setSuccess('');
                    }}
                  >
                    Remove
                  </button>
                )}
                <input ref={photoInput} className="visually-hidden" type="file" accept="image/*" onChange={handlePhoto} />
              </div>
            </div>
          </div>

          <div className="profile-fields-grid">
            <ProfileField label="Full name" name="name" value={profile.name} onChange={updateField} required autoComplete="name" />
            <ProfileField label="Email address" name="email" value={profile.email} type="email" autoComplete="email" readOnly aria-describedby="profile-email-help" />
            <small id="profile-email-help" className="profile-email-help">This is the email address used to create your account and cannot be changed here.</small>
            <ProfileField label="Phone number" name="phone" value={profile.phone} onChange={updateField} type="tel" autoComplete="tel" placeholder="Add your phone number" />
            <ProfileField label="Role / job title" name="role" value={profile.role} onChange={updateField} required />
            <ProfileField label="Team" name="team" value={profile.team} onChange={updateField} required />
            <ProfileField label="Company" name="company" value={profile.company} onChange={updateField} required />
            <ProfileField label="Timezone" name="timezone" value={profile.timezone} onChange={updateField} required />
          </div>
        </form>
      </section>
    </div>
  );
}

function ProfileField({ label, name, value, onChange, ...props }) {
  return (
    <label className="profile-field">
      {label}
      <input name={name} value={value || ''} onChange={onChange} {...props} />
    </label>
  );
}
