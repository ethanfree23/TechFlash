import { apiRequest } from './client';

export async function adminListTierConfigs(audience: string) {
  const data = await apiRequest<{ membership_tier_configs?: Record<string, unknown>[] }>(
    `/admin/membership_tier_configs?audience=${encodeURIComponent(audience)}`
  );
  return Array.isArray(data?.membership_tier_configs) ? data.membership_tier_configs : [];
}

export async function adminCreateTierConfig(payload: Record<string, unknown>) {
  return apiRequest<{ membership_tier_config?: Record<string, unknown> }>('/admin/membership_tier_configs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateTierConfig(id: number, payload: Record<string, unknown>) {
  return apiRequest<{ membership_tier_config?: Record<string, unknown> }>(
    `/admin/membership_tier_configs/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function adminRemoveTierConfig(id: number) {
  return apiRequest<null>(`/admin/membership_tier_configs/${id}`, { method: 'DELETE' });
}

export async function adminProvisionStripe(id: number) {
  return apiRequest<Record<string, unknown>>(`/admin/membership_tier_configs/${id}/provision_stripe`, {
    method: 'POST',
  });
}

export async function adminGetLicensingSettings() {
  return apiRequest<{ local_only_state_codes?: string[] }>('/admin/licensing_settings');
}

export async function adminUpdateLicensingSettings(localOnlyStateCodes: string[]) {
  return apiRequest<Record<string, unknown>>('/admin/licensing_settings', {
    method: 'PATCH',
    body: JSON.stringify({ local_only_state_codes: localOnlyStateCodes }),
  });
}

export async function adminMailtrapAudit() {
  return apiRequest<Record<string, unknown>>('/admin/mailtrap_audit');
}

export async function adminEmailQaListTemplates() {
  const data = await apiRequest<{ templates?: Record<string, unknown>[] }>('/admin/email_qa/templates');
  return Array.isArray(data?.templates) ? data.templates : [];
}

export async function adminEmailQaSend(templateKey: string, confirmation: string, toEmail?: string) {
  return apiRequest<Record<string, unknown>>('/admin/email_qa/send', {
    method: 'POST',
    body: JSON.stringify({
      template_key: templateKey,
      confirmation,
      ...(toEmail?.trim() ? { to_email: toEmail.trim() } : {}),
    }),
  });
}

export async function adminEmailQaSendAll(confirmation: string, toEmail?: string) {
  return apiRequest<Record<string, unknown>>('/admin/email_qa/send_all', {
    method: 'POST',
    body: JSON.stringify({
      confirmation,
      ...(toEmail?.trim() ? { to_email: toEmail.trim() } : {}),
    }),
  });
}

export async function adminListCoupons() {
  const data = await apiRequest<{ coupons?: Record<string, unknown>[] }>('/admin/coupons');
  return Array.isArray(data?.coupons) ? data.coupons : [];
}

export async function adminCreateCoupon(payload: Record<string, unknown>) {
  return apiRequest<{ coupon?: Record<string, unknown> }>('/admin/coupons', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateCoupon(id: number, payload: Record<string, unknown>) {
  return apiRequest<{ coupon?: Record<string, unknown> }>(`/admin/coupons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function adminDeleteCoupon(id: number) {
  return apiRequest<null>(`/admin/coupons/${id}`, { method: 'DELETE' });
}

export async function adminAssignCoupon(payload: {
  coupon_id: number;
  user_id: number;
  status?: string;
  auto_renew?: boolean;
}) {
  return apiRequest<Record<string, unknown>>('/admin/coupon_assignments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adminListSimulatedMarkers() {
  const data = await apiRequest<{ simulated_technician_markers?: Record<string, unknown>[] }>(
    '/admin/simulated_technician_markers'
  );
  return Array.isArray(data?.simulated_technician_markers) ? data.simulated_technician_markers : [];
}

export async function adminCreateSimulatedMarker(payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>('/admin/simulated_technician_markers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateSimulatedMarker(id: number, payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/admin/simulated_technician_markers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function adminDeleteSimulatedMarker(id: number) {
  return apiRequest<null>(`/admin/simulated_technician_markers/${id}`, { method: 'DELETE' });
}
