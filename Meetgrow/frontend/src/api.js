export const API_URL = 'http://127.0.0.1:8000/api';

export function apiFetch(input, options = {}) {
  const token = localStorage.getItem('meetgrow_token');
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...options, headers });
}
