import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { jobsAPI, profilesAPI, crmAPI } from '../api/api';
import DateTimeInput from '../components/DateTimeInput';
import JobAddressFields from '../components/JobAddressFields';
import AlertModal from '../components/AlertModal';
import { EXPERIENCE_YEAR_OPTIONS } from '../constants/experienceSelect';
import { auth } from '../auth';
import { companyChargeFromJobAmount, formatPlatformFeePercent } from '../utils/companyPlatformFee';

const toDatetimeLocal = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const LUNCH_HOURS = 1;
const CLASS_SUGGESTIONS = [
  'Apprentice',
  'Journeyman',
  'Master',
  'Service Technician',
  'Installation Technician',
  'HVAC',
  'Electrical',
  'Plumbing',
  'General Labor',
];
const WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const getDefaultStart = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  return tomorrow;
};

const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const addBusinessDays = (date, businessDays) => {
  const result = new Date(date);
  let remaining = Math.max(0, businessDays);
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
};

/**
 * Compute end date/time from start + days + hours per day.
 * Each day: hours_per_day of work + 1 hour lunch.
 * E.g. Start 8 AM, 3 days, 8 hrs/day → ends 5 PM on day 3 (8+8+1=17)
 */
const computeEndFromPricing = (startStr, days, hoursPerDay) => {
  if (!startStr) return '';
  const start = new Date(startStr);
  if (isNaN(start.getTime())) return '';
  const hpd = Math.max(1, parseInt(hoursPerDay, 10) || 8);
  const d = Math.max(1, parseInt(days, 10) || 1);
  const end = addBusinessDays(start, d - 1);
  const endHour = start.getHours() + hpd + LUNCH_HOURS;
  end.setHours(endHour, start.getMinutes(), 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
};

const CreateJob = () => {
  const DRAFT_KEY = 'web_create_job_draft_v1';
  const user = auth.getUser();
  const isAdmin = user?.role === 'admin';
  const defaultStart = useMemo(() => getDefaultStart(), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skillClass, setSkillClass] = useState("");
  const [minimumYearsExperience, setMinimumYearsExperience] = useState("");
  const [notes, setNotes] = useState("");
  const [requiredCertifications, setRequiredCertifications] = useState([""]);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("Texas");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("United States");
  const [hourlyRate, setHourlyRate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("8");
  const [days, setDays] = useState("");
  const [status, setStatus] = useState("open");
  const [startMode, setStartMode] = useState("hard_start");
  const [rollingStartRuleType, setRollingStartRuleType] = useState('none');
  const [rollingStartExactStartAt, setRollingStartExactStartAt] = useState('');
  const [rollingStartDaysAfterAcceptance, setRollingStartDaysAfterAcceptance] = useState('1');
  const [rollingStartWeekday, setRollingStartWeekday] = useState('1');
  const [rollingStartWeekdayTime, setRollingStartWeekdayTime] = useState('08:00');
  const [scheduledStartAt, setScheduledStartAt] = useState(toDatetimeLocal(defaultStart));
  const [scheduledEndAt, setScheduledEndAt] = useState(
    computeEndFromPricing(toDatetimeLocal(defaultStart), 1, 8)
  );
  const [useCustomGoLiveAt, setUseCustomGoLiveAt] = useState(false);
  const [goLiveAt, setGoLiveAt] = useState(toDatetimeLocal(new Date()));
  const [saving, setSaving] = useState(false);
  const [companyProfileId, setCompanyProfileId] = useState(null);
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [companySelectionLocked, setCompanySelectionLocked] = useState(false);
  const [enforceCardValidation, setEnforceCardValidation] = useState(true);
  const [platformFeePercent, setPlatformFeePercent] = useState(null);
  const [successModal, setSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      setTitle(String(draft.title || ''));
      setDescription(String(draft.description || ''));
      setSkillClass(String(draft.skillClass || ''));
      setMinimumYearsExperience(String(draft.minimumYearsExperience || ''));
      setNotes(String(draft.notes || ''));
      setRequiredCertifications(
        Array.isArray(draft.requiredCertifications) && draft.requiredCertifications.length > 0
          ? draft.requiredCertifications
          : ['']
      );
      setAddress(String(draft.address || ''));
      setCity(String(draft.city || ''));
      setState(String(draft.state || 'Texas'));
      setZipCode(String(draft.zipCode || ''));
      setCountry(String(draft.country || 'United States'));
      setHourlyRate(String(draft.hourlyRate || ''));
      setHoursPerDay(String(draft.hoursPerDay || '8'));
      setDays(String(draft.days || ''));
      setStatus(String(draft.status || 'open'));
      setStartMode(String(draft.startMode || 'hard_start'));
      setScheduledStartAt(String(draft.scheduledStartAt || toDatetimeLocal(defaultStart)));
      setScheduledEndAt(String(draft.scheduledEndAt || computeEndFromPricing(toDatetimeLocal(defaultStart), 1, 8)));
      setUseCustomGoLiveAt(Boolean(draft.useCustomGoLiveAt));
      setGoLiveAt(String(draft.goLiveAt || toDatetimeLocal(new Date())));
    } catch {
      /* ignore bad draft */
    }
  }, [defaultStart]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          title,
          description,
          skillClass,
          minimumYearsExperience,
          notes,
          requiredCertifications,
          address,
          city,
          state,
          zipCode,
          country,
          hourlyRate,
          hoursPerDay,
          days,
          status,
          startMode,
          scheduledStartAt,
          scheduledEndAt,
          useCustomGoLiveAt,
          goLiveAt,
        })
      );
    } catch {
      /* storage full or blocked */
    }
  }, [
    title,
    description,
    skillClass,
    minimumYearsExperience,
    notes,
    requiredCertifications,
    address,
    city,
    state,
    zipCode,
    country,
    hourlyRate,
    hoursPerDay,
    days,
    status,
    startMode,
    scheduledStartAt,
    scheduledEndAt,
    useCustomGoLiveAt,
    goLiveAt,
  ]);

  useEffect(() => {
    if (isAdmin) return;

    const fetchProfile = async () => {
      try {
        const profile = await profilesAPI.getCompanyProfile();
        setCompanyProfileId(profile.id);
        const pct = profile.effective_commission_percent;
        setPlatformFeePercent(pct != null ? Number(pct) : 0);
      } catch {
        setCompanyProfileId(null);
        setPlatformFeePercent(null);
      }
    };
    fetchProfile();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !companyProfileId) {
      if (isAdmin) setPlatformFeePercent(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const profile = await profilesAPI.getCompanyById(companyProfileId);
        if (!cancelled) {
          const pct = profile?.effective_commission_percent;
          setPlatformFeePercent(pct != null ? Number(pct) : 0);
        }
      } catch {
        if (!cancelled) setPlatformFeePercent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, companyProfileId]);

  useEffect(() => {
    if (!isAdmin) return;
    if (companySelectionLocked) return;
    const q = companyQuery.trim();
    if (q.length < 2) {
      setCompanyOptions([]);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setCompanySearchLoading(true);
      try {
        const res = await crmAPI.searchCompanies(q);
        if (!cancelled) {
          setCompanyOptions(Array.isArray(res?.companies) ? res.companies : []);
        }
      } catch {
        if (!cancelled) setCompanyOptions([]);
      } finally {
        if (!cancelled) setCompanySearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [companyQuery, isAdmin, companySelectionLocked]);

  // Auto-compute end date/time from start + days + hours per day (+ 1 hr lunch)
  useEffect(() => {
    if (startMode === 'rolling_start') return;
    const computed = computeEndFromPricing(scheduledStartAt, days, hoursPerDay);
    if (computed) setScheduledEndAt(computed);
  }, [scheduledStartAt, days, hoursPerDay, startMode]);

  const hr = parseFloat(hourlyRate) || 0;
  const hpd = parseInt(hoursPerDay, 10) || 8;
  const d = parseInt(days, 10) || 0;
  const jobAmount = hr * hpd * d;
  const feeReady = platformFeePercent !== null && (!isAdmin || companyProfileId);
  const companyCharge = feeReady && jobAmount > 0
    ? companyChargeFromJobAmount(jobAmount, platformFeePercent)
    : null;
  const feeLabel = feeReady ? formatPlatformFeePercent(platformFeePercent) : null;

  const patchAddress = (patch) => {
    if (patch.address !== undefined) setAddress(patch.address);
    if (patch.city !== undefined) setCity(patch.city);
    if (patch.state !== undefined) setState(patch.state);
    if (patch.zip_code !== undefined) setZipCode(patch.zip_code);
    if (patch.country !== undefined) setCountry(patch.country);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hasCity = Boolean(String(city || '').trim());
    const hasState = Boolean(String(state || '').trim());
    const hasStreetAddress = Boolean(String(address || '').trim());
    if (!(hasState && (hasCity || hasStreetAddress))) {
      setErrorModal('Please provide a state and either a city or street address.');
      return;
    }
    if (startMode !== 'rolling_start' && scheduledStartAt && scheduledEndAt) {
      const startMs = new Date(scheduledStartAt).getTime();
      const endMs = new Date(scheduledEndAt).getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
        setErrorModal('End date/time cannot be before start date/time.');
        return;
      }
    }
    setSaving(true);
    try {
      const years = minimumYearsExperience.trim() === '' ? null : parseInt(minimumYearsExperience, 10);
      const payload = {
        title,
        description,
        skill_class: skillClass.trim() || null,
        minimum_years_experience: years != null && !Number.isNaN(years) ? years : null,
        notes: notes.trim() || null,
        required_certifications: requiredCertifications.filter((c) => c.trim()).length
          ? requiredCertifications.filter((c) => c.trim()).join(", ")
          : null,
        address,
        city,
        state,
        zip_code: zipCode,
        country,
        status,
        start_mode: startMode,
        company_profile_id: companyProfileId,
        scheduled_start_at: startMode === 'rolling_start' ? null : (scheduledStartAt ? new Date(scheduledStartAt).toISOString() : null),
        scheduled_end_at: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : null,
        go_live_at: useCustomGoLiveAt && goLiveAt ? new Date(goLiveAt).toISOString() : null,
        rolling_start_rule_type: startMode === 'rolling_start' ? rollingStartRuleType : 'none',
        rolling_start_exact_start_at: startMode === 'rolling_start' && rollingStartRuleType === 'exact_datetime' && rollingStartExactStartAt
          ? new Date(rollingStartExactStartAt).toISOString()
          : null,
        rolling_start_days_after_acceptance: startMode === 'rolling_start' && rollingStartRuleType === 'days_after_acceptance'
          ? Math.max(1, parseInt(rollingStartDaysAfterAcceptance, 10) || 1)
          : null,
        rolling_start_weekday: startMode === 'rolling_start' && rollingStartRuleType === 'following_weekday'
          ? parseInt(rollingStartWeekday, 10)
          : null,
        rolling_start_weekday_time: startMode === 'rolling_start' && rollingStartRuleType === 'following_weekday'
          ? rollingStartWeekdayTime
          : null,
      };
      if (isAdmin) {
        payload.skip_card_validation = !enforceCardValidation;
      }
      if (jobAmount > 0) {
        payload.hourly_rate_cents = Math.round(hr * 100);
        payload.hours_per_day = hpd;
        payload.days = d;
      }
      await jobsAPI.create(payload);
      localStorage.removeItem(DRAFT_KEY);
      setSuccessModal(true);
    } catch (err) {
      setErrorModal(err.message || 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-8 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-bold mb-2">Create New Job</h1>
      <p className="text-sm text-gray-500 mb-6">Matches web parity fields and posting behavior used in production.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium mb-1">Title</label>
          <input
            className="w-full border px-3 py-2 rounded"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          {isAdmin && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3 mb-4">
              <h3 className="font-medium text-gray-900">Company Account</h3>
              <p className="text-xs text-gray-500">
                Search and select the company account this job should be attached to.
              </p>
              <input
                className="w-full border px-3 py-2 rounded bg-white"
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                placeholder="Search by company name..."
                disabled={companySelectionLocked}
              />
              {companySelectionLocked && (
                <p className="text-xs text-blue-700">
                  Company is locked. Click Edit to change selection.
                </p>
              )}
              {companySearchLoading && (
                <p className="text-xs text-gray-500">Searching companies...</p>
              )}
              {!companySelectionLocked && !companySearchLoading && companyOptions.length > 0 && (
                <div className="max-h-44 overflow-y-auto border rounded bg-white">
                  {companyOptions.map((company) => (
                    (() => {
                      const contactName = [company.contact_first_name, company.contact_last_name]
                        .map((x) => (x || '').trim())
                        .filter(Boolean)
                        .join(' ');
                      const companyLabel = company.company_name || `Company #${company.id}`;
                      const label = contactName ? `${companyLabel} — ${contactName}` : companyLabel;
                      return (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => {
                        setCompanyProfileId(company.id);
                        setSelectedCompanyName(label);
                        setCompanyQuery(companyLabel);
                        setCompanyOptions([]);
                        setCompanySelectionLocked(true);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0"
                    >
                      {label}
                    </button>
                      );
                    })()
                  ))}
                </div>
              )}
              {selectedCompanyName && (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-blue-900">
                    Selected company: <span className="font-semibold">{selectedCompanyName}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCompanySelectionLocked(false);
                      setCompanyOptions([]);
                    }}
                    className="text-xs px-2.5 py-1 rounded border border-blue-300 text-blue-800 bg-white hover:bg-blue-100"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-2 mb-4">
              <h3 className="font-medium text-gray-900">Card Validation</h3>
              <p className="text-xs text-gray-500">
                Toggle whether to require a saved card on the selected company before posting.
              </p>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enforceCardValidation}
                  onChange={(e) => setEnforceCardValidation(e.target.checked)}
                />
                Validate card on file before posting
              </label>
            </div>
          )}

          <label className="block font-medium mb-1">Description</label>
          <textarea
            className="w-full border px-3 py-2 rounded"
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-1">Class</label>
            <input
              className="w-full border px-3 py-2 rounded"
              value={skillClass}
              onChange={(e) => setSkillClass(e.target.value)}
              placeholder="e.g. Journeyman, Residential"
              list="job-class-suggestions"
            />
            <datalist id="job-class-suggestions">
              {CLASS_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block font-medium mb-1">Experience</label>
            <select
              className="w-full border px-3 py-2 rounded bg-white"
              value={minimumYearsExperience}
              onChange={(e) => setMinimumYearsExperience(e.target.value)}
            >
              {EXPERIENCE_YEAR_OPTIONS.map(({ value, label }) => (
                <option key={value === '' ? 'any' : value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <h3 className="font-medium text-gray-900">Go Live</h3>
          <p className="text-xs text-gray-500">
            By default, this job goes live when you post it.
          </p>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useCustomGoLiveAt}
              onChange={(e) => setUseCustomGoLiveAt(e.target.checked)}
            />
            Set different go-live date
          </label>
          {useCustomGoLiveAt && (
            <div>
              <label className="block font-medium mb-1 text-sm">Go live date & time</label>
              <DateTimeInput
                id="create-job-go-live-at"
                value={goLiveAt}
                onChange={(e) => setGoLiveAt(e.target.value)}
                className="w-full"
              />
            </div>
          )}
        </div>
        <div>
          <label className="block font-medium mb-1">Notes and conditions</label>
          <p className="text-xs text-gray-500 mb-2">
            Safety, certifications, site conditions, or other requirements—shown on the job listing like a referral sheet.
          </p>
          <textarea
            className="w-full border px-3 py-2 rounded min-h-[100px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. OSHA 30 required, drug screening, crawl spaces, etc."
          />
        </div>
        <div>
          <label className="block font-medium mb-1">Required Certifications</label>
          <p className="text-xs text-gray-500 mb-2">List certifications the tech must have. Techs upload certificate images; you verify they match.</p>
          <div className="space-y-2">
            {requiredCertifications.map((cert, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className="flex-1 border px-3 py-2 rounded"
                  value={cert}
                  onChange={(e) => {
                    const next = [...requiredCertifications];
                    next[idx] = e.target.value;
                    setRequiredCertifications(next);
                  }}
                  placeholder="e.g. OSHA 10, EPA 608"
                />
                <button
                  type="button"
                  onClick={() => setRequiredCertifications((prev) => prev.filter((_, i) => i !== idx))}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded border border-red-200"
                  title="Remove"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRequiredCertifications((prev) => [...prev, ""])}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 font-medium"
            >
              + Add certification
            </button>
          </div>
        </div>
        <JobAddressFields
          address={address}
          city={city}
          state={state}
          zipCode={zipCode}
          country={country}
          onChange={patchAddress}
        />
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
          <h3 className="font-medium text-gray-900">Pricing</h3>
          <p className="text-sm text-gray-600">
            {feeLabel != null
              ? `When a tech claims this job, you will be charged the job total plus a ${feeLabel}% platform fee (your company tier).`
              : isAdmin
                ? 'When a tech claims this job, you will be charged the job total plus a platform fee based on the selected company’s tier. Select a company account to see the rate.'
                : 'Loading your company’s platform fee…'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium mb-1 text-sm">Hourly rate (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 50"
                className="w-full border px-3 py-2 rounded bg-white"
                value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-medium mb-1 text-sm">Hours per day</label>
              <input
                type="number"
                min="1"
                max="24"
                className="w-full border px-3 py-2 rounded bg-white"
                value={hoursPerDay}
                onChange={e => setHoursPerDay(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-0.5">Default: 8</p>
            </div>
            <div>
              <label className="block font-medium mb-1 text-sm">Number of days</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 3"
                className="w-full border px-3 py-2 rounded bg-white"
                value={days}
                onChange={e => setDays(e.target.value)}
              />
            </div>
          </div>
          {jobAmount > 0 && (
            <div className="text-sm space-y-1 pt-2 border-t border-gray-200">
              <p><span className="font-medium">Job total:</span> ${jobAmount.toFixed(2)}</p>
              {companyCharge != null && feeLabel != null ? (
                <p>
                  <span className="font-medium">You pay (incl. {feeLabel}% fee):</span> ${companyCharge.toFixed(2)}
                </p>
              ) : (
                <p className="text-gray-500">
                  {isAdmin && !companyProfileId
                    ? 'Select a company account to preview the total you pay (includes tier-based fee).'
                    : 'Could not load fee rate yet.'}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="block font-medium mb-1">Start Mode</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={startMode}
              onChange={(e) => setStartMode(e.target.value)}
            >
              <option value="hard_start">Hard start date/time</option>
              <option value="rolling_start">Rolling start (starts when accepted)</option>
            </select>
          </div>
          {startMode === 'rolling_start' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">For rolling start jobs, start scheduling is set at claim time using the rule below.</p>
              <div>
                <label className="block font-medium mb-1 text-sm">Rolling start rule</label>
                <select
                  className="w-full border px-3 py-2 rounded bg-white"
                  value={rollingStartRuleType}
                  onChange={(e) => setRollingStartRuleType(e.target.value)}
                >
                  <option value="none">Technician chooses when claiming</option>
                  <option value="exact_datetime">Exact date/time required</option>
                  <option value="days_after_acceptance">X days after acceptance</option>
                  <option value="following_weekday">Following weekday at time</option>
                </select>
              </div>
              {rollingStartRuleType === 'exact_datetime' && (
                <div>
                  <label className="block font-medium mb-1 text-sm">Exact start date & time</label>
                  <DateTimeInput
                    id="create-job-rolling-exact-start"
                    value={rollingStartExactStartAt}
                    onChange={(e) => setRollingStartExactStartAt(e.target.value)}
                    className="w-full"
                  />
                </div>
              )}
              {rollingStartRuleType === 'days_after_acceptance' && (
                <div>
                  <label className="block font-medium mb-1 text-sm">Days after acceptance</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border px-3 py-2 rounded bg-white"
                    value={rollingStartDaysAfterAcceptance}
                    onChange={(e) => setRollingStartDaysAfterAcceptance(e.target.value)}
                  />
                </div>
              )}
              {rollingStartRuleType === 'following_weekday' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1 text-sm">Following weekday</label>
                    <select
                      className="w-full border px-3 py-2 rounded bg-white"
                      value={rollingStartWeekday}
                      onChange={(e) => setRollingStartWeekday(e.target.value)}
                    >
                      {WEEKDAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1 text-sm">Start time</label>
                    <input
                      type="time"
                      className="w-full border px-3 py-2 rounded bg-white"
                      value={rollingStartWeekdayTime}
                      onChange={(e) => setRollingStartWeekdayTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-1">Start Date & Time</label>
            <DateTimeInput
              id="create-job-start-at"
              value={scheduledStartAt}
              onChange={(e) => setScheduledStartAt(e.target.value)}
              className="w-full"
              disabled={startMode === 'rolling_start'}
            />
          </div>
          <div>
            <label className="block font-medium mb-1">End Date & Time</label>
            <DateTimeInput
              id="create-job-end-at"
              value={scheduledEndAt}
              onChange={(e) => setScheduledEndAt(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-0.5">Auto-calculated from days and hours (incl. 1 hr lunch/day). Adjust if needed.</p>
          </div>
        </div>
        <div>
          <label className="block font-medium mb-1">Status</label>
          <select
            className="w-full border px-3 py-2 rounded"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="draft">Draft</option>
          </select>
          {isAdmin && (
            <p className="text-xs text-gray-500 mt-1">
              Jobs go live immediately when status is set to Open.
            </p>
          )}
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          disabled={saving || !companyProfileId}
        >
          {saving ? 'Creating...' : 'Create Job'}
        </button>
        {isAdmin && (
          <p className="text-xs text-gray-600">
            Card validation:{" "}
            <span className={enforceCardValidation ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
              {enforceCardValidation ? "ON" : "OFF"}
            </span>
          </p>
        )}
      </form>

      <AlertModal
        isOpen={successModal}
        onClose={() => {
          setSuccessModal(false);
          navigate('/dashboard');
        }}
        title="Job created!"
        message="Your job has been posted. Technicians can now discover and claim it."
        variant="success"
      />

      <AlertModal
        isOpen={!!errorModal}
        onClose={() => setErrorModal(null)}
        title="Unable to create job"
        message={errorModal || ''}
        variant="error"
      />
    </div>
  );
};

export default CreateJob;
