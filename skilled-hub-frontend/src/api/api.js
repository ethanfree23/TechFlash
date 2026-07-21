import { auth } from '../auth';
import { formatApiFetchError, isProductionHost, resolveApiBaseUrl } from './apiConfig';

// API helper functions for interacting with the Rails API

export { isProductionHost, resolveApiBaseUrl, resolveDemoApiBaseUrl } from './apiConfig';

// Helper function to make API requests
const apiRequest = async (endpoint, options = {}) => {
  const token = auth.getToken();
  const baseUrl = resolveApiBaseUrl();

  const isFormData = options.body instanceof FormData;
  const config = {
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, config);
    
    if (!response.ok) {
      const text = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(text);
      } catch {
        // Server returned HTML or non-JSON (e.g. Rails error page)
        if (response.status === 500) {
          throw new Error('Server error. Check Rails server logs for details. Run: cd skilled_hub_api && bundle exec rails db:migrate');
        }
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

    // 204 No Content and other empty successful bodies (Rails uses this for DELETE)
    const raw = await response.text();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch (error) {
    console.error('API request failed:', error);
    throw formatApiFetchError(error);
  }
};

/** Same as apiRequest but never sends Authorization — for public endpoints (e.g. share preview). */
export const publicApiRequest = async (endpoint, options = {}) => {
  const baseUrl = resolveApiBaseUrl();
  const isFormData = options.body instanceof FormData;
  const config = {
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, config);

    if (!response.ok) {
      const text = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(text);
      } catch {
        if (response.status === 500) {
          throw new Error('Server error. Check Rails server logs for details.');
        }
      }
      const msg =
        errorData.message ||
        errorData.error ||
        (Array.isArray(errorData.errors) ? errorData.errors.join(', ') : null) ||
        `HTTP error! status: ${response.status}`;
      throw new Error(msg);
    }

    const raw = await response.text();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch (error) {
    console.error('Public API request failed:', error);
    throw formatApiFetchError(error);
  }
};

export const metaAPI = {
  get: () => publicApiRequest('/meta'),
};

export const adminDemoAPI = {
  reset: () =>
    apiRequest('/admin/demo_reset', {
      method: 'POST',
    }),
};

// Authentication endpoints
export const authAPI = {
  login: (email, password) =>
    apiRequest('/sessions', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (userData) =>
    apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  logout: () =>
    apiRequest('/auth/logout', {
      method: 'DELETE',
    }),

  updateMe: (data) =>
    apiRequest('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteMe: () =>
    apiRequest('/users/me', {
      method: 'DELETE',
    }),
  getLoginHistory: (limit = 20) =>
    apiRequest(`/users/me/login_history?limit=${encodeURIComponent(String(limit))}`),
};

export const passwordResetsAPI = {
  request: (email) =>
    apiRequest('/password_resets', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  complete: (token, password, password_confirmation) =>
    apiRequest('/password_resets', {
      method: 'PATCH',
      body: JSON.stringify({ token, password, password_confirmation }),
    }),
};

export const marketingLeadsAPI = {
  create: ({ email, role_view: roleView, source = 'landing_page', honeypot = '' }) =>
    apiRequest('/marketing_leads', {
      method: 'POST',
      body: JSON.stringify({
        email,
        role_view: roleView,
        source,
        honeypot,
      }),
    }),
};

export const membershipTierConfigsAPI = {
  list: (audience) =>
    apiRequest(`/membership_tier_configs?audience=${encodeURIComponent(audience)}`),
};

/** Current user membership (company or technician profile) — GET/PATCH /membership */
export const membershipsAPI = {
  get: () => apiRequest('/membership'),
  update: ({ membership_level: membershipLevel, success_url: successUrl, cancel_url: cancelUrl }) =>
    apiRequest('/membership', {
      method: 'PATCH',
      body: JSON.stringify({
        membership_level: membershipLevel,
        ...(successUrl ? { success_url: successUrl } : {}),
        ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
      }),
    }),
};

export const licensingSettingsAPI = {
  get: () => apiRequest('/licensing_settings'),
};

export const signupPaymentsAPI = {
  createIntent: ({ email, role, membership_tier: membershipTier }) =>
    apiRequest('/signup_payment_intents', {
      method: 'POST',
      body: JSON.stringify({
        email,
        role,
        membership_tier: membershipTier,
      }),
    }),
};

// Admin CRM (company pipeline + optional link to platform company account)
export const crmAPI = {
  list: () => apiRequest('/admin/crm_leads'),
  listReminders: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== '') qs.set(k, String(v));
    });
    const query = qs.toString();
    return apiRequest(`/admin/crm_leads/reminders${query ? `?${query}` : ''}`);
  },
  get: (id) => apiRequest(`/admin/crm_leads/${id}`),
  create: (data) =>
    apiRequest('/admin/crm_leads', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id, data) =>
    apiRequest(`/admin/crm_leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  merge: (sourceId, data) =>
    apiRequest(`/admin/crm_leads/${sourceId}/merge`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  remove: (id) =>
    apiRequest(`/admin/crm_leads/${id}`, {
      method: 'DELETE',
    }),
  enrichFromUrl: (url) =>
    apiRequest('/admin/crm_leads/enrich_from_url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  searchCompanyAccounts: (q) =>
    apiRequest(`/admin/company_accounts/search?q=${encodeURIComponent(q || '')}`),
  searchCompanies: (q) =>
    apiRequest(`/admin/company_accounts/search_companies?q=${encodeURIComponent(q || '')}`),
  createCompanyAccount: (data) =>
    apiRequest('/admin/company_accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  bulkCrmProvision: (data) =>
    apiRequest('/admin/company_accounts/bulk_crm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  importRows: (rows) =>
    apiRequest('/admin/crm_leads/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),
  bulkDelete: (ids) =>
    apiRequest('/admin/crm_leads/bulk_destroy', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  createNote: (crmLeadId, data) =>
    apiRequest(`/admin/crm_leads/${crmLeadId}/crm_notes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateNote: (crmLeadId, noteId, data) =>
    apiRequest(`/admin/crm_leads/${crmLeadId}/crm_notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  previewEmail: (crmLeadId, data) =>
    apiRequest(`/admin/crm_leads/${crmLeadId}/preview_email`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  sendEmail: (crmLeadId, data) =>
    apiRequest(`/admin/crm_leads/${crmLeadId}/send_email`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// US city autocomplete (Nominatim via Rails) — admin only
export const adminLocationAPI = {
  citySuggestions: (q) =>
    apiRequest(`/admin/location_suggestions?q=${encodeURIComponent(q)}`),
};

/** Address search for job create/edit: Google Places when server has GOOGLE_MAPS_API_KEY, else Nominatim */
export const addressesAPI = {
  suggestions: (q) =>
    apiRequest(`/address_suggestions?q=${encodeURIComponent(q || '')}`),
  resolve: (placeId) =>
    apiRequest(`/address_resolve?place_id=${encodeURIComponent(placeId)}`),
};

export const techPresenceAPI = {
  list: () => apiRequest('/tech_presence_markers'),
};

// Admin user directory + per-user analytics
export const adminUsersAPI = {
  masqueradeStart: (targetUserId) =>
    apiRequest('/admin/masquerade', {
      method: 'POST',
      body: JSON.stringify({ target_user_id: targetUserId }),
    }),
  list: ({ q, role } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (role && role !== 'all') params.set('role', role);
    const qs = params.toString();
    return apiRequest(`/admin/users${qs ? `?${qs}` : ''}`);
  },
  get: (id, period = '7d') =>
    apiRequest(`/admin/users/${id}?period=${encodeURIComponent(period)}`),
  ensureProfile: (id) =>
    apiRequest(`/admin/users/${id}/ensure_profile`, {
      method: 'POST',
    }),
  sendPasswordSetup: (id, { sendEmail = true } = {}) =>
    apiRequest(`/admin/users/${id}/password_setup`, {
      method: 'POST',
      body: JSON.stringify({ send_email: sendEmail }),
    }),
  setPassword: (id, password, passwordConfirmation) =>
    apiRequest(`/admin/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({
        password,
        password_confirmation: passwordConfirmation,
      }),
    }),
  setCompanyMembership: (id, companyProfileId) =>
    apiRequest(`/admin/users/${id}/company_membership`, {
      method: 'PATCH',
      body: JSON.stringify({
        company_profile_id: companyProfileId,
      }),
    }),
  updateProfile: (id, payload) =>
    apiRequest(`/admin/users/${id}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateMembershipPricing: (id, payload) =>
    apiRequest(`/admin/users/${id}/membership_pricing`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  create: (data) => {
    if (data instanceof FormData) {
      return apiRequest('/admin/users', {
        method: 'POST',
        body: data,
      });
    }
    return apiRequest('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  destroy: (id) =>
    apiRequest(`/admin/users/${id}`, {
      method: 'DELETE',
    }),
};

/** Admin: global membership tier pricing (technician vs company audiences) */
export const adminMembershipTierConfigsAPI = {
  list: (audience) =>
    apiRequest(`/admin/membership_tier_configs?audience=${encodeURIComponent(audience)}`),
  create: (payload) =>
    apiRequest('/admin/membership_tier_configs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id, payload) =>
    apiRequest(`/admin/membership_tier_configs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remove: (id) =>
    apiRequest(`/admin/membership_tier_configs/${id}`, {
      method: 'DELETE',
    }),
  transferAssignments: (id, targetTierId) =>
    apiRequest(`/admin/membership_tier_configs/${id}/transfer_assignments`, {
      method: 'POST',
      body: JSON.stringify({ target_tier_id: targetTierId }),
    }),
  /** Creates a monthly recurring Stripe price from the saved tier (paid tiers only, server must have STRIPE secret key) */
  provisionStripe: (id) =>
    apiRequest(`/admin/membership_tier_configs/${id}/provision_stripe`, {
      method: 'POST',
    }),
};

export const adminSimulatedMarkersAPI = {
  list: () => apiRequest('/admin/simulated_technician_markers'),
  create: (payload) =>
    apiRequest('/admin/simulated_technician_markers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id, payload) =>
    apiRequest(`/admin/simulated_technician_markers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remove: (id) =>
    apiRequest(`/admin/simulated_technician_markers/${id}`, {
      method: 'DELETE',
    }),
};

export const adminCouponsAPI = {
  list: () => apiRequest('/admin/coupons'),
  get: (id) => apiRequest(`/admin/coupons/${id}`),
  create: (payload) => apiRequest('/admin/coupons', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id, payload) => apiRequest(`/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (id) => apiRequest(`/admin/coupons/${id}`, { method: 'DELETE' }),
  assignToUser: (payload) => apiRequest('/admin/coupon_assignments', { method: 'POST', body: JSON.stringify(payload) }),
  updateAssignment: (id, payload) => apiRequest(`/admin/coupon_assignments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  removeAssignment: (id) => apiRequest(`/admin/coupon_assignments/${id}`, { method: 'DELETE' }),
};

export const couponsAPI = {
  redeem: (code) => apiRequest('/coupons/redeem', { method: 'POST', body: JSON.stringify({ code }) }),
};

export const jobAlertPreferencesAPI = {
  get: () => apiRequest('/job_alert_preference'),
  update: (payload) => apiRequest('/job_alert_preference', { method: 'PATCH', body: JSON.stringify(payload) }),
};

export const appNotificationsAPI = {
  list: () => apiRequest('/app_notifications'),
  markRead: (id) => apiRequest(`/app_notifications/${id}/mark_read`, { method: 'PATCH' }),
};

export const verificationAPI = {
  getCenter: () => apiRequest('/verification'),
  getBackgroundCheckOptions: (selectedNodeCustomId = null) => {
    const params = new URLSearchParams();
    if (selectedNodeCustomId) params.set('selected_node_custom_id', selectedNodeCustomId);
    const qs = params.toString();
    return apiRequest(`/verification/background_check_options${qs ? `?${qs}` : ''}`);
  },
  startBackgroundCheck: () =>
    apiRequest('/verification/start_background_check', {
      method: 'POST',
    }),
  startBackgroundCheckWithSelection: (payload) =>
    apiRequest('/verification/start_background_check', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  createBackgroundCheckCheckout: () =>
    apiRequest('/verification/create_background_check_checkout', {
      method: 'POST',
    }),
};

export const verificationReferencesAPI = {
  list: () => apiRequest('/verification_references'),
  create: (payload) =>
    apiRequest('/verification_references', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  respond: (token, payload) =>
    apiRequest(`/verification_references/respond/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const adminLicensingSettingsAPI = {
  get: () => apiRequest('/admin/licensing_settings'),
  update: (localOnlyStateCodes) =>
    apiRequest('/admin/licensing_settings', {
      method: 'PATCH',
      body: JSON.stringify({ local_only_state_codes: localOnlyStateCodes }),
    }),
};

export const adminMailtrapAuditAPI = {
  get: () => apiRequest('/admin/mailtrap_audit'),
};

export const adminEmailQaAPI = {
  listTemplates: () => apiRequest('/admin/email_qa/templates'),
  preview: (templateKey, toEmail) => {
    const body = { template_key: templateKey };
    const r = toEmail != null && String(toEmail).trim() !== '';
    if (r) body.to_email = String(toEmail).trim();
    return apiRequest('/admin/email_qa/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  sendOne: (templateKey, confirmation, toEmail) => {
    const body = { template_key: templateKey, confirmation };
    const r = toEmail != null && String(toEmail).trim() !== '';
    if (r) body.to_email = String(toEmail).trim();
    return apiRequest('/admin/email_qa/send', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  sendAll: (confirmation, toEmail) => {
    const body = { confirmation };
    const r = toEmail != null && String(toEmail).trim() !== '';
    if (r) body.to_email = String(toEmail).trim();
    return apiRequest('/admin/email_qa/send_all', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

export const adminReferralsAPI = {
  issueReward: (id) =>
    apiRequest(`/admin/referrals/${id}/issue_reward`, {
      method: 'PATCH',
    }),
};

// Admin platform metrics (dashboard drill-down lists)
export const adminAPI = {
  getPlatformInsights: (category, period = '7d') => {
    const params = new URLSearchParams({ category, period });
    return apiRequest(`/admin/platform_insights?${params}`);
  },
};

// Feedback: POST stores + emails admins; GET lists all (admin only)
export const feedbackAPI = {
  list: () => apiRequest('/feedback'),
  create: ({ kind, body, page_path: pagePath }) =>
    apiRequest('/feedback', {
      method: 'POST',
      body: JSON.stringify({ kind, body, page_path: pagePath }),
    }),
};

export const referralsAPI = {
  create: (data) =>
    apiRequest('/referrals', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Jobs endpoints
export const jobsAPI = {
  getAll: (filters = {}) => {
    const clean = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v != null && v !== '')
    );
    const params = new URLSearchParams(clean);
    return apiRequest(`/jobs?${params}`);
  },
  
  getById: (id) => 
    apiRequest(`/jobs/${id}`),
  
  create: (jobData) => 
    apiRequest('/jobs', {
      method: 'POST',
      body: JSON.stringify(jobData),
    }),
  
  update: (id, jobData) => 
    apiRequest(`/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(jobData),
    }),
  
  delete: (id) => 
    apiRequest(`/jobs/${id}`, {
      method: 'DELETE',
    }),

  claim: (id, payload = {}) =>
    apiRequest(`/jobs/${id}/claim`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deny: (id) =>
    apiRequest(`/jobs/${id}/deny`, {
      method: 'PATCH',
    }),

  finish: (id) =>
    apiRequest(`/jobs/${id}/finish`, {
      method: 'PATCH',
    }),

  extend: (id, { scheduled_end_at }) =>
    apiRequest(`/jobs/${id}/extend`, {
      method: 'PATCH',
      body: JSON.stringify({ scheduled_end_at }),
    }),

  getDashboard: () =>
    apiRequest('/dashboard/jobs'),

  getTechnicianDashboard: () =>
    apiRequest('/dashboard/technician_jobs'),

  getAnalytics: () =>
    apiRequest('/dashboard/analytics'),

  getLocations: () =>
    apiRequest('/jobs/locations'),

  getCounterOffers: (jobId) =>
    apiRequest(`/jobs/${jobId}/counter_offers`),

  createCounterOffer: (jobId, payload) =>
    apiRequest(`/jobs/${jobId}/counter_offers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  acceptCounterOffer: (counterOfferId) =>
    apiRequest(`/counter_offers/${counterOfferId}/accept`, {
      method: 'PATCH',
    }),

  declineCounterOffer: (counterOfferId) =>
    apiRequest(`/counter_offers/${counterOfferId}/decline`, {
      method: 'PATCH',
    }),

  counterCounterOffer: (counterOfferId, payload) =>
    apiRequest(`/counter_offers/${counterOfferId}/counter`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getPublicPreviewByShareToken: (shareToken) =>
    publicApiRequest(`/public/jobs/${encodeURIComponent(shareToken)}`),
};

export const jobIssueReportsAPI = {
  create: (jobId, { body, category }) =>
    apiRequest(`/jobs/${jobId}/issue_reports`, {
      method: 'POST',
      body: JSON.stringify({ body, category: category || 'general' }),
    }),
};

export const savedJobSearchesAPI = {
  list: () => apiRequest('/saved_job_searches'),
  create: (data) =>
    apiRequest('/saved_job_searches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  remove: (id) =>
    apiRequest(`/saved_job_searches/${id}`, {
      method: 'DELETE',
    }),
};

export const jobCounterOffersAPI = {
  listForJob: (jobId) =>
    apiRequest(`/jobs/${jobId}/counter_offers`),
  createForJob: (jobId, payload) =>
    apiRequest(`/jobs/${jobId}/counter_offers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  accept: (id) =>
    apiRequest(`/counter_offers/${id}/accept`, {
      method: 'PATCH',
    }),
  decline: (id) =>
    apiRequest(`/counter_offers/${id}/decline`, {
      method: 'PATCH',
    }),
  counter: (id, payload) =>
    apiRequest(`/counter_offers/${id}/counter`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

export const favoriteTechniciansAPI = {
  list: () => apiRequest('/favorite_technicians'),
  add: (technicianProfileId) =>
    apiRequest('/favorite_technicians', {
      method: 'POST',
      body: JSON.stringify({ technician_profile_id: technicianProfileId }),
    }),
  remove: (technicianProfileId) =>
    apiRequest(`/favorite_technicians/${technicianProfileId}`, {
      method: 'DELETE',
    }),
};

// Payments (Stripe)
export const paymentsAPI = {
  createIntent: (jobId) =>
    apiRequest(`/jobs/${jobId}/create_payment_intent`, {
      method: 'POST',
    }),
};

// Settings (profile + payment setup)
export const settingsAPI = {
  createSetupIntent: () =>
    apiRequest('/settings/create_setup_intent', { method: 'POST' }),
  createConnectAccountLink: (baseUrl) =>
    apiRequest('/settings/create_connect_account_link', {
      method: 'POST',
      body: JSON.stringify({ base_url: baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173') }),
    }),
};

// Job Applications endpoints
export const jobApplicationsAPI = {
  getAll: () => 
    apiRequest('/job_applications'),
  
  getById: (id) => 
    apiRequest(`/job_applications/${id}`),
  
  create: (applicationData) => 
    apiRequest('/job_applications', {
      method: 'POST',
      body: JSON.stringify(applicationData),
    }),
  
  update: (id, applicationData) => 
    apiRequest(`/job_applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(applicationData),
    }),

  accept: (id) =>
    apiRequest(`/job_applications/${id}/accept`, { method: 'PATCH' }),

  deny: (id) =>
    apiRequest(`/job_applications/${id}/deny`, { method: 'PATCH' }),
};

// Documents endpoints
export const documentsAPI = {
  getAll: async () => {
    const payload = await apiRequest('/documents');
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.documents)) return payload.documents;
    return [];
  },
  
  getById: (id) => 
    apiRequest(`/documents/${id}`),
  
  upload: (formData) => 
    apiRequest('/documents', {
      method: 'POST',
      headers: {}, // Let browser set Content-Type for FormData
      body: formData,
    }),
  
  delete: (id) => 
    apiRequest(`/documents/${id}`, {
      method: 'DELETE',
    }),
};

// User profile endpoints
export const profilesAPI = {
  listTechnicians: (filters = {}) => {
    const clean = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v != null && String(v) !== '')
    );
    const query = new URLSearchParams(clean);
    return apiRequest(`/technicians${query.toString() ? `?${query}` : ''}`);
  },
  getTechnicianProfile: () => 
    apiRequest('/technicians/profile'),
  
  getTechnicianById: (id) =>
    apiRequest(`/technicians/${id}`),
  mergeTechnicianProfile: (sourceId, targetTechnicianProfileId, mergeDirection = 'into_target') =>
    apiRequest(`/technicians/${sourceId}/merge`, {
      method: 'POST',
      body: JSON.stringify({
        target_technician_profile_id: targetTechnicianProfileId,
        merge_direction: mergeDirection,
      }),
    }),

  getCompanyProfile: () => 
    apiRequest('/company_profiles/profile'),

  getCompanyById: (id) =>
    apiRequest(`/company_profiles/${id}`),
  mergeCompanyProfile: (sourceId, targetCompanyProfileId, mergeDirection = 'into_target') =>
    apiRequest(`/company_profiles/${sourceId}/merge`, {
      method: 'POST',
      body: JSON.stringify({
        target_company_profile_id: targetCompanyProfileId,
        merge_direction: mergeDirection,
      }),
    }),
  
  updateCompanyProfile: (id, profileData) => {
    const body = profileData instanceof FormData ? profileData : JSON.stringify(profileData);
    return apiRequest(`/company_profiles/${id}`, { method: 'PATCH', body });
  },
  updateTechnicianProfile: (id, profileData) => {
    const body = profileData instanceof FormData ? profileData : JSON.stringify(profileData);
    return apiRequest(`/technicians/${id}`, { method: 'PATCH', body });
  },
};

// Conversations and Messages
function normalizeConversationsPayload(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.conversations)) return data.conversations;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

export const conversationsAPI = {
  getAll: async () => {
    const data = await apiRequest('/conversations');
    return normalizeConversationsPayload(data);
  },
  getById: (id) => apiRequest(`/conversations/${id}`),
  update: (id, data) =>
    apiRequest(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  markRead: (id) =>
    apiRequest(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ mark_read: true }),
    }),
  createForJob: (jobId, technicianProfileId) => {
    const body = technicianProfileId ? { technician_profile_id: technicianProfileId } : {};
    return apiRequest(`/jobs/${jobId}/conversations`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

export const messagesAPI = {
  getByConversation: (conversationId) =>
    apiRequest(`/conversations/${conversationId}/messages`),
  create: (conversationId, content, { internal = false } = {}) =>
    apiRequest(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, internal }),
    }),
};

// Ratings endpoints (reviews after job completion)
export const ratingsAPI = {
  getAll: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return apiRequest(`/ratings?${params}`);
  },

  getById: (id) =>
    apiRequest(`/ratings/${id}`),

  getByJob: (jobId) =>
    apiRequest(`/ratings?job_id=${jobId}`),

  getReviewedJobIds: () =>
    apiRequest('/ratings/reviewed_job_ids'),

  getReviewCategories: (as) =>
    apiRequest(`/ratings/review_categories?as=${as || 'company'}`),

  create: (jobId, data) =>
    apiRequest('/ratings', {
      method: 'POST',
      body: JSON.stringify({
        job_id: jobId,
        score: data.score,
        comment: data.comment || '',
        category_scores: data.category_scores || undefined,
        would_hire_again: data.would_hire_again,
        would_recommend: data.would_recommend,
        on_time_status: data.on_time_status,
        request_again: data.request_again,
        would_work_again: data.would_work_again,
        payment_on_time: data.payment_on_time,
        job_description_match: data.job_description_match,
      }),
    }),
};

export const adminReviewsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && String(v) !== ''));
    return apiRequest(`/admin/reviews${q.toString() ? `?${q}` : ''}`);
  },
  flags: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && String(v) !== ''));
    return apiRequest(`/admin/reviews/flags${q.toString() ? `?${q}` : ''}`);
  },
  analytics: () => apiRequest('/admin/reviews/analytics'),
  updateFlag: (id, payload) =>
    apiRequest(`/admin/review_flags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  hide: (id, notes = '') =>
    apiRequest(`/ratings/${id}/hide`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),
  restore: (id, notes = '') =>
    apiRequest(`/ratings/${id}/restore`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),
  moderationQueue: () => apiRequest('/ratings/moderation_queue'),
};

export const adminTrustSafetyAPI = {
  dashboard: () => apiRequest('/admin/trust_safety/dashboard'),
  overrideBackgroundCheck: (id, payload) =>
    apiRequest(`/admin/trust_safety/background_checks/${id}/override`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  reviewReference: (id, payload) =>
    apiRequest(`/admin/trust_safety/references/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  reviewDocument: (id, payload) =>
    apiRequest(`/admin/trust_safety/documents/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

export default apiRequest; 