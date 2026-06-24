import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jobsAPI, profilesAPI } from '../api/api';
import JobAddressFields from '../components/JobAddressFields';
import DateTimeInput from '../components/DateTimeInput';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import { EXPERIENCE_YEAR_OPTIONS } from '../constants/experienceSelect';
import { companyChargeFromJobAmount, formatPlatformFeePercent } from '../utils/companyPlatformFee';
import { auth } from '../auth';
import { JOB_STATUS_KEYS, jobStatusLabel, normalizeJobStatusKey } from '../utils/jobStatus';

const WEEKDAY_OPTIONS = [
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

const EditJob = () => {
  const isAdmin = auth.getUser()?.role === 'admin';
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', skill_class: '', minimum_years_experience: '', notes: '', required_certifications: [''], address: '', city: '', state: '', zip_code: '', country: '', status: 'open',
    hourly_rate_cents: '', hours_per_day: '8', days: '', start_mode: 'hard_start',
    require_background_check: false, require_identity_verification: false, minimum_verified_references: '0', require_insurance_verification: false,
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
  const [rollingStartRuleType, setRollingStartRuleType] = useState('none');
  const [rollingStartExactStartAt, setRollingStartExactStartAt] = useState('');
  const [rollingStartDaysAfterAcceptance, setRollingStartDaysAfterAcceptance] = useState('1');
  const [rollingStartWeekday, setRollingStartWeekday] = useState('1');
  const [rollingStartWeekdayTime, setRollingStartWeekdayTime] = useState('08:00');

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
          skill_class: data.skill_class || '',
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
        });
        const currentEnd = data.scheduled_end_at;
        const defaultEnd = currentEnd ? new Date(currentEnd) : new Date(Date.now() + 24 * 60 * 60 * 1000);
        setExtendEndAt(toDatetimeLocal(currentEnd || defaultEnd));
        setError(null);
        const customGoLive = hasCustomGoLiveAt(data);
        setUseCustomGoLiveAt(customGoLive);
        setGoLiveAt(toDatetimeLocal(data.go_live_at || new Date()));
        setRollingStartRuleType(data.rolling_start_rule_type || 'none');
        setRollingStartExactStartAt(toDatetimeLocal(data.rolling_start_exact_start_at));
        setRollingStartDaysAfterAcceptance(data.rolling_start_days_after_acceptance != null ? String(data.rolling_start_days_after_acceptance) : '1');
        setRollingStartWeekday(data.rolling_start_weekday != null ? String(data.rolling_start_weekday) : '1');
        setRollingStartWeekdayTime(data.rolling_start_weekday_time || '08:00');

        let pct = data.company_profile?.effective_commission_percent;
        if (pct == null && data.company_profile_id) {
          try {
            const p = await profilesAPI.getCompanyById(data.company_profile_id);
            pct = p?.effective_commission_percent;
          } catch {
            pct = null;
          }
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
  const feePct = platformFeePercent ?? 10;
  const feeLabel = formatPlatformFeePercent(feePct);
  const companyCharge = jobAmount > 0 ? companyChargeFromJobAmount(jobAmount, feePct) : 0;

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
    setSaving(true);
    try {
      const years = (form.minimum_years_experience || '').toString().trim() === ''
        ? null
        : parseInt(form.minimum_years_experience, 10);
      const payload = {
        title: form.title,
        description: form.description,
        skill_class: (form.skill_class || '').trim() || null,
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
      };
      if (jobAmount > 0) {
        payload.hourly_rate_cents = Math.round(hr * 100);
        payload.hours_per_day = hpd;
        payload.days = d;
      } else {
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
            <label className={labelClass}>Class</label>
            <input
              className={fieldClass}
              name="skill_class"
              value={form.skill_class}
              onChange={handleChange}
              placeholder="e.g. Journeyman, Residential"
            />
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
            When a tech claims this job, the company is charged the job total plus a {feeLabel}% platform fee (company tier).
          </p>
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
              />
            </div>
          </div>
          {jobAmount > 0 && (
            <div className="text-sm space-y-1 pt-2 border-t border-slate-200">
              <p><span className="font-medium">Job total:</span> ${jobAmount.toFixed(2)}</p>
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
              <option value="none">Technician chooses when claiming</option>
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
                    {WEEKDAY_OPTIONS.map((opt) => (
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
