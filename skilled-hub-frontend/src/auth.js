// Authentication helper for JWT token management
const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const MSQ_PREV_TOKEN = 'tf_masq_prev_token';
const MSQ_PREV_USER = 'tf_masq_prev_user';

export const auth = {
  // Store JWT token in localStorage
  setToken: (token) => {
    localStorage.setItem(TOKEN_KEY, token);
  },

  // Get JWT token from localStorage
  getToken: () => {
    return localStorage.getItem(TOKEN_KEY);
  },

  // Remove JWT token from localStorage
  removeToken: () => {
    localStorage.removeItem(TOKEN_KEY);
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    
    // Check if token is expired (if exp claim exists)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return true; // No expiration = token valid
      return payload.exp * 1000 > Date.now();
    } catch (error) {
      console.error('Error parsing token:', error);
      return false;
    }
  },

  /** True when current JWT is an admin masquerade session (acts as another user). */
  isMasquerading: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.masquerade === true;
    } catch {
      return false;
    }
  },

  /** Save admin session and switch to masquerade token + user (then reload or navigate). */
  enterMasquerade: (newToken, newUser) => {
    const prevToken = localStorage.getItem(TOKEN_KEY);
    const prevUser = localStorage.getItem(USER_KEY);
    if (prevToken) sessionStorage.setItem(MSQ_PREV_TOKEN, prevToken);
    if (prevUser) sessionStorage.setItem(MSQ_PREV_USER, prevUser);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  },

  /** Restore admin session after masquerade. */
  exitMasquerade: () => {
    const prevToken = sessionStorage.getItem(MSQ_PREV_TOKEN);
    const prevUser = sessionStorage.getItem(MSQ_PREV_USER);
    sessionStorage.removeItem(MSQ_PREV_TOKEN);
    sessionStorage.removeItem(MSQ_PREV_USER);
    if (prevToken) {
      localStorage.setItem(TOKEN_KEY, prevToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    if (prevUser) {
      localStorage.setItem(USER_KEY, prevUser);
    } else {
      localStorage.removeItem(USER_KEY);
    }
  },

  // Store user data in localStorage
  setUser: (user) => {
    if (user === undefined || user === null) {
      localStorage.removeItem(USER_KEY);
    } else {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  },

  // Get user data from localStorage
  getUser: () => {
    const user = localStorage.getItem(USER_KEY);
    if (!user || user === "undefined") return null;
    try {
      return JSON.parse(user);
    } catch {
      return null;
    }
  },

  // Remove user data from localStorage
  removeUser: () => {
    localStorage.removeItem(USER_KEY);
  },

  // Get user role
  getUserRole: () => {
    const user = auth.getUser();
    return user ? user.role : null;
  },

  // Check if user has specific role
  hasRole: (role) => {
    const userRole = auth.getUserRole();
    return userRole === role;
  },

  // Check if user is a technician
  isTechnician: () => {
    return auth.hasRole('technician');
  },

  // Check if user is a company
  isCompany: () => {
    return auth.hasRole('company');
  },

  // Check if user is an admin
  isAdmin: () => {
    return auth.hasRole('admin');
  },

  // Logout user (clear all auth data)
  logout: () => {
    auth.removeToken();
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(MSQ_PREV_TOKEN);
    sessionStorage.removeItem(MSQ_PREV_USER);
  },

  // Get authorization header for API requests
  getAuthHeader: () => {
    const token = auth.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  },
};

export default auth; 