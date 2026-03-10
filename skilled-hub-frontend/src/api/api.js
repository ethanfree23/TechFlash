// API helper functions for interacting with the Rails API
const API_BASE_URL = 'http://localhost:3000/api/v1';

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
      const msg = errorData.message || errorData.error || `HTTP error! status: ${response.status}`;
      throw new Error(msg);
    }
    
    return await response.json();
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
};

// Jobs endpoints
export const jobsAPI = {
  getAll: (filters = {}) => {
    const params = new URLSearchParams(filters);
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

  accept: (id, { payment_intent_id } = {}) =>
    apiRequest(`/jobs/${id}/accept`, {
      method: 'PATCH',
      body: JSON.stringify({ payment_intent_id }),
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

  getLocations: () =>
    apiRequest('/jobs/locations'),
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

  getCompanyProfile: () => 
    apiRequest('/company_profiles/profile'),

  getCompanyById: (id) =>
    apiRequest(`/company_profiles/${id}`),
  
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
export const conversationsAPI = {
  getAll: () => apiRequest('/conversations'),
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