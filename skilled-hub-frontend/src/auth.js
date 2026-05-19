// Authentication helper for JWT token management
import { isDemoPath } from './utils/demoMode.js';

function useDemoStorage() {
  if (import.meta.env?.VITE_DEMO_MODE === 'true') return true;
  return isDemoPath();
}

function key(name) {
  return useDemoStorage() ? `demo_${name}` : name;
}

const TOKEN_KEY = () => key('token');
const USER_KEY = () => key('user');
const MSQ_PREV_TOKEN = () => key('tf_masq_prev_token');
const MSQ_PREV_USER = () => key('tf_masq_prev_user');

export const auth = {
  setToken: (token) => {
    localStorage.setItem(TOKEN_KEY(), token);
  },

  getToken: () => {
    return localStorage.getItem(TOKEN_KEY());
  },

  removeToken: () => {
    localStorage.removeItem(TOKEN_KEY());
  },

  isAuthenticated: () => {
    const token = localStorage.getItem(TOKEN_KEY());
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return true;
      return payload.exp * 1000 > Date.now();
    } catch (error) {
      console.error('Error parsing token:', error);
      return false;
    }
  },

  isMasquerading: () => {
    const token = localStorage.getItem(TOKEN_KEY());
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.masquerade === true;
    } catch {
      return false;
    }
  },

  enterMasquerade: (newToken, newUser) => {
    const prevToken = localStorage.getItem(TOKEN_KEY());
    const prevUser = localStorage.getItem(USER_KEY());
    if (prevToken) sessionStorage.setItem(MSQ_PREV_TOKEN(), prevToken);
    if (prevUser) sessionStorage.setItem(MSQ_PREV_USER(), prevUser);
    localStorage.setItem(TOKEN_KEY(), newToken);
    localStorage.setItem(USER_KEY(), JSON.stringify(newUser));
  },

  exitMasquerade: () => {
    const prevToken = sessionStorage.getItem(MSQ_PREV_TOKEN());
    const prevUser = sessionStorage.getItem(MSQ_PREV_USER());
    sessionStorage.removeItem(MSQ_PREV_TOKEN());
    sessionStorage.removeItem(MSQ_PREV_USER());
    if (prevToken) {
      localStorage.setItem(TOKEN_KEY(), prevToken);
    } else {
      localStorage.removeItem(TOKEN_KEY());
    }
    if (prevUser) {
      localStorage.setItem(USER_KEY(), prevUser);
    } else {
      localStorage.removeItem(USER_KEY());
    }
  },

  setUser: (user) => {
    if (user === undefined || user === null) {
      localStorage.removeItem(USER_KEY());
    } else {
      localStorage.setItem(USER_KEY(), JSON.stringify(user));
    }
  },

  getUser: () => {
    const user = localStorage.getItem(USER_KEY());
    if (!user || user === 'undefined') return null;
    try {
      return JSON.parse(user);
    } catch {
      return null;
    }
  },

  removeUser: () => {
    localStorage.removeItem(USER_KEY());
  },

  getUserRole: () => {
    const user = auth.getUser();
    return user ? user.role : null;
  },

  hasRole: (role) => {
    const userRole = auth.getUserRole();
    return userRole === role;
  },

  isTechnician: () => {
    return auth.hasRole('technician');
  },

  isCompany: () => {
    return auth.hasRole('company');
  },

  isAdmin: () => {
    return auth.hasRole('admin');
  },

  logout: () => {
    auth.removeToken();
    localStorage.removeItem(USER_KEY());
    sessionStorage.removeItem(MSQ_PREV_TOKEN());
    sessionStorage.removeItem(MSQ_PREV_USER());
  },

  getAuthHeader: () => {
    const token = auth.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

export default auth;
