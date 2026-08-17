import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jobsAPI, profilesAPI } from '../api/api';
import JobAddressFields from '../components/JobAddressFields';
import DateTimeInput from '../components/DateTimeInput';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import WorkScheduleCalendarPopup from '../components/WorkScheduleCalendarPopup';
import { EXPERIENCE_YEAR_OPTIONS } from '../constants/experienceSelect';
import { TRADE_OPTIONS } from '../constants/trades';
import { isTechnicianClass, technicianClassSelectOptions, technicianClassLabel, technicianClassSlug } from '../constants/technicianClass';
import { companyChargeFromJobAmount, formatPlatformFeePercent } from '../utils/companyPlatformFee';
import { auth } from '../auth';
import { JOB_STATUS_KEYS, jobStatusLabel, normalizeJobStatusKey } from '../utils/jobStatus';
import {
  WEEKDAY_OPTIONS,
  WEEKEND_WORK_OPTIONS,
  DAY_WORK_POLICY_OPTIONS,
  DEFAULT_STANDARD_WORK_DAYS,
  buildScheduleSummary,
} from '../utils/workSchedule';

const ROLLING_WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none';
const sectionCardClass = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3';
const labelClass = 'block text-sm font-semibold text-slate-800 mb-1.5';

const toDatetimeLocal = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const hasCustomGoLiveAt = (job) => {
  if (!job?.go_live_at || !job?.created_at) return false;
  const goLiveMs = new Date(job.go_live_at).getTime();
  const createdMs = new Date(job.created_at).getTime();
  if (!Number.isFinite(goLiveMs) || !Number.isFinite(createdMs)) return false;
  return Math.abs(goLiveMs - createdMs) > 60 * 1000;
};

const normalizedCompanyTrades = (profile) => {
  const raw = Array.isArray(profile?.service_trades) ? profile.service_trades : [];
  const normalized = raw
    .map((value) => TRADE_OPTIONS.find((opt) => opt.toLowerCase() === String(value || '').toLowerCase()))
    .filter(Boolean);
  if (normalized.length > 0) return [...new Set(normalized)];
  const fallback = TRADE_OPTIONS.find((opt) => opt.toLowerCase() === String(profile?.industry || '').toLowerCase());
  return fallback ? [fallback] : [];
};

