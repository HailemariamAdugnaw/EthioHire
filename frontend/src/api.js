const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function request(path, method = 'GET', body, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data.data;
}
