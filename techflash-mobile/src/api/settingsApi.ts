import { Linking } from 'react-native';
import type { User } from '../types/user';
import { apiRequest } from './client';

export async function updateMe(payload: Record<string, unknown>) {
  return apiRequest<{ user?: User }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteMe() {
  return apiRequest<null>('/users/me', {
    method: 'DELETE',
  });
}

export async function listBlockedUsers() {
  return apiRequest<{ blocked_users?: Array<Record<string, unknown>> }>('/users/blocks');
}

export async function blockUser(blockedUserId: number) {
  return apiRequest<{ blocked_user_ids?: number[] }>('/users/blocks', {
    method: 'POST',
    body: JSON.stringify({ blocked_user_id: blockedUserId }),
  });
}

export async function unblockUser(blockedUserId: number) {
  return apiRequest<{ blocked_user_ids?: number[] }>(`/users/blocks/${blockedUserId}`, {
    method: 'DELETE',
  });
}

export async function createCardSetupIntent() {
  return apiRequest<{ client_secret?: string }>('/settings/create_setup_intent', {
    method: 'POST',
  });
}

export async function getTechnicianProfile() {
  return apiRequest<Record<string, unknown>>('/technicians/profile');
}

export async function getCompanyProfile() {
  return apiRequest<Record<string, unknown>>('/company_profiles/profile');
}

export async function updateTechnicianProfile(id: number, payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/technicians/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateCompanyProfile(id: number, payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/company_profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getMembership() {
  return apiRequest<Record<string, unknown>>('/membership');
}

export async function updateMembership(payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>('/membership', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function openMembershipCheckout(
  membershipLevel: string,
  successUrl: string,
  cancelUrl: string
) {
  const res = await updateMembership({
    membership_level: membershipLevel,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  const checkout = (res?.checkout || {}) as Record<string, unknown>;
  const url = String(checkout.url || '');
  if (url) await Linking.openURL(url);
  return res;
}

export async function createConnectAccountLink(baseUrl: string) {
  return apiRequest<{ url?: string }>('/settings/create_connect_account_link', {
    method: 'POST',
    body: JSON.stringify({ base_url: baseUrl }),
  });
}
