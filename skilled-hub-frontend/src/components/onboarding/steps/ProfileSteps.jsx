import React, { useEffect, useState } from 'react';
import { TRADE_OPTIONS } from '../../../constants/trades';
import {
  TECHNICIAN_CLASS_SLUGS,
  technicianClassLabel,
  technicianClassSlug,
} from '../../../constants/technicianClass';
import { authAPI, profilesAPI } from '../../../api/api';
import { OnboardingActions } from '../OnboardingShell';
import { PROFILE_SUBSTEPS } from '../onboardingSteps';

const AVAILABILITY_OPTIONS = ['Full-time', 'Part-time', 'Weekends', 'On-call', 'Flexible'];

function Field({ label, required, children, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="text-tf-orange"> *</span> : <span className="text-slate-400 font-normal"> (optional)</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </label>
  );
}

const inputClass =
  'w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-tf-orange focus:ring-2 focus:ring-tf-orange/20';

export default function ProfileSteps({
  profile,
  user,
  substep = 'personal',
  onSubstepChange,
  onSaved,
  onBack,
  onContinue,
}) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    trade_type: '',
    skill_class: '',
    experience_years: '',
    specialties: '',
    bio: '',
    availability: '',
    min_hourly_rate: '',
    max_distance_miles: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const pref = user?.job_alert_preference || {};
    setForm({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || profile?.phone || '',
      address: profile?.address || '',
      city: profile?.city || '',
      state: profile?.state || '',
      zip_code: profile?.zip_code || '',
      trade_type: profile?.trade_type || '',
      skill_class: technicianClassSlug(profile?.skill_class || ''),
      experience_years: profile?.experience_years ?? '',
      specialties: Array.isArray(profile?.specialties) ? profile.specialties.join(', ') : '',
      bio: profile?.bio || '',
      availability: profile?.availability || '',
      min_hourly_rate:
        pref.min_hourly_rate_cents != null ? String(Math.round(pref.min_hourly_rate_cents / 100)) : '',
      max_distance_miles: pref.max_distance_miles != null ? String(pref.max_distance_miles) : '',
    });
  }, [profile, user]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const validate = () => {
    if (substep === 'personal') {
      if (!form.first_name.trim() || !form.last_name.trim()) return 'First and last name are required.';
      if (!form.phone.trim()) return 'Phone number is required.';
      if (!form.city.trim() && !form.zip_code.trim()) return 'City or ZIP code is required.';
    }
    if (substep === 'professional') {
      if (!form.trade_type.trim()) return 'Primary trade is required.';
      if (!form.skill_class.trim()) return 'Experience level is required.';
    }
    if (substep === 'preferences') {
      if (!form.availability.trim()) return 'Availability is required.';
    }
    return '';
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return false;
    }
    setError('');
    setSaving(true);
    try {
      const profileId = profile?.id;
      await authAPI.updateMe({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        job_alert_preference: {
          min_hourly_rate_cents: form.min_hourly_rate
            ? Math.round(Number(form.min_hourly_rate) * 100)
            : null,
          max_distance_miles: form.max_distance_miles ? Number(form.max_distance_miles) : null,
          trade_label: form.trade_type || undefined,
        },
      });

      if (profileId) {
        const specialties = form.specialties
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        await profilesAPI.updateTechnicianProfile(profileId, {
          phone: form.phone.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip_code: form.zip_code.trim(),
          trade_type: form.trade_type,
          skill_class: form.skill_class,
          experience_years: form.experience_years === '' ? null : Number(form.experience_years),
          specialties,
          bio: form.bio.trim(),
          availability: form.availability,
          location: [form.city, form.state].filter(Boolean).join(', '),
        });
      }
      await onSaved?.();
      setSaving(false);
      return true;
    } catch (e) {
      setError(e.message || 'Could not save profile.');
      setSaving(false);
      return false;
    }
  };

  const handleContinue = async () => {
    const ok = await save();
    if (!ok) return;
    const idx = PROFILE_SUBSTEPS.findIndex((s) => s.key === substep);
    if (idx < PROFILE_SUBSTEPS.length - 1) {
      onSubstepChange(PROFILE_SUBSTEPS[idx + 1].key);
    } else {
      onContinue();
    }
  };

  const handleBack = () => {
    const idx = PROFILE_SUBSTEPS.findIndex((s) => s.key === substep);
    if (idx > 0) onSubstepChange(PROFILE_SUBSTEPS[idx - 1].key);
    else onBack();
  };

  return (
    <div>
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {PROFILE_SUBSTEPS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSubstepChange(s.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              substep === s.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {substep === 'personal' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <input className={inputClass} value={form.first_name} onChange={set('first_name')} autoComplete="given-name" />
          </Field>
          <Field label="Last name" required>
            <input className={inputClass} value={form.last_name} onChange={set('last_name')} autoComplete="family-name" />
          </Field>
          <Field label="Email" hint="Contact support to change your login email." required>
            <input className={`${inputClass} bg-slate-50`} value={form.email} disabled readOnly />
          </Field>
          <Field label="Phone" required>
            <input className={inputClass} value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" />
          </Field>
          <Field label="Street address">
            <input className={inputClass} value={form.address} onChange={set('address')} autoComplete="street-address" />
          </Field>
          <Field label="City" required>
            <input className={inputClass} value={form.city} onChange={set('city')} autoComplete="address-level2" />
          </Field>
          <Field label="State">
            <input className={inputClass} value={form.state} onChange={set('state')} autoComplete="address-level1" />
          </Field>
          <Field label="ZIP code" required>
            <input className={inputClass} value={form.zip_code} onChange={set('zip_code')} autoComplete="postal-code" />
          </Field>
        </div>
      ) : null}

      {substep === 'professional' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary trade" required>
            <select className={inputClass} value={form.trade_type} onChange={set('trade_type')}>
              <option value="">Select a trade</option>
              {TRADE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              {form.trade_type && !TRADE_OPTIONS.includes(form.trade_type) ? (
                <option value={form.trade_type}>{form.trade_type}</option>
              ) : null}
            </select>
          </Field>
          <Field label="Experience level" required>
            <select className={inputClass} value={form.skill_class} onChange={set('skill_class')}>
              <option value="">Select level</option>
              {TECHNICIAN_CLASS_SLUGS.map((slug) => (
                <option key={slug} value={slug}>{technicianClassLabel(slug)}</option>
              ))}
            </select>
          </Field>
          <Field label="Years of experience">
            <input
              className={inputClass}
              type="number"
              min="0"
              max="60"
              value={form.experience_years}
              onChange={set('experience_years')}
            />
          </Field>
          <Field label="Specializations / skills" hint="Comma-separated">
            <input className={inputClass} value={form.specialties} onChange={set('specialties')} placeholder="e.g. VRF, boilers, controls" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="About you">
              <textarea
                className={`${inputClass} min-h-[120px] py-3`}
                value={form.bio}
                onChange={set('bio')}
                placeholder="Briefly describe your experience and the work you do best."
              />
            </Field>
          </div>
        </div>
      ) : null}

      {substep === 'preferences' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Availability" required>
            <select className={inputClass} value={form.availability} onChange={set('availability')}>
              <option value="">Select availability</option>
              {AVAILABILITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              {form.availability && !AVAILABILITY_OPTIONS.includes(form.availability) ? (
                <option value={form.availability}>{form.availability}</option>
              ) : null}
            </select>
          </Field>
          <Field label="Minimum hourly rate ($)">
            <input className={inputClass} type="number" min="0" value={form.min_hourly_rate} onChange={set('min_hourly_rate')} />
          </Field>
          <Field label="Travel radius (miles)">
            <input className={inputClass} type="number" min="1" value={form.max_distance_miles} onChange={set('max_distance_miles')} />
          </Field>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

      <div className="mt-8">
        <OnboardingActions onBack={handleBack} onContinue={handleContinue} loading={saving} />
      </div>
    </div>
  );
}
