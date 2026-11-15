import type { User } from '../types/user';
import { apiRequest } from './client';

export interface LoginResponse {
  token: string;
  user: User;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    token: null,
  });
  if (!data?.token || !data.user) {
    throw new Error('Invalid login response');
  }
  return data;
}

export interface RegisterPayload {
  email: string;
  password: string;
  password_confirmation: string;
  first_name: string;
  last_name: string;
  phone: string;
  city: string;
  state: string;
  zip_code: string;
  address?: string;
  country?: string;
  role: 'technician' | 'company';
  membership_tier: string;
  honeypot?: string;
  electrical_license_number?: string;
  /** Required for technician signup (API validates against TradeCatalog). */
  trade_type?: string;
  /** Required for technician signup: Apprentice | Journeyman | Master. */
  skill_class?: string;
  /** Required for company signup. */
  company_name?: string;
  /** Required for company signup (trade/industry label). */
  industry?: string;
}

export async function register(payload: RegisterPayload): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/users', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      country: payload.country || 'United States',
      membership_tier: payload.membership_tier || 'basic',
      honeypot: payload.honeypot ?? '',
    }),
    token: null,
  });
  if (!data?.token || !data.user) {
    throw new Error('Invalid registration response');
  }
  return data;
}