const EditJob = () => {
  const isAdmin = auth.getUser()?.role === 'admin';
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', skill_class: '', trade_type: '', minimum_years_experience: '', notes: '', required_certifications: [''], address: '', city: '', state: '', zip_code: '', country: '', status: 'open',
    hourly_rate_cents: '', hours_per_day: '8', days: '', pay_basis: 'actual_hours_worked', start_mode: 'hard_start',
    require_background_check: false, require_identity_verification: false, minimum_verified_references: '0', require_insurance_verification: false,
    weekend_work_policy: 'prohibited', standard_work_days: DEFAULT_STANDARD_WORK_DAYS, standard_day_shifts: {},
    saturday_work_policy: 'unavailable', sunday_work_policy: 'unavailable', saturday_multiplier: '1.5', sunday_multiplier: '1.5',
    weekend_requires_company_approval: true, weekend_requires_technician_acceptance: true,
    overtime_enabled: false, daily_overtime_threshold_hours: '', weekly_overtime_threshold_hours: '', overtime_multiplier: '1.5',
    premium_combination_rule: 'highest_applicable', hard_deadline_at: '', job_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [extendEndAt, setExtendEndAt] = useState('');
  const [extending, setExtending] = useState(false);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success', onCloseAction: null });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [platformFeePercent, setPlatformFeePercent] = useState(null);
  const [useCustomGoLiveAt, setUseCustomGoLiveAt] = useState(false);
  const [goLiveAt, setGoLiveAt] = useState('');
  const [rollingStartRuleType, setRollingStartRuleType] = useState('days_after_acceptance');
  const [rollingStartExactStartAt, setRollingStartExactStartAt] = useState('');
  const [rollingStartDaysAfterAcceptance, setRollingStartDaysAfterAcceptance] = useState('1');
  const [rollingStartWeekday, setRollingStartWeekday] = useState('1');
  const [rollingStartWeekdayTime, setRollingStartWeekdayTime] = useState('08:00');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [companyServiceTrades, setCompanyServiceTrades] = useState([]);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        setLoading(true);
        const data = await jobsAPI.getById(id);
        setJob({ ...data, status: normalizeJobStatusKey(data) });
        const hasHourlyRate = data.hourly_rate_cents != null;
        setForm({
          title: data.title || '',
          description: data.description || '',
          skill_class: technicianClassSlug(data.skill_class),
          trade_type: data.trade_type || '',
          minimum_years_experience: data.minimum_years_experience != null ? String(data.minimum_years_experience) : '',
          notes: data.notes || '',
          required_certifications: (() => {
            const raw = data.required_certifications?.trim();
            const arr = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
            return arr.length ? arr : [''];
          })(),
          address: data.address || '',
          city: data.city || '',
          state: data.state || 'Texas',
          zip_code: data.zip_code || '',
          country: data.country || 'United States',
          status: normalizeJobStatusKey(data),
          start_mode: data.start_mode || 'hard_start',
          require_background_check: Boolean(data.require_background_check),
          require_identity_verification: Boolean(data.require_identity_verification),
          minimum_verified_references: String(data.minimum_verified_references ?? 0),
          require_insurance_verification: Boolean(data.require_insurance_verification),
          hourly_rate_cents: hasHourlyRate ? (data.hourly_rate_cents / 100).toFixed(2) : '',
          hours_per_day: data.hours_per_day ?? 8,
          days: data.days ?? '',
          pay_basis: data.pay_basis === 'guaranteed_job_pay' ? 'guaranteed_job_pay' : 'actual_hours_worked',
          weekend_work_policy: data.weekend_work_policy || 'prohibited',
          standard_work_days: Array.isArray(data.standard_work_days) && data.standard_work_days.length ? data.standard_work_days : DEFAULT_STANDARD_WORK_DAYS,
          standard_day_shifts: data.standard_day_shifts || {},
          saturday_work_policy: data.saturday_work_policy || 'unavailable',
          sunday_work_policy: data.sunday_work_policy || 'unavailable',
          saturday_multiplier: data.saturday_multiplier != null ? String(data.saturday_multiplier) : '1.5',
          sunday_multiplier: data.sunday_multiplier != null ? String(data.sunday_multiplier) : '1.5',
          weekend_requires_company_approval: Boolean(data.weekend_requires_company_approval ?? true),
          weekend_requires_technician_acceptance: Boolean(data.weekend_requires_technician_acceptance ?? true),
          overtime_enabled: Boolean(data.overtime_enabled),
          daily_overtime_threshold_hours: data.daily_overtime_threshold_hours != null ? String(data.daily_overtime_threshold_hours) : '',
          weekly_overtime_threshold_hours: data.weekly_overtime_threshold_hours != null ? String(data.weekly_overtime_threshold_hours) : '',
          overtime_multiplier: data.overtime_multiplier != null ? String(data.overtime_multiplier) : '1.5',
          premium_combination_rule: data.premium_combination_rule || 'highest_applicable',
          hard_deadline_at: toDatetimeLocal(data.hard_deadline_at),
          job_timezone: data.job_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        });
        const currentEnd = data.scheduled_end_at;
        const defaultEnd = currentEnd ? new Date(currentEnd) : new Date(Date.now() + 24 * 60 * 60 * 1000);
        setExtendEndAt(toDatetimeLocal(currentEnd || defaultEnd));
        setError(null);
        const customGoLive = hasCustomGoLiveAt(data);
        setUseCustomGoLiveAt(customGoLive);
        setGoLiveAt(toDatetimeLocal(data.go_live_at || new Date()));
        setRollingStartRuleType((data.rolling_start_rule_type && data.rolling_start_rule_type !== 'none') ? data.rolling_start_rule_type : 'days_after_acceptance');
        setRollingStartExactStartAt(toDatetimeLocal(data.rolling_start_exact_start_at));
        setRollingStartDaysAfterAcceptance(data.rolling_start_days_after_acceptance != null ? String(data.rolling_start_days_after_acceptance) : '1');
        setRollingStartWeekday(data.rolling_start_weekday != null ? String(data.rolling_start_weekday) : '1');
        setRollingStartWeekdayTime(data.rolling_start_weekday_time || '08:00');

        let pct = data.company_profile?.effective_commission_percent;
        if (pct == null && data.company_profile_id) {
          try {
            const p = await profilesAPI.getCompanyById(data.company_profile_id);
            pct = p?.effective_commission_percent;
            setCompanyServiceTrades(normalizedCompanyTrades(p));
          } catch {
            pct = null;
            setCompanyServiceTrades([]);
          }
        } else {
          setCompanyServiceTrades(normalizedCompanyTrades(data.company_profile));
        }
        setPlatformFeePercent(pct != null ? Number(pct) : 10);
      } catch {
        setError('Failed to load job details');
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCertChange = (idx, value) => {
    setForm((prev) => {
      const next = [...(prev.required_certifications || [''])];
      next[idx] = value;
      return { ...prev, required_certifications: next };
    });
  };

  const handleCertRemove = (idx) => {
    setForm((prev) => ({
      ...prev,
      required_certifications: (prev.required_certifications || ['']).filter((_, i) => i !== idx),
    }));
  };

  const handleCertAdd = () => {
    setForm((prev) => ({
      ...prev,
      required_certifications: [...(prev.required_certifications || ['']), ''],
    }));
  };

  const hr = parseFloat(form.hourly_rate_cents) || 0;
  const hpd = parseInt(form.hours_per_day, 10) || 8;
  const d = parseInt(form.days, 10) || 0;
  const jobAmount = hr * hpd * d;
  const termsLocked = job?.funding_status === 'funded' || job?.funding_status === 'adjustment_required';
  const feePct = platformFeePercent ?? 10;
  const feeLabel = formatPlatformFeePercent(feePct);
  const companyCharge = jobAmount > 0 ? companyChargeFromJobAmount(jobAmount, feePct) : 0;
  const scheduleSummary = buildScheduleSummary({
    standardWorkDays: form.standard_work_days,
    weekendWorkPolicy: form.weekend_work_policy,
    saturdayWorkPolicy: form.saturday_work_policy,
    sundayWorkPolicy: form.sunday_work_policy,
    saturdayMultiplier: form.saturday_multiplier,
    sundayMultiplier: form.sunday_multiplier,
    overtimeEnabled: form.overtime_enabled,
    overtimeMultiplier: form.overtime_multiplier,
  });

  const patchAddress = (patch) => {
    setForm((prev) => ({
      ...prev,
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.city !== undefined ? { city: patch.city } : {}),
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.zip_code !== undefined ? { zip_code: patch.zip_code } : {}),
      ...(patch.country !== undefined ? { country: patch.country } : {}),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!String(form.city || '').trim() || !String(form.state || '').trim()) {
      setAlertModal({
        isOpen: true,
        title: 'Address required',
        message: 'Please set at least city and state from address search or manual entry.',
        variant: 'error',
        onCloseAction: null,
      });
      return;
    }
    if (form.weekend_work_policy === 'required' && form.saturday_work_policy === 'unavailable' && form.sunday_work_policy === 'unavailable') {
      setAlertModal({
        isOpen: true,
        title: 'Weekend days required',
        message: 'Select Saturday or Sunday when weekend work is required.',
        variant: 'error',
      });
      return;
    }
    if (companyServiceTrades.length > 1 && !String(form.trade_type || '').trim()) {
      setAlertModal({
        isOpen: true,
        title: 'Trade required',
        message: 'Select the trade for this job. This company has multiple service trades.',
        variant: 'error',
      });
      return;
    }
    if (!isTechnicianClass(form.skill_class)) {
      setAlertModal({
        isOpen: true,
        title: 'Class required',
        message: 'Select a class (Apprentice, Journeyman, or Master).',
        variant: 'error',
      });
      return;
    }
    setSaving(true);
    try {
      const years = (form.minimum_years_experience || '').toString().trim() === ''
        ? null
        : parseInt(form.minimum_years_experience, 10);
      const payload = {
        title: form.title,
        description: form.description,
        trade_type: (form.trade_type || '').trim() || null,
        skill_class: (form.skill_class || '').trim(),
        minimum_years_experience: years != null && !Number.isNaN(years) ? years : null,
        notes: (form.notes || '').trim() || null,
        required_certifications: Array.isArray(form.required_certifications) && form.required_certifications.filter((c) => c?.trim()).length
          ? form.required_certifications.filter((c) => c?.trim()).join(", ")
          : null,
        require_background_check: !!form.require_background_check,
        require_identity_verification: !!form.require_identity_verification,
        minimum_verified_references: Math.max(0, parseInt(form.minimum_verified_references, 10) || 0),
        require_insurance_verification: !!form.require_insurance_verification,
        address: form.address,
        city: form.city,
        state: form.state,
        zip_code: form.zip_code,
        country: form.country,
        status: form.status,
        start_mode: form.start_mode,
        go_live_at: useCustomGoLiveAt && goLiveAt ? new Date(goLiveAt).toISOString() : null,
        rolling_start_rule_type: form.start_mode === 'rolling_start' ? rollingStartRuleType : 'none',
        rolling_start_exact_start_at: form.start_mode === 'rolling_start' && rollingStartRuleType === 'exact_datetime' && rollingStartExactStartAt
          ? new Date(rollingStartExactStartAt).toISOString()
          : null,
        rolling_start_days_after_acceptance: form.start_mode === 'rolling_start' && rollingStartRuleType === 'days_after_acceptance'
          ? Math.max(1, parseInt(rollingStartDaysAfterAcceptance, 10) || 1)
          : null,
        rolling_start_weekday: form.start_mode === 'rolling_start' && rollingStartRuleType === 'following_weekday'
          ? parseInt(rollingStartWeekday, 10)
          : null,
        rolling_start_weekday_time: form.start_mode === 'rolling_start' && rollingStartRuleType === 'following_weekday'
          ? rollingStartWeekdayTime
          : null,
        weekend_work_policy: form.weekend_work_policy,
        standard_work_days: form.standard_work_days,
        standard_day_shifts: form.standard_day_shifts,
        saturday_work_policy: form.saturday_work_policy,
        sunday_work_policy: form.sunday_work_policy,
        saturday_multiplier: form.saturday_work_policy === 'premium_rate' ? Number(form.saturday_multiplier) : null,
        sunday_multiplier: form.sunday_work_policy === 'premium_rate' ? Number(form.sunday_multiplier) : null,
        weekend_requires_company_approval: !!form.weekend_requires_company_approval,
        weekend_requires_technician_acceptance: !!form.weekend_requires_technician_acceptance,
        overtime_enabled: !!form.overtime_enabled,
        daily_overtime_threshold_hours: form.overtime_enabled && form.daily_overtime_threshold_hours
          ? Number(form.daily_overtime_threshold_hours)
          : null,
        weekly_overtime_threshold_hours: form.overtime_enabled && form.weekly_overtime_threshold_hours
          ? Number(form.weekly_overtime_threshold_hours)
          : null,
        overtime_multiplier: form.overtime_enabled ? Number(form.overtime_multiplier || 1.5) : null,
        premium_combination_rule: form.premium_combination_rule || 'highest_applicable',
        hard_deadline_at: form.hard_deadline_at ? new Date(form.hard_deadline_at).toISOString() : null,
        job_timezone: form.job_timezone || 'UTC',
      };
      if (jobAmount > 0 && !termsLocked) {
        payload.hourly_rate_cents = Math.round(hr * 100);
        payload.hours_per_day = hpd;
        payload.days = d;
        payload.pay_basis = form.pay_basis || 'actual_hours_worked';
      } else if (jobAmount <= 0 && !termsLocked) {
        payload.hourly_rate_cents = null;
        payload.hours_per_day = null;
        payload.days = null;
      }
      await jobsAPI.update(id, payload);
      setAlertModal({
        isOpen: true, title: 'Job updated!', message: 'Your changes have been saved.', variant: 'success',
        onCloseAction: () => navigate('/dashboard'),
      });
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to update job', message: err.message || 'Failed to update job', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleExtend = async (e) => {
    e.preventDefault();
    if (!extendEndAt) {
      setAlertModal({ isOpen: true, title: 'Select date and time', message: 'Please select a new end date and time.', variant: 'error' });
      return;
    }
    setExtending(true);
    try {
      await jobsAPI.extend(id, { scheduled_end_at: new Date(extendEndAt).toISOString() });
      setAlertModal({ isOpen: true, title: 'Job extended!', message: 'The end date has been updated.', variant: 'success' });
      const data = await jobsAPI.getById(id);
      setJob(data);
      setExtendEndAt(toDatetimeLocal(data.scheduled_end_at));
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to extend job', message: err.message || 'Failed to extend job', variant: 'error' });
    } finally {
      setExtending(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      await jobsAPI.delete(id);
      setAlertModal({
        isOpen: true, title: 'Job deleted', message: 'The job has been removed.', variant: 'success',
        onCloseAction: () => navigate('/dashboard'),
      });
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Unable to delete job', message: err.message || 'Failed to delete job', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const acceptedApp = job?.job_applications?.find((app) => app.status === 'accepted' || app.status === 1);
  const hasAcceptedApplication = Boolean(acceptedApp);

  if (loading) return <div className="max-w-4xl mx-auto mt-10 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-slate-600">Loading...</div>;
  if (error) return <div className="max-w-4xl mx-auto mt-10 rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-red-700">{error}</div>;
  if (!job) return <div className="max-w-4xl mx-auto mt-10 rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-red-700">Job not found</div>;

  return (
    <div className="max-w-4xl mx-auto mt-10 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-6">Edit Job</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={fieldClass}
            name="title"
            value={form.title}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={`${fieldClass} min-h-[120px]`}
            name="description"
            value={form.description}
            onChange={handleChange}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Trade</label>
            {companyServiceTrades.length > 1 ? (
              <select
                className={fieldClass}
                name="trade_type"
                value={form.trade_type}
                onChange={handleChange}
              >
                <option value="">Select trade</option>
                {companyServiceTrades.map((trade) => (
                  <option key={trade} value={trade}>{trade}</option>
                ))}
              </select>
            ) : (
              <input
                className={fieldClass}
                name="trade_type"
                value={form.trade_type || companyServiceTrades[0] || ''}
                onChange={handleChange}
                list="edit-job-trade-suggestions"
                placeholder="Select trade"
                disabled={companyServiceTrades.length === 1}
              />
            )}
            <datalist id="edit-job-trade-suggestions">
              {TRADE_OPTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            {companyServiceTrades.length === 1 && (
              <p className="text-xs text-slate-500 mt-1">Auto-selected from company service trades.</p>
            )}
          </div>
          <div>
            <label className={labelClass}>Class</label>
            <select
              className={fieldClass}
              name="skill_class"
              value={form.skill_class}
              onChange={handleChange}
              required
            >
              <option value="">Select class</option>
              {technicianClassSelectOptions(form.skill_class).map((value) => (
                <option key={value} value={value} disabled={!isTechnicianClass(value)}>
                  {technicianClassLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Experience</label>
            <select
              name="minimum_years_experience"
              className={fieldClass}
              value={form.minimum_years_experience}
              onChange={handleChange}
            >
              {EXPERIENCE_YEAR_OPTIONS.map(({ value, label }) => (
                <option key={value === '' ? 'any' : value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Notes and conditions</label>
          <p className="text-xs text-slate-500 mb-2">Shown on the job listing for technicians.</p>
          <textarea
            className={`${fieldClass} min-h-[100px]`}
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Safety, site conditions, or other requirements"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">Verification requirements</label>
          <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/70 space-y-3">
            <label className="flex items-center justify-between text-sm gap-4">
              <span>Require background check</span>
              <input
                type="checkbox"
                name="require_background_check"
                checked={!!form.require_background_check}
                onChange={(e) => setForm((prev) => ({ ...prev, require_background_check: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between text-sm gap-4">
              <span>Require identity verification</span>
              <input
                type="checkbox"
                name="require_identity_verification"
                checked={!!form.require_identity_verification}
                onChange={(e) => setForm((prev) => ({ ...prev, require_identity_verification: e.target.checked }))}
              />
            </label>
            <div className="flex items-center justify-between text-sm gap-4">
              <label htmlFor="edit-minimum-verified-references">Minimum verified references</label>
              <input
                id="edit-minimum-verified-references"
                type="number"
                min="0"
                max="10"
                name="minimum_verified_references"
                className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none"
                value={form.minimum_verified_references}
                onChange={handleChange}
              />
            </div>
            <label className="flex items-center justify-between text-sm gap-4">
              <span>Require insurance verification</span>
              <input
                type="checkbox"
                name="require_insurance_verification"
                checked={!!form.require_insurance_verification}
                onChange={(e) => setForm((prev) => ({ ...prev, require_insurance_verification: e.target.checked }))}
              />
            </label>
          </div>
        </div>
        <div>
          <label className={labelClass}>Required Certifications</label>
          <p className="text-xs text-slate-500 mb-2">List certifications the tech must have. Techs upload certificate images; you verify they match.</p>
          <div className="space-y-2">
            {(form.required_certifications || ['']).map((cert, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className={`${fieldClass} flex-1`}
                  value={cert}
                  onChange={(e) => handleCertChange(idx, e.target.value)}
                  placeholder="e.g. OSHA 10, EPA 608"
                />
                <button
                  type="button"
                  onClick={() => handleCertRemove(idx)}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded border border-red-200"
                  title="Remove"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleCertAdd}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 font-medium"
            >
              + Add certification
            </button>
          </div>
        </div>
        <JobAddressFields
          address={form.address}
          city={form.city}
          state={form.state}
          zipCode={form.zip_code}
          country={form.country}
          onChange={patchAddress}
        />
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
          <h3 className="font-semibold text-slate-900">Pricing</h3>
          <p className="text-sm text-slate-600">
            Priced jobs are charged when posted. The company pays the {form.pay_basis === 'guaranteed_job_pay' ? 'guaranteed' : 'estimated'} job total plus a {feeLabel}% platform fee (company tier).
          </p>
          {termsLocked && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Funded pay terms are locked. Use a counteroffer to change rate, hours, days, or pay basis.
            </p>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Pay basis</label>
            <select
              className={fieldClass}
              name="pay_basis"
              value={form.pay_basis || 'actual_hours_worked'}
              onChange={handleChange}
              disabled={termsLocked}
            >
              <option value="actual_hours_worked">Actual Hours Worked</option>
              <option value="guaranteed_job_pay">Guaranteed Job Pay</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Hourly rate (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                name="hourly_rate_cents"
                className={fieldClass}
                value={form.hourly_rate_cents}
                onChange={handleChange}
                placeholder="e.g. 50"
                disabled={termsLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Hours per day</label>
              <input
                type="number"
                min="1"
                max="24"
                name="hours_per_day"
                className={fieldClass}
                value={form.hours_per_day}
                onChange={handleChange}
                disabled={termsLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Number of days</label>
              <input
                type="number"
                min="0"
                name="days"
                className={fieldClass}
                value={form.days}
                onChange={handleChange}
                placeholder="e.g. 3"
                disabled={termsLocked}
              />
            </div>
          </div>
          {jobAmount > 0 && (
            <div className="text-sm space-y-1 pt-2 border-t border-slate-200">
              <p><span className="font-medium">{form.pay_basis === 'guaranteed_job_pay' ? 'Guaranteed job pay:' : 'Estimated job total:'}</span> ${jobAmount.toFixed(2)}</p>
              <p><span className="font-medium">You pay (incl. {feeLabel}% fee):</span> ${companyCharge.toFixed(2)}</p>
            </div>
          )}
        </div>
        <div>
          <label className={labelClass}>Start Mode</label>
          <select
            className={fieldClass}
            name="start_mode"
            value={form.start_mode}
            onChange={handleChange}
          >
            <option value="hard_start">Hard start date/time</option>
            <option value="rolling_start">Rolling start (starts when accepted)</option>
          </select>
        </div>
        {form.start_mode === 'rolling_start' && (
          <div className={sectionCardClass}>
            <h3 className="font-semibold text-slate-900">Rolling start rule</h3>
            <select
              className={fieldClass}
              value={rollingStartRuleType}
              onChange={(e) => setRollingStartRuleType(e.target.value)}
            >
              <option value="exact_datetime">Exact date/time required</option>
              <option value="days_after_acceptance">X days after acceptance</option>
              <option value="following_weekday">Following weekday at time</option>
            </select>
            {rollingStartRuleType === 'exact_datetime' && (
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Exact start date & time</label>
                <DateTimeInput
                  id="edit-job-rolling-exact-start"
                  value={rollingStartExactStartAt}
                  onChange={(e) => setRollingStartExactStartAt(e.target.value)}
                  className="w-full"
                />
              </div>
            )}
            {rollingStartRuleType === 'days_after_acceptance' && (
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Days after acceptance</label>
                <input
                  type="number"
                  min="1"
                  className={fieldClass}
                  value={rollingStartDaysAfterAcceptance}
                  onChange={(e) => setRollingStartDaysAfterAcceptance(e.target.value)}
                />
              </div>
            )}
            {rollingStartRuleType === 'following_weekday' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Following weekday</label>
                  <select
                    className={fieldClass}
                    value={rollingStartWeekday}
                    onChange={(e) => setRollingStartWeekday(e.target.value)}
                  >
                    {ROLLING_WEEKDAY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Start time</label>
                  <input
                    type="time"
                    className={fieldClass}
                    value={rollingStartWeekdayTime}
                    onChange={(e) => setRollingStartWeekdayTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        <div>
          <label className={labelClass}>Go Live</label>
          <p className="text-xs text-slate-500 mb-2">By default, this job goes live when posted/opened.</p>
          <label className="inline-flex items-center gap-2 text-sm mb-2">
            <input
              type="checkbox"
              checked={useCustomGoLiveAt}
              onChange={(e) => setUseCustomGoLiveAt(e.target.checked)}
            />
            Set different go-live date
          </label>
          {useCustomGoLiveAt && (
            <DateTimeInput
              id="edit-job-go-live-at"
              value={goLiveAt}
              onChange={(e) => setGoLiveAt(e.target.value)}
              className="w-full"
            />
          )}
        </div>
        <div className={sectionCardClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Work schedule</h3>
              <p className="text-xs text-slate-500">Set standard working days and shift windows.</p>
            </div>
            <button type="button" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" onClick={() => setCalendarOpen(true)}>
              Open calendar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {WEEKDAY_OPTIONS.map((opt) => {
              const selected = (form.standard_work_days || []).includes(opt.value);
              return (
                <label key={opt.value} className={`rounded border px-2 py-1 text-sm ${selected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={selected}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        standard_work_days: e.target.checked
                          ? [...(prev.standard_work_days || []), opt.value].sort((a, b) => a - b)
                          : (prev.standard_work_days || []).filter((d) => d !== opt.value),
                      }));
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Hard deadline</label>
              <DateTimeInput id="edit-job-hard-deadline" value={form.hard_deadline_at} onChange={(e) => setForm((p) => ({ ...p, hard_deadline_at: e.target.value }))} className="w-full" />
            </div>
            <div>
              <label className={labelClass}>Job timezone</label>
              <input className={fieldClass} value={form.job_timezone} onChange={(e) => setForm((p) => ({ ...p, job_timezone: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className={sectionCardClass}>
          <h3 className="font-semibold text-slate-900">Weekend work</h3>
          <select className={fieldClass} value={form.weekend_work_policy} onChange={(e) => setForm((p) => ({ ...p, weekend_work_policy: e.target.value }))}>
            {WEEKEND_WORK_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          {form.weekend_work_policy !== 'prohibited' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Saturday availability</label>
                <select className={fieldClass} value={form.saturday_work_policy} onChange={(e) => setForm((p) => ({ ...p, saturday_work_policy: e.target.value }))}>
                  {DAY_WORK_POLICY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                {form.saturday_work_policy === 'premium_rate' && (
                  <input type="number" min="1" max="3" step="0.1" className={`${fieldClass} mt-2`} value={form.saturday_multiplier} onChange={(e) => setForm((p) => ({ ...p, saturday_multiplier: e.target.value }))} />
                )}
              </div>
              <div>
                <label className={labelClass}>Sunday availability</label>
                <select className={fieldClass} value={form.sunday_work_policy} onChange={(e) => setForm((p) => ({ ...p, sunday_work_policy: e.target.value }))}>
                  {DAY_WORK_POLICY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                {form.sunday_work_policy === 'premium_rate' && (
                  <input type="number" min="1" max="3" step="0.1" className={`${fieldClass} mt-2`} value={form.sunday_multiplier} onChange={(e) => setForm((p) => ({ ...p, sunday_multiplier: e.target.value }))} />
                )}
              </div>
            </div>
          )}
          {form.weekend_work_policy === 'optional' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between text-sm">
                Technician acceptance required
                <input type="checkbox" checked={!!form.weekend_requires_technician_acceptance} onChange={(e) => setForm((p) => ({ ...p, weekend_requires_technician_acceptance: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between text-sm">
                Company approval required
                <input type="checkbox" checked={!!form.weekend_requires_company_approval} onChange={(e) => setForm((p) => ({ ...p, weekend_requires_company_approval: e.target.checked }))} />
              </label>
            </div>
          )}
        </div>
        <div className={sectionCardClass}>
          <h3 className="font-semibold text-slate-900">Overtime</h3>
          <label className="flex items-center justify-between text-sm">
            Overtime eligibility
            <input type="checkbox" checked={!!form.overtime_enabled} onChange={(e) => setForm((p) => ({ ...p, overtime_enabled: e.target.checked }))} />
          </label>
          {form.overtime_enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Daily threshold (hours)</label>
                <input type="number" min="1" step="0.5" className={fieldClass} value={form.daily_overtime_threshold_hours} onChange={(e) => setForm((p) => ({ ...p, daily_overtime_threshold_hours: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Weekly threshold (hours)</label>
                <input type="number" min="1" step="0.5" className={fieldClass} value={form.weekly_overtime_threshold_hours} onChange={(e) => setForm((p) => ({ ...p, weekly_overtime_threshold_hours: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Overtime multiplier</label>
                <input type="number" min="1" max="3" step="0.1" className={fieldClass} value={form.overtime_multiplier} onChange={(e) => setForm((p) => ({ ...p, overtime_multiplier: e.target.value }))} />
              </div>
            </div>
          )}
          <div>
            <label className={labelClass}>Premium interaction</label>
            <select className={fieldClass} value={form.premium_combination_rule} onChange={(e) => setForm((p) => ({ ...p, premium_combination_rule: e.target.value }))}>
              <option value="highest_applicable">Pay highest applicable rate</option>
              <option value="stacked">Stack multipliers</option>
            </select>
          </div>
        </div>
        <div className={sectionCardClass}>
          <h3 className="font-semibold text-slate-900">Schedule and pay summary</h3>
          <p className="text-sm text-slate-700">{scheduleSummary}</p>
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select
            className={fieldClass}
            name="status"
            value={form.status}
            onChange={handleChange}
          >
            {JOB_STATUS_KEYS.map((key) => (
              <option
                key={key}
                value={key}
                disabled={key === 'open' && hasAcceptedApplication && !isAdmin}
              >
                {jobStatusLabel(key)}
              </option>
            ))}
          </select>
          {hasAcceptedApplication && !isAdmin ? (
            <p className="text-xs text-amber-800 mt-1">
              To set the listing back to Open, use Deny Technician first (or contact an admin).
            </p>
          ) : null}
          {isAdmin && (
            <p className="text-xs text-slate-500 mt-1">
              Jobs go live immediately when status is set to Open.
            </p>
          )}
        </div>
        <div className="flex gap-4 items-center">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-6 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Job'}
          </button>
        </div>
      </form>

      {job?.status === 'reserved' && (
        <div className="mt-8 p-6 border border-slate-200 rounded-xl bg-slate-50/70">
          <h2 className="text-lg font-semibold mb-4">Extend Job</h2>
          <p className="text-sm text-slate-600 mb-4">Current end: {job.scheduled_end_at ? new Date(job.scheduled_end_at).toLocaleString() : 'Not set'}</p>
          <form onSubmit={handleExtend} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">New End Date & Time</label>
              <DateTimeInput
                id="edit-job-extend-end-at"
                value={extendEndAt}
                onChange={(e) => setExtendEndAt(e.target.value)}
                className="w-full"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
              disabled={extending}
            >
              {extending ? 'Extending...' : 'Extend'}
            </button>
          </form>
        </div>
      )}

      <WorkScheduleCalendarPopup
        isOpen={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        selectedDays={form.standard_work_days}
        shiftsByDay={form.standard_day_shifts}
        onApply={({ selectedDays, shiftsByDay }) => {
          setForm((prev) => ({ ...prev, standard_work_days: selectedDays, standard_day_shifts: shiftsByDay }));
          setCalendarOpen(false);
        }}
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => {
          setAlertModal((p) => ({ ...p, isOpen: false }));
          alertModal.onCloseAction?.();
        }}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete job?"
        message="Are you sure you want to delete this job? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
      />
    </div>
  );
};

export default EditJob;
