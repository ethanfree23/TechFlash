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
const MSQ_CURRENT_USER = () => key('tf_masq_current_user');

function decodeBase64Url(segment) {
  const b64 = String(segment || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return atob(b64 + pad);
}

function parseTokenPayload(token) {
  if (!token) return null;
  try {
    const parts = String(token).split('.');
    if (parts.length < 2 || !parts[1]) return null;
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
}

function tokenIsMasquerade(token) {
  const payload = parseTokenPayload(token);
  return payload?.masquerade === true;
}

function tokenUserId(token) {
  const payload = parseTokenPayload(token);
  if (!payload) return null;
  const id = payload.user_id ?? payload.userId;
  return id == null || id === '' ? null : id;
}

function idsMatch(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return String(a) === String(b);
}

function readStoredJson(storage, storageKey) {
  const raw = storage.getItem(storageKey);
  if (!raw || raw === 'undefined') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStoredUser(user) {
  localStorage.setItem(USER_KEY(), JSON.stringify(user));
}

function userMatchesToken(user, token) {
  const jwtId = tokenUserId(token);
  if (jwtId == null) return true;
  if (!user || user.id == null || user.id === '') return false;
  return idsMatch(user.id, jwtId);
}

function isAdminUser(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

function readMasqueradeSnapshot() {
  return readStoredJson(sessionStorage, MSQ_CURRENT_USER());
}

function writeMasqueradeSnapshot(user) {
  if (!user) {
    sessionStorage.removeItem(MSQ_CURRENT_USER());
    return;
  }
  sessionStorage.setItem(MSQ_CURRENT_USER(), JSON.stringify(user));
}

export const auth = {
  coerceTargetUserId: (value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  },

  jwtUserId: () => tokenUserId(localStorage.getItem(TOKEN_KEY())),

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
    const payload = parseTokenPayload(token);
    if (!payload) return false;
    if (!payload.exp) return true;
    return payload.exp * 1000 > Date.now();
  },

  isMasquerading: () => {
    const token = localStorage.getItem(TOKEN_KEY());
    return tokenIsMasquerade(token);
  },

  hasMasqueradeBackup: () => {
    return Boolean(sessionStorage.getItem(MSQ_PREV_TOKEN()) && sessionStorage.getItem(MSQ_PREV_USER()));
  },

  getMasqueradeTargetUser: () => {
    const snap = readMasqueradeSnapshot();
    if (snap && !isAdminUser(snap)) return snap;
    return null;
  },

  clearMasqueradeArtifacts: () => {
    sessionStorage.removeItem(MSQ_PREV_TOKEN());
    sessionStorage.removeItem(MSQ_PREV_USER());
    sessionStorage.removeItem(MSQ_CURRENT_USER());
  },

  enterMasquerade: (newToken, newUser) => {
    if (!newToken || !newUser) return false;
    const payload = parseTokenPayload(newToken);
    if (!payload || payload.masquerade !== true) return false;
    if (isAdminUser(newUser)) return false;
    if (!userMatchesToken(newUser, newToken)) return false;

    const prevToken = localStorage.getItem(TOKEN_KEY());
    const prevUser = localStorage.getItem(USER_KEY());
    const alreadyMasquerading = tokenIsMasquerade(prevToken);
    // Preserve the original admin snapshot across repeated masquerades.
    if (!alreadyMasquerading) {
      if (prevToken) sessionStorage.setItem(MSQ_PREV_TOKEN(), prevToken);
      if (prevUser) sessionStorage.setItem(MSQ_PREV_USER(), prevUser);
    }
    localStorage.setItem(TOKEN_KEY(), newToken);
    writeStoredUser(newUser);
    writeMasqueradeSnapshot(newUser);
    return true;
  },

  exitMasquerade: () => {
    const prevToken = sessionStorage.getItem(MSQ_PREV_TOKEN());
    const prevUser = sessionStorage.getItem(MSQ_PREV_USER());
    auth.clearMasqueradeArtifacts();
    if (prevToken && prevUser) {
      localStorage.setItem(TOKEN_KEY(), prevToken);
      localStorage.setItem(USER_KEY(), prevUser);
      return true;
    }
    // Defensive fallback: never keep a half-restored session.
    localStorage.removeItem(TOKEN_KEY());
    localStorage.removeItem(USER_KEY());
    return false;
  },

  setUser: (user) => {
    if (user === undefined || user === null) {
      localStorage.removeItem(USER_KEY());
      return true;
    }
    const token = localStorage.getItem(TOKEN_KEY());
    if (token && !userMatchesToken(user, token)) return false;
    writeStoredUser(user);
    if (tokenIsMasquerade(token) && !isAdminUser(user)) {
      writeMasqueradeSnapshot(user);
    }
    return true;
  },

  getUser: () => {
    const token = localStorage.getItem(TOKEN_KEY());
    const stored = readStoredJson(localStorage, USER_KEY());
    if (userMatchesToken(stored, token)) return stored;

    if (tokenIsMasquerade(token)) {
      const snap = readMasqueradeSnapshot();
      if (snap && userMatchesToken(snap, token) && !isAdminUser(snap)) {
        writeStoredUser(snap);
        return snap;
      }
      return null;
    }

    return stored;
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
    auth.clearMasqueradeArtifacts();
  },

  getAuthHeader: () => {
    const token = auth.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

export default auth;
