// API helper functions for interacting with the Rails API
const isProduction = typeof window !== 'undefined' && (window.location.hostname === 'techflash.app' || window.location.hostname === 'www.techflash.app');
const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || (isProduction ? 'https://skilledhub-production.up.railway.app/api/v1' : 'http://localhost:3000/api/v1');

// Helper function to make API requests
const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
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
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
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
      throw new Error(msg);
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
    throw error;
  }
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
  remove: (id) =>
    apiRequest(`/admin/crm_leads/${id}`, {
      method: 'DELETE',
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
  /** Creates a monthly recurring Stripe price from the saved tier (paid tiers only, server must have STRIPE secret key) */
  provisionStripe: (id) =>
    apiRequest(`/admin/membership_tier_configs/${id}/provision_stripe`, {
      method: 'POST',
    }),
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

  claim: (id) =>
    apiRequest(`/jobs/${id}/claim`, {
      method: 'PATCH',
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
  getAll: () => 
    apiRequest('/documents'),
  
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
    return apiRequest(`/company_profiles/${id}`, { method: 'PUT', body });
  },
  updateTechnicianProfile: (id, profileData) => {
    const body = profileData instanceof FormData ? profileData : JSON.stringify(profileData);
    return apiRequest(`/technicians/${id}`, { method: 'PUT', body });
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
  create: (conversationId, content) =>
    apiRequest(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
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
      }),
    }),
};

export default apiRequest; 