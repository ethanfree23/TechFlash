import { auth } from '../auth.js';
import { formatApiFetchError, resolveApiBaseUrl } from './apiConfig.js';

async function apiRequest(endpoint, options = {}) {
  const token = auth.getToken();
  const baseUrl = resolveApiBaseUrl();
  const { headers: optionHeaders = {}, ...requestOptions } = options;
  const isFormData = requestOptions.body instanceof FormData;
  const config = {
    ...requestOptions,
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...optionHeaders,
    },
  };

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, config);
    if (!response.ok) {
      const text = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(text);
      } catch {
        /* ignore */
      }
      const msg =
        errorData.message ||
        errorData.error ||
        (Array.isArray(errorData.errors) ? errorData.errors.join(', ') : null) ||
        `HTTP error! status: ${response.status}`;
      const enrichedError = new Error(msg);
      enrichedError.status = response.status;
      enrichedError.details = errorData;
      throw enrichedError;
    }
    const raw = await response.text();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw formatApiFetchError(error);
  }
}

export const technicianOnboardingAPI = {
  get: () => apiRequest('/technician_onboarding'),
  update: (payload) =>
    apiRequest('/technician_onboarding', {
      method: 'PATCH',
      body: JSON.stringify(payload || {}),
    }),
  start: (payload = {}) =>
    apiRequest('/technician_onboarding/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  complete: () =>
    apiRequest('/technician_onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

export const adminTechnicianOnboardingAPI = {
  getSettings: () => apiRequest('/admin/technician_onboarding/settings'),
  updateSettings: (payload) =>
    apiRequest('/admin/technician_onboarding/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload || {}),
    }),
  dryRun: (limit = 25) => apiRequest(`/admin/technician_onboarding/dry_run?limit=${limit}`),
  getForUser: (userId) => apiRequest(`/admin/users/${userId}/technician_onboarding`),
  requireOnboarding: (userId) =>
    apiRequest(`/admin/users/${userId}/technician_onboarding/require_onboarding`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};
