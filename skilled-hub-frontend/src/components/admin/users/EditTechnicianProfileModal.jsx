import React, { useEffect, useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { adminUsersAPI } from '../../../api/api';
import { TRADE_OPTIONS } from '../../../constants/trades';
import {
  technicianClassSelectOptions,
  technicianClassLabel,
  technicianClassSlug,
} from '../../../constants/technicianClass';
import { formatPhoneInput } from '../../../utils/phone';
import { mediaUrlWithCacheBust, resolveMediaUrl } from '../../../utils/mediaUrl';

const EMPTY_REFERENCE = { id: null, full_name: '', email: '', phone: '', company_name: '' };

function padReferences(list) {
  const rows = Array.isArray(list) ? list.slice(0, 3).map((ref) => ({
    id: ref.id || null,
    full_name: ref.full_name || '',
    email: ref.email || '',
    phone: ref.phone || '',
    company_name: ref.company_name || '',
  })) : [];
  while (rows.length < 3) rows.push({ ...EMPTY_REFERENCE });
  return rows;
}

function dollarsFromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return '';
  return (n / 100).toFixed(2);
}

function centsFromDollars(value) {
  const dollars = parseFloat(String(value || '').trim());
  if (!Number.isFinite(dollars) || dollars < 0) return 0;
  return Math.max(0, Math.round(dollars * 100));
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function inputClass() {
  return 'w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-tf-blue/20 focus:border-tf-blue';
}

function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</h4>
      {children}
    </section>
  );
}

