import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'token';

export class ApiError extends Error {
  status: number;

  /**
   * Parsed error body. Endpoints that return a machine-readable `code` (such as
   * the assessment endpoints, which distinguish "time is up" from "bad
   * payload") need it to decide what to show, not just the message.
   */
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T | null> {
  const { token: tokenOverride, ...fetchOpts } = options;
  const token =
    tokenOverride !== undefined ? tokenOverride : await getStoredToken();

  const isFormData = fetchOpts.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fetchOpts.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOpts,
    headers,
  });

  const raw = await response.text();

  if (!response.ok) {
    let errorData: Record<string, unknown> = {};
    try {
      errorData = raw ? JSON.parse(raw) : {};
    } catch {
      /* HTML or plain text */
    }
    const msg =
      (typeof errorData.message === 'string' && errorData.message) ||
      (typeof errorData.error === 'string' && errorData.error) ||
      (Array.isArray(errorData.errors)
        ? errorData.errors.join(', ')
        : null) ||
      raw?.slice(0, 200) ||
      `HTTP ${response.status}`;
    throw new ApiError(msg, response.status, errorData);
  }

  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}
