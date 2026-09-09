const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function request(path, { method = 'GET', body, token, isForm = false } = {}) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  if (!isForm) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data.data;
}