export default function EditTechnicianProfileModal({
  isOpen,
  userId,
  detail,
  onClose,
  onSaved,
}) {
  const profile = detail?.user?.profile;
  const user = detail?.user;
  const [form, setForm] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [licenseFile, setLicenseFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOpen || !user) {
      setForm(null);
      setAvatarFile(null);
      setLicenseFile(null);
      setError('');
      setSuccess('');
      return undefined;
    }
    const latestLicense = (profile?.trade_licenses || [])[0] || {};
    setForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || profile?.phone || '',
      zip_code: profile?.zip_code || '',
      trade_type: profile?.trade_type || '',
      skill_class: technicianClassSlug(profile?.skill_class || ''),
      experience_years: profile?.experience_years != null ? String(profile.experience_years) : '',
      license_document_number: latestLicense.document_number || '',
      license_issuer: latestLicense.issuer || '',
      min_hourly_rate_dollars: dollarsFromCents(profile?.min_hourly_rate_cents),
      max_distance_miles: profile?.max_distance_miles != null ? String(profile.max_distance_miles) : '200',
      references: padReferences(profile?.references),
    });
    setAvatarFile(null);
    setLicenseFile(null);
    return undefined;
  }, [isOpen, user, profile]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, saving, onClose]);

  const currentAvatarUrl = useMemo(() => {
    if (avatarPreview) return avatarPreview;
    if (!profile?.avatar_url) return null;
    return mediaUrlWithCacheBust(profile.avatar_url, profile.updated_at);
  }, [avatarPreview, profile?.avatar_url, profile?.updated_at]);

  const currentLicense = (profile?.trade_licenses || [])[0] || null;
  const currentLicenseUrl = currentLicense?.file_url ? resolveMediaUrl(currentLicense.file_url) : null;
  const tradeOptions = useMemo(() => {
    const current = String(form?.trade_type || '').trim();
    if (current && !TRADE_OPTIONS.some((opt) => opt.toLowerCase() === current.toLowerCase())) {
      return [current, ...TRADE_OPTIONS];
    }
    return TRADE_OPTIONS;
  }, [form?.trade_type]);

  if (!isOpen) return null;

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const setReference = (index, patch) => {
    setForm((prev) => {
      const next = [...prev.references];
      next[index] = { ...next[index], ...patch };
      return { ...prev, references: next };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!userId || !form || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const miles = Number(form.max_distance_miles);
      if (!Number.isFinite(miles) || miles <= 0) {
        throw new Error('Travel radius must be a number greater than 0.');
      }
      const payload = new FormData();
      payload.append('first_name', form.first_name.trim());
      payload.append('last_name', form.last_name.trim());
      payload.append('email', form.email.trim());
      payload.append('account_phone', formatPhoneInput(form.phone.trim()));
      payload.append('phone', formatPhoneInput(form.phone.trim()));
      payload.append('zip_code', form.zip_code.trim());
      payload.append('trade_type', form.trade_type.trim());
      payload.append('skill_class', form.skill_class.trim());
      payload.append(
        'experience_years',
        form.experience_years === '' ? '' : String(parseInt(form.experience_years, 10) || 0)
      );
      payload.append('min_hourly_rate_cents', String(centsFromDollars(form.min_hourly_rate_dollars)));
      payload.append('max_distance_miles', String(Math.round(miles)));
      payload.append('license_document_number', form.license_document_number.trim());
      payload.append('license_issuer', form.license_issuer.trim());
      payload.append(
        'references',
        JSON.stringify(
          form.references.map((ref) => ({
            id: ref.id || undefined,
            full_name: ref.full_name.trim(),
            email: ref.email.trim(),
            phone: ref.phone.trim(),
            company_name: ref.company_name.trim(),
          }))
        )
      );
      if (avatarFile) payload.append('avatar', avatarFile);
      if (licenseFile) payload.append('license_file', licenseFile);

      const res = await adminUsersAPI.updateProfile(userId, payload);
      setSuccess('Profile saved. Technician-facing settings now show these values.');
      setAvatarFile(null);
      setLicenseFile(null);
      onSaved?.(res);
    } catch (err) {
      const details = Array.isArray(err?.details?.errors) ? err.details.errors.join(' ') : '';
      setError(details || err.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-3 sm:p-6">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => !saving && onClose?.()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit technician profile"
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Edit profile</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {user?.first_name || user?.last_name
                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                : user?.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        {!form ? (
          <p className="p-6 text-sm text-slate-500">Loading technician profile…</p>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {success}
                </div>
              )}

              <Section title="Contact">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="First name">
                    <input className={inputClass()} value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} />
                  </Field>
                  <Field label="Last name">
                    <input className={inputClass()} value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} />
                  </Field>
                  <Field label="Email">
                    <input type="email" className={inputClass()} value={form.email} onChange={(e) => set({ email: e.target.value })} />
                  </Field>
                  <Field label="Phone">
                    <input
                      className={inputClass()}
                      value={form.phone}
                      onChange={(e) => set({ phone: formatPhoneInput(e.target.value) })}
                    />
                  </Field>
                  <Field label="Home ZIP code">
                    <input className={inputClass()} value={form.zip_code} onChange={(e) => set({ zip_code: e.target.value })} />
                  </Field>
                </div>
              </Section>

              <Section title="Trade">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Field label="Primary trade">
                    <select className={inputClass()} value={form.trade_type} onChange={(e) => set({ trade_type: e.target.value })}>
                      <option value="">Select trade</option>
                      {tradeOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Trade class / level">
                    <select className={inputClass()} value={form.skill_class} onChange={(e) => set({ skill_class: e.target.value })}>
                      <option value="">Select class</option>
                      {technicianClassSelectOptions(form.skill_class).map((opt) => (
                        <option key={opt} value={opt}>{technicianClassLabel(opt)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Years of experience">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      className={inputClass()}
                      value={form.experience_years}
                      onChange={(e) => set({ experience_years: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Verification & photo">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Profile photo</p>
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-full overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                        {currentAvatarUrl ? (
                          <img src={currentAvatarUrl} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[10px] text-slate-400">None</div>
                        )}
                      </div>
                      <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                        />
                        {avatarFile ? 'Change photo' : 'Upload / replace'}
                      </label>
                    </div>
                    {avatarFile && <p className="text-[11px] text-slate-500 mt-1 truncate">{avatarFile.name}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Trade license</p>
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        className={inputClass()}
                        placeholder="License / credential number"
                        value={form.license_document_number}
                        onChange={(e) => set({ license_document_number: e.target.value })}
                      />
                      <input
                        className={inputClass()}
                        placeholder="Issuer / document title"
                        value={form.license_issuer}
                        onChange={(e) => set({ license_issuer: e.target.value })}
                      />
                      <div className="flex items-center gap-2">
                        {currentLicenseUrl && !licenseFile && (
                          <a
                            href={currentLicenseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-tf-blue hover:underline"
                          >
                            View current file
                          </a>
                        )}
                        <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,.jpg,.jpeg,.png,application/pdf,.pdf"
                            className="hidden"
                            onChange={(e) => setLicenseFile(e.target.files?.[0] || null)}
                          />
                          {licenseFile || currentLicenseUrl ? 'Replace file' : 'Upload file'}
                        </label>
                      </div>
                      {licenseFile && <p className="text-[11px] text-slate-500 truncate">{licenseFile.name}</p>}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Job preferences">
                <p className="text-[11px] text-slate-500 mb-2">
                  These are the same job-alert settings used to decide which job notifications this technician receives.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="Preferred hourly rate ($/hr minimum)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputClass()}
                      value={form.min_hourly_rate_dollars}
                      onChange={(e) => set({ min_hourly_rate_dollars: e.target.value })}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Travel radius (miles from home)">
                    <input
                      type="number"
                      min="1"
                      className={inputClass()}
                      value={form.max_distance_miles}
                      onChange={(e) => set({ max_distance_miles: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="References">
                <p className="text-[11px] text-slate-500 mb-2">Up to 3 professional references. Clear a name to remove that reference.</p>
                <div className="space-y-2">
                  {form.references.map((ref, index) => (
                    <div key={ref.id || `new-${index}`} className="rounded-md border border-slate-200 bg-white p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Reference {index + 1}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          className={inputClass()}
                          placeholder="Name"
                          value={ref.full_name}
                          onChange={(e) => setReference(index, { full_name: e.target.value })}
                        />
                        <input
                          className={inputClass()}
                          placeholder="Company"
                          value={ref.company_name}
                          onChange={(e) => setReference(index, { company_name: e.target.value })}
                        />
                        <input
                          className={inputClass()}
                          placeholder="Email"
                          value={ref.email}
                          onChange={(e) => setReference(index, { email: e.target.value })}
                        />
                        <input
                          className={inputClass()}
                          placeholder="Phone"
                          value={ref.phone}
                          onChange={(e) => setReference(index, { phone: formatPhoneInput(e.target.value) })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            <div className="shrink-0 border-t border-slate-100 px-4 py-3 flex items-center justify-end gap-2 bg-white rounded-b-2xl">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-3 py-1.5 rounded-md bg-tf-blue text-white text-xs font-semibold hover:bg-tf-blue-dark disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
