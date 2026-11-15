import { apiRequest } from './client';

export type AdminRoleFilter = 'all' | 'company' | 'technician';

export interface AdminUserListItem {
  id: number;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  user_name?: string | null;
  role: 'company' | 'technician' | 'admin';
  created_at?: string;
  label?: string;
  company_name?: string | null;
  technician_profile_id?: number | null;
  company_profile_id?: number | null;
  admin_starred?: boolean;
}

export async function listAdminUsers(query = '', role: AdminRoleFilter = 'all') {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (role !== 'all') params.set('role', role);
  const qs = params.toString();
  const data = await apiRequest<{ users: AdminUserListItem[] }>(`/admin/users${qs ? `?${qs}` : ''}`);
  return data?.users || [];
}

export async function getAdminUser(id: number, period = '7d') {
  const data = await apiRequest<Record<string, unknown>>(`/admin/users/${id}?period=${encodeURIComponent(period)}`);
  return data || {};
}

export async function sendAdminPasswordSetup(id: number) {
  return apiRequest<{ message?: string; reset_url?: string }>(`/admin/users/${id}/password_setup`, {
    method: 'POST',
    body: JSON.stringify({ send_email: true }),
  });
}

export async function ensureAdminUserProfile(id: number) {
  return apiRequest<{ message?: string; profile_type?: string; profile_id?: number }>(
    `/admin/users/${id}/ensure_profile`,
    { method: 'POST' }
  );
}

export async function setAdminUserPassword(
  id: number,
  password: string,
  passwordConfirmation: string
) {
  return apiRequest<{ message?: string }>(`/admin/users/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({
      password,
      password_confirmation: passwordConfirmation,
    }),
  });
}

export async function updateAdminUserProfile(id: number, payload: Record<string, unknown>) {
  return apiRequest<{ message?: string }>(`/admin/users/${id}/profile`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminMembershipPricing(id: number, payload: Record<string, unknown>) {
  return apiRequest<{ message?: string }>(`/admin/users/${id}/membership_pricing`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function setAdminCompanyMembership(id: number, companyProfileId: number) {
  return apiRequest<{ message?: string }>(`/admin/users/${id}/company_membership`, {
    method: 'PATCH',
    body: JSON.stringify({ company_profile_id: companyProfileId }),
  });
}

export async function setAdminUserStarred(id: number, adminStarred: boolean) {
  return apiRequest<{ message?: string; user?: AdminUserListItem }>(`/admin/users/${id}/admin_star`, {
    method: 'PATCH',
    body: JSON.stringify({ admin_starred: !!adminStarred }),
  });
}

export async function deleteAdminUser(id: number) {
  return apiRequest<null>(`/admin/users/${id}`, {
    method: 'DELETE',
  });
}

export async function startMasquerade(targetUserId: number) {
  return apiRequest<{ token: string; user: Record<string, unknown> }>('/admin/masquerade', {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId }),
  });
}

export async function createAdminUser(payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listCrmLeads() {
  const data = await apiRequest<{ crm_leads: Record<string, unknown>[] }>('/admin/crm_leads');
  return data?.crm_leads || [];
}

export async function getCrmLead(id: number) {
  const data = await apiRequest<{
    crm_lead?: Record<string, unknown>;
    crm_notes?: Record<string, unknown>[];
  }>(`/admin/crm_leads/${id}`);
  return {
    crmLead: data?.crm_lead || {},
    crmNotes: data?.crm_notes || [],
  };
}

export async function createCrmLead(payload: Record<string, unknown>) {
  return apiRequest<{ crm_lead?: Record<string, unknown> }>('/admin/crm_leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCrmLead(id: number, payload: Record<string, unknown>) {
  return apiRequest<{ crm_lead?: Record<string, unknown> }>(`/admin/crm_leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function createCrmNote(crmLeadId: number, payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/crm_leads/${crmLeadId}/crm_notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCrmNote(
  crmLeadId: number,
  noteId: number,
  payload: Record<string, unknown>
) {
  return apiRequest<Record<string, unknown>>(`/admin/crm_leads/${crmLeadId}/crm_notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getPlatformInsight(category: string, period = '7d') {
  return apiRequest<Record<string, unknown>>(
    `/admin/platform_insights?category=${encodeURIComponent(category)}&period=${encodeURIComponent(period)}`
  );
}
