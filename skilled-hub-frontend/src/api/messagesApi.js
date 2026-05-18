// TODO: wire when backend inbox endpoints exist.
// Stubs use the same base URL pattern as api.js; call these from useMessagesInbox when backend ships.

const isProduction =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'techflash.app' || window.location.hostname === 'www.techflash.app');
const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL ||
  (isProduction ? 'https://skilledhub-production.up.railway.app/api/v1' : 'http://localhost:3000/api/v1');

async function inboxRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    let msg = `HTTP error! status: ${response.status}`;
    try {
      const data = JSON.parse(text);
      msg = data.message || data.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const inboxMessagesAPI = {
  list: () => inboxRequest('/messages'),
  get: (id) => inboxRequest(`/messages/${id}`),
  create: (payload) =>
    inboxRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reply: (id, body) =>
    inboxRequest(`/messages/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  patch: (id, data) =>
    inboxRequest(`/messages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  patchStatus: (id, status) =>
    inboxRequest(`/messages/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  patchPriority: (id, priority) =>
    inboxRequest(`/messages/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({ priority }),
    }),
  postInternalNote: (id, body) =>
    inboxRequest(`/messages/${id}/internal-notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
};
