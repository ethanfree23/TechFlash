import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jobsAPI, profilesAPI, crmAPI } from '../api/api';
import DateTimeInput from '../components/DateTimeInput';
import JobAddressFields from '../components/JobAddressFields';
import AlertModal from '../components/AlertModal';
import WorkScheduleCalendarPopup from '../components/WorkScheduleCalendarPopup';
import { EXPERIENCE_YEAR_OPTIONS } from '../constants/experienceSelect';
import { auth } from '../auth';
import { companyChargeFromJobAmount, formatPlatformFeePercent } from '../utils/companyPlatformFee';
import {
  WEEKDAY_OPTIONS,
  WEEKEND_WORK_OPTIONS,
  DAY_WORK_POLICY_OPTIONS,
  DEFAULT_STANDARD_WORK_DAYS,
  buildScheduleSummary,
  computeExpectedCompletion,
} from '../utils/workSchedule';

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
  const [requireBackgroundCheck, setRequireBackgroundCheck] = useState(false);
  const [requireIdentityVerification, setRequireIdentityVerification] = useState(false);
  const [minimumVerifiedReferences, setMinimumVerifiedReferences] = useState("0");
  const [requireInsuranceVerification, setRequireInsuranceVerification] = useState(false);
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
  const [hardDeadlineAt, setHardDeadlineAt] = useState('');
  const [jobTimezone, setJobTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [standardWorkDays, setStandardWorkDays] = useState(DEFAULT_STANDARD_WORK_DAYS);
  const [standardDayShifts, setStandardDayShifts] = useState({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [weekendWorkPolicy, setWeekendWorkPolicy] = useState('prohibited');
  const [saturdayWorkPolicy, setSaturdayWorkPolicy] = useState('unavailable');
  const [sundayWorkPolicy, setSundayWorkPolicy] = useState('unavailable');
  const [saturdayMultiplier, setSaturdayMultiplier] = useState('1.5');
  const [sundayMultiplier, setSundayMultiplier] = useState('1.5');
  const [weekendRequiresCompanyApproval, setWeekendRequiresCompanyApproval] = useState(true);
  const [weekendRequiresTechnicianAcceptance, setWeekendRequiresTechnicianAcceptance] = useState(true);
  const [overtimeEnabled, setOvertimeEnabled] = useState(false);
  const [dailyOvertimeThresholdHours, setDailyOvertimeThresholdHours] = useState('');
  const [weeklyOvertimeThresholdHours, setWeeklyOvertimeThresholdHours] = useState('');
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5');
  const [premiumCombinationRule, setPremiumCombinationRule] = useState('highest_applicable');
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
  const location = useLocation();
  const duplicateFrom = location.state?.duplicateFrom;

  useEffect(() => {
    if (!duplicateFrom) return;
    const job = duplicateFrom;
    setTitle(job.title ? `Copy of ${job.title}` : '');
    setDescription(String(job.description || ''));
    setSkillClass(String(job.skill_class || ''));
    setMinimumYearsExperience(
      job.minimum_years_experience != null ? String(job.minimum_years_experience) : ''
    );
    setNotes(String(job.notes || ''));
    const certs = job.required_certifications;
    if (Array.isArray(certs) && certs.length > 0) {
      setRequiredCertifications(certs);
    } else if (typeof certs === 'string' && certs.trim()) {
      setRequiredCertifications(certs.split(',').map((c) => c.trim()).filter(Boolean));
    } else {
      setRequiredCertifications(['']);
    }
    setAddress(String(job.address || ''));
    setCity(String(job.city || ''));
    setState(String(job.state || 'Texas'));
    setZipCode(String(job.zip_code || ''));
    setCountry(String(job.country || 'United States'));
    setHourlyRate(
      job.hourly_rate_cents != null ? String((job.hourly_rate_cents / 100).toFixed(2)) : ''
    );
    setHoursPerDay(String(job.hours_per_day ?? '8'));
    setDays(job.days != null ? String(job.days) : '');
    setStatus('open');
    setRequireBackgroundCheck(Boolean(job.require_background_check));
    setRequireIdentityVerification(Boolean(job.require_identity_verification));
    setMinimumVerifiedReferences(String(job.minimum_verified_references ?? 0));
    setRequireInsuranceVerification(Boolean(job.require_insurance_verification));
    setStartMode(String(job.start_mode || 'hard_start'));
    setWeekendWorkPolicy(String(job.weekend_work_policy || 'prohibited'));
    setStandardWorkDays(Array.isArray(job.standard_work_days) && job.standard_work_days.length ? job.standard_work_days : DEFAULT_STANDARD_WORK_DAYS);
    setStandardDayShifts(job.standard_day_shifts || {});
    setSaturdayWorkPolicy(String(job.saturday_work_policy || 'unavailable'));
    setSundayWorkPolicy(String(job.sunday_work_policy || 'unavailable'));
    setSaturdayMultiplier(job.saturday_multiplier != null ? String(job.saturday_multiplier) : '1.5');
    setSundayMultiplier(job.sunday_multiplier != null ? String(job.sunday_multiplier) : '1.5');
    setWeekendRequiresCompanyApproval(Boolean(job.weekend_requires_company_approval ?? true));
    setWeekendRequiresTechnicianAcceptance(Boolean(job.weekend_requires_technician_acceptance ?? true));
    setOvertimeEnabled(Boolean(job.overtime_enabled));
    setDailyOvertimeThresholdHours(job.daily_overtime_threshold_hours != null ? String(job.daily_overtime_threshold_hours) : '');
    setWeeklyOvertimeThresholdHours(job.weekly_overtime_threshold_hours != null ? String(job.weekly_overtime_threshold_hours) : '');
    setOvertimeMultiplier(job.overtime_multiplier != null ? String(job.overtime_multiplier) : '1.5');
    setPremiumCombinationRule(String(job.premium_combination_rule || 'highest_applicable'));
    setHardDeadlineAt(job.hard_deadline_at ? toDatetimeLocal(job.hard_deadline_at) : '');
    setJobTimezone(String(job.job_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));
    if (job.scheduled_start_at) {
      setScheduledStartAt(toDatetimeLocal(job.scheduled_start_at));
    }
    if (job.scheduled_end_at) {
      setScheduledEndAt(toDatetimeLocal(job.scheduled_end_at));
    } else if (job.scheduled_start_at && job.days && job.hours_per_day) {
      setScheduledEndAt(
        computeEndFromPricing(toDatetimeLocal(job.scheduled_start_at), job.days, job.hours_per_day)
      );
    }
    if (isAdmin && job.company_profile_id) {
      setCompanyProfileId(job.company_profile_id);
      setSelectedCompanyName(job.company_profile?.company_name || '');
      setCompanySelectionLocked(true);
    }
  }, [duplicateFrom, isAdmin]);

  useEffect(() => {
    if (duplicateFrom) return;
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
      setRequireBackgroundCheck(Boolean(draft.requireBackgroundCheck));
      setRequireIdentityVerification(Boolean(draft.requireIdentityVerification));
      setMinimumVerifiedReferences(String(draft.minimumVerifiedReferences ?? '0'));
      setRequireInsuranceVerification(Boolean(draft.requireInsuranceVerification));
      setStartMode(String(draft.startMode || 'hard_start'));
      setWeekendWorkPolicy(String(draft.weekendWorkPolicy || 'prohibited'));
      setStandardWorkDays(Array.isArray(draft.standardWorkDays) && draft.standardWorkDays.length ? draft.standardWorkDays : DEFAULT_STANDARD_WORK_DAYS);
      setStandardDayShifts(draft.standardDayShifts || {});
      setSaturdayWorkPolicy(String(draft.saturdayWorkPolicy || 'unavailable'));
      setSundayWorkPolicy(String(draft.sundayWorkPolicy || 'unavailable'));
      setSaturdayMultiplier(String(draft.saturdayMultiplier || '1.5'));
      setSundayMultiplier(String(draft.sundayMultiplier || '1.5'));
      setWeekendRequiresCompanyApproval(Boolean(draft.weekendRequiresCompanyApproval ?? true));
      setWeekendRequiresTechnicianAcceptance(Boolean(draft.weekendRequiresTechnicianAcceptance ?? true));
      setOvertimeEnabled(Boolean(draft.overtimeEnabled));
      setDailyOvertimeThresholdHours(String(draft.dailyOvertimeThresholdHours || ''));
      setWeeklyOvertimeThresholdHours(String(draft.weeklyOvertimeThresholdHours || ''));
      setOvertimeMultiplier(String(draft.overtimeMultiplier || '1.5'));
      setPremiumCombinationRule(String(draft.premiumCombinationRule || 'highest_applicable'));
      setHardDeadlineAt(String(draft.hardDeadlineAt || ''));
      setJobTimezone(String(draft.jobTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));
      setScheduledStartAt(String(draft.scheduledStartAt || toDatetimeLocal(defaultStart)));
      setScheduledEndAt(String(draft.scheduledEndAt || computeEndFromPricing(toDatetimeLocal(defaultStart), 1, 8)));
      setUseCustomGoLiveAt(Boolean(draft.useCustomGoLiveAt));
      setGoLiveAt(String(draft.goLiveAt || toDatetimeLocal(new Date())));
    } catch {
      /* ignore bad draft */
    }
  }, [defaultStart, duplicateFrom]);

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
          requireBackgroundCheck,
          requireIdentityVerification,
          minimumVerifiedReferences,
          requireInsuranceVerification,
          startMode,
          weekendWorkPolicy,
          standardWorkDays,
          standardDayShifts,
          saturdayWorkPolicy,
          sundayWorkPolicy,
          saturdayMultiplier,
          sundayMultiplier,
          weekendRequiresCompanyApproval,
          weekendRequiresTechnicianAcceptance,
          overtimeEnabled,
          dailyOvertimeThresholdHours,
          weeklyOvertimeThresholdHours,
          overtimeMultiplier,
          premiumCombinationRule,
          hardDeadlineAt,
          jobTimezone,
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
    requireBackgroundCheck,
    requireIdentityVerification,
    minimumVerifiedReferences,
    requireInsuranceVerification,
    startMode,
    weekendWorkPolicy,
    standardWorkDays,
    standardDayShifts,
    saturdayWorkPolicy,
    sundayWorkPolicy,
    saturdayMultiplier,
    sundayMultiplier,
    weekendRequiresCompanyApproval,
    weekendRequiresTechnicianAcceptance,
    overtimeEnabled,
    dailyOvertimeThresholdHours,
    weeklyOvertimeThresholdHours,
    overtimeMultiplier,
    premiumCombinationRule,
    hardDeadlineAt,
    jobTimezone,
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
    const computedIso = computeExpectedCompletion({
      startAt: scheduledStartAt,
      workDaysCount: days,
      hoursPerDay,
      standardWorkDays,
    });
    if (computedIso) {
      setScheduledEndAt(toDatetimeLocal(computedIso));
    }
  }, [scheduledStartAt, days, hoursPerDay, startMode, standardWorkDays]);

  const hr = parseFloat(hourlyRate) || 0;
  const hpd = parseInt(hoursPerDay, 10) || 8;
  const d = parseInt(days, 10) || 0;
  const jobAmount = hr * hpd * d;
  const feeReady = platformFeePercent !== null && (!isAdmin || companyProfileId);
  const companyCharge = feeReady && jobAmount > 0
    ? companyChargeFromJobAmount(jobAmount, platformFeePercent)
    : null;
  const feeLabel = feeReady ? formatPlatformFeePercent(platformFeePercent) : null;
  const scheduleSummary = buildScheduleSummary({
    standardWorkDays,
    weekendWorkPolicy,
    saturdayWorkPolicy,
    sundayWorkPolicy,
    saturdayMultiplier,
    sundayMultiplier,
    overtimeEnabled,
    overtimeMultiplier,
  });

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
    if (weekendWorkPolicy === 'required' && saturdayWorkPolicy === 'unavailable' && sundayWorkPolicy === 'unavailable') {
      setErrorModal('Weekend-required jobs must include Saturday or Sunday availability.');
      return;
    }
    if (weekendWorkPolicy === 'optional' && saturdayWorkPolicy === 'unavailable' && sundayWorkPolicy === 'unavailable') {
      setErrorModal('Select at least one weekend day that may be offered.');
      return;
    }
    if (weekendWorkPolicy === 'prohibited' && standardWorkDays.some((d) => Number(d) === 6 || Number(d) === 7)) {
      setErrorModal('Remove Saturday and Sunday from standard working days when weekend work is prohibited.');
      return;
    }
    if (saturdayWorkPolicy === 'premium_rate' && !saturdayMultiplier) {
      setErrorModal('Saturday multiplier is required when Saturday premium pay is selected.');
      return;
    }
    if (sundayWorkPolicy === 'premium_rate' && !sundayMultiplier) {
      setErrorModal('Sunday multiplier is required when Sunday premium pay is selected.');
      return;
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
        require_background_check: requireBackgroundCheck,
        require_identity_verification: requireIdentityVerification,
        minimum_verified_references: Math.max(0, parseInt(minimumVerifiedReferences, 10) || 0),
        require_insurance_verification: requireInsuranceVerification,
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
        weekend_work_policy: weekendWorkPolicy,
        standard_work_days: standardWorkDays,
        standard_day_shifts: standardDayShifts,
        saturday_work_policy: saturdayWorkPolicy,
        sunday_work_policy: sundayWorkPolicy,
        saturday_multiplier: saturdayWorkPolicy === 'premium_rate' ? Number(saturdayMultiplier) : null,
        sunday_multiplier: sundayWorkPolicy === 'premium_rate' ? Number(sundayMultiplier) : null,
        weekend_requires_company_approval: weekendRequiresCompanyApproval,
        weekend_requires_technician_acceptance: weekendRequiresTechnicianAcceptance,
        overtime_enabled: overtimeEnabled,
        daily_overtime_threshold_hours: overtimeEnabled && dailyOvertimeThresholdHours ? Number(dailyOvertimeThresholdHours) : null,
        weekly_overtime_threshold_hours: overtimeEnabled && weeklyOvertimeThresholdHours ? Number(weeklyOvertimeThresholdHours) : null,
        overtime_multiplier: overtimeEnabled ? Number(overtimeMultiplier || 1.5) : null,
        premium_combination_rule: premiumCombinationRule,
        hard_deadline_at: hardDeadlineAt ? new Date(hardDeadlineAt).toISOString() : null,
        job_timezone: jobTimezone || 'UTC',
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
    <div className="max-w-4xl mx-auto mt-8 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-5 text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        ← Back
      </button>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Create New Job</h1>
      <p className="text-sm text-slate-500 mb-6">Matches web parity fields and posting behavior used in production.</p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={fieldClass}
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          {isAdmin && (
            <div className={`${sectionCardClass} mb-4`}>
              <h3 className="font-semibold text-slate-900">Company Account</h3>
              <p className="text-xs text-slate-500">
                Search and select the company account this job should be attached to.
              </p>
              <input
                className={fieldClass}
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
                <p className="text-xs text-slate-500">Searching companies...</p>
              )}
              {!companySelectionLocked && !companySearchLoading && companyOptions.length > 0 && (
                <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg bg-white">
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
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-b-0"
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
            <div className={`${sectionCardClass} mb-4`}>
              <h3 className="font-semibold text-slate-900">Card Validation</h3>
              <p className="text-xs text-slate-500">
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

          <label className={labelClass}>Description</label>
          <textarea
            className={`${fieldClass} min-h-[120px]`}
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Class</label>
            <input
              className={fieldClass}
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
            <label className={labelClass}>Experience</label>
            <select
              className={fieldClass}
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
        <div className={sectionCardClass}>
          <h3 className="font-semibold text-slate-900">Go Live</h3>
          <p className="text-xs text-slate-500">
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
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Go live date & time</label>
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
          <label className={labelClass}>Notes and conditions</label>
          <p className="text-xs text-slate-500 mb-2">
            Safety, certifications, site conditions, or other requirements—shown on the job listing like a referral sheet.
          </p>
          <textarea
            className={`${fieldClass} min-h-[100px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. OSHA 30 required, drug screening, crawl spaces, etc."
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">Verification requirements</label>
          <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/70 space-y-3">
            <label className="flex items-center justify-between text-sm gap-4">
              <span>Require background check</span>
              <input
                type="checkbox"
                checked={requireBackgroundCheck}
                onChange={(e) => setRequireBackgroundCheck(e.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between text-sm gap-4">
              <span>Require identity verification</span>
              <input
                type="checkbox"
                checked={requireIdentityVerification}
                onChange={(e) => setRequireIdentityVerification(e.target.checked)}
              />
            </label>
            <div className="flex items-center justify-between text-sm gap-4">
              <label htmlFor="minimum-verified-references">Minimum verified references</label>
              <input
                id="minimum-verified-references"
                type="number"
                min="0"
                max="10"
                className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none"
                value={minimumVerifiedReferences}
                onChange={(e) => setMinimumVerifiedReferences(e.target.value)}
              />
            </div>
            <label className="flex items-center justify-between text-sm gap-4">
              <span>Require insurance verification</span>
              <input
                type="checkbox"
                checked={requireInsuranceVerification}
                onChange={(e) => setRequireInsuranceVerification(e.target.checked)}
              />
            </label>
          </div>
        </div>
        <div>
          <label className={labelClass}>Required Certifications</label>
          <p className="text-xs text-slate-500 mb-2">List certifications the tech must have. Techs upload certificate images; you verify they match.</p>
          <div className="space-y-2">
            {requiredCertifications.map((cert, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className={`${fieldClass} flex-1`}
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
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
          <h3 className="font-semibold text-slate-900">Pricing</h3>
          <p className="text-sm text-slate-600">
            {feeLabel != null
              ? `When a tech claims this job, you will be charged the job total plus a ${feeLabel}% platform fee (your company tier).`
              : isAdmin
                ? 'When a tech claims this job, you will be charged the job total plus a platform fee based on the selected company’s tier. Select a company account to see the rate.'
                : 'Loading your company’s platform fee…'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Hourly rate (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 50"
                className={fieldClass}
                value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Hours per day</label>
              <input
                type="number"
                min="1"
                max="24"
                className={fieldClass}
                value={hoursPerDay}
                onChange={e => setHoursPerDay(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-0.5">Default: 8</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Number of days</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 3"
                className={fieldClass}
                value={days}
                onChange={e => setDays(e.target.value)}
              />
            </div>
          </div>
          {jobAmount > 0 && (
            <div className="text-sm space-y-1 pt-2 border-t border-slate-200">
              <p><span className="font-medium">Job total:</span> ${jobAmount.toFixed(2)}</p>
              {companyCharge != null && feeLabel != null ? (
                <p>
                  <span className="font-medium">You pay (incl. {feeLabel}% fee):</span> ${companyCharge.toFixed(2)}
                </p>
              ) : (
                <p className="text-slate-500">
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
            <label className={labelClass}>Start Mode</label>
            <select
              className={fieldClass}
              value={startMode}
              onChange={(e) => setStartMode(e.target.value)}
            >
              <option value="hard_start">Hard start date/time</option>
              <option value="rolling_start">Rolling start (starts when accepted)</option>
            </select>
          </div>
          {startMode === 'rolling_start' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">For rolling start jobs, start scheduling is set at claim time using the rule below.</p>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Rolling start rule</label>
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
              </div>
              {rollingStartRuleType === 'exact_datetime' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Exact start date & time</label>
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
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Start Date & Time</label>
            <DateTimeInput
              id="create-job-start-at"
              value={scheduledStartAt}
              onChange={(e) => setScheduledStartAt(e.target.value)}
              className="w-full"
              disabled={startMode === 'rolling_start'}
            />
          </div>
          <div>
            <label className={labelClass}>End Date & Time</label>
            <DateTimeInput
              id="create-job-end-at"
              value={scheduledEndAt}
              onChange={(e) => setScheduledEndAt(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-0.5">Auto-calculated from days and hours (incl. 1 hr lunch/day). Adjust if needed.</p>
          </div>
        </div>
        <div className={sectionCardClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Work schedule</h3>
              <p className="text-xs text-slate-500">Set standard days and optional per-day start/end times.</p>
            </div>
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Open calendar
            </button>
          </div>
          <div>
            <label className={labelClass}>Standard working days</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {WEEKDAY_OPTIONS.map((opt) => {
                const selected = standardWorkDays.includes(opt.value);
                return (
                  <label key={opt.value} className={`rounded border px-2 py-1 text-sm ${selected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={selected}
                      onChange={(e) => {
                        setStandardWorkDays((prev) => e.target.checked
                          ? [...prev, opt.value].sort((a, b) => a - b)
                          : prev.filter((d) => d !== opt.value));
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Hard deadline</label>
              <DateTimeInput
                id="create-job-hard-deadline"
                value={hardDeadlineAt}
                onChange={(e) => setHardDeadlineAt(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className={labelClass}>Job timezone</label>
              <input className={fieldClass} value={jobTimezone} onChange={(e) => setJobTimezone(e.target.value)} placeholder="America/Chicago" />
            </div>
          </div>
        </div>
        <div className={sectionCardClass}>
          <h3 className="font-semibold text-slate-900">Weekend work</h3>
          <select className={fieldClass} value={weekendWorkPolicy} onChange={(e) => setWeekendWorkPolicy(e.target.value)}>
            {WEEKEND_WORK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {weekendWorkPolicy !== 'prohibited' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Saturday availability</label>
                <select className={fieldClass} value={saturdayWorkPolicy} onChange={(e) => setSaturdayWorkPolicy(e.target.value)}>
                  {DAY_WORK_POLICY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                {saturdayWorkPolicy === 'premium_rate' && (
                  <input type="number" min="1" max="3" step="0.1" className={`${fieldClass} mt-2`} value={saturdayMultiplier} onChange={(e) => setSaturdayMultiplier(e.target.value)} />
                )}
              </div>
              <div>
                <label className={labelClass}>Sunday availability</label>
                <select className={fieldClass} value={sundayWorkPolicy} onChange={(e) => setSundayWorkPolicy(e.target.value)}>
                  {DAY_WORK_POLICY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                {sundayWorkPolicy === 'premium_rate' && (
                  <input type="number" min="1" max="3" step="0.1" className={`${fieldClass} mt-2`} value={sundayMultiplier} onChange={(e) => setSundayMultiplier(e.target.value)} />
                )}
              </div>
            </div>
          )}
          {weekendWorkPolicy === 'optional' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between text-sm">
                Technician acceptance required
                <input type="checkbox" checked={weekendRequiresTechnicianAcceptance} onChange={(e) => setWeekendRequiresTechnicianAcceptance(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between text-sm">
                Company approval required
                <input type="checkbox" checked={weekendRequiresCompanyApproval} onChange={(e) => setWeekendRequiresCompanyApproval(e.target.checked)} />
              </label>
            </div>
          )}
          {weekendWorkPolicy === 'prohibited' && (
            <p className="text-xs text-slate-600">If the job is unfinished at the end of Friday, it will resume on the next scheduled workday.</p>
          )}
        </div>
        <div className={sectionCardClass}>
          <h3 className="font-semibold text-slate-900">Overtime</h3>
          <label className="flex items-center justify-between text-sm">
            Overtime eligibility
            <input type="checkbox" checked={overtimeEnabled} onChange={(e) => setOvertimeEnabled(e.target.checked)} />
          </label>
          {overtimeEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Daily threshold (hours)</label>
                <input type="number" min="1" step="0.5" className={fieldClass} value={dailyOvertimeThresholdHours} onChange={(e) => setDailyOvertimeThresholdHours(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Weekly threshold (hours)</label>
                <input type="number" min="1" step="0.5" className={fieldClass} value={weeklyOvertimeThresholdHours} onChange={(e) => setWeeklyOvertimeThresholdHours(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Overtime multiplier</label>
                <input type="number" min="1" max="3" step="0.1" className={fieldClass} value={overtimeMultiplier} onChange={(e) => setOvertimeMultiplier(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <label className={labelClass}>Overtime and weekend premium interaction</label>
            <select className={fieldClass} value={premiumCombinationRule} onChange={(e) => setPremiumCombinationRule(e.target.value)}>
              <option value="highest_applicable">Pay highest applicable rate</option>
              <option value="stacked">Stack multipliers</option>
            </select>
            <p className="text-xs text-slate-600 mt-1">Weekend premium pay applies because of day worked. Overtime applies after hour thresholds.</p>
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
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="draft">Draft</option>
          </select>
          {isAdmin && (
            <p className="text-xs text-slate-500 mt-1">
              Jobs go live immediately when status is set to Open.
            </p>
          )}
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50"
          disabled={saving || !companyProfileId}
        >
          {saving ? 'Creating...' : 'Create Job'}
        </button>
        {isAdmin && (
          <p className="text-xs text-slate-600">
            Card validation:{" "}
            <span className={enforceCardValidation ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
              {enforceCardValidation ? "ON" : "OFF"}
            </span>
          </p>
        )}
      </form>

      <WorkScheduleCalendarPopup
        isOpen={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        selectedDays={standardWorkDays}
        shiftsByDay={standardDayShifts}
        onApply={({ selectedDays, shiftsByDay }) => {
          setStandardWorkDays(selectedDays);
          setStandardDayShifts(shiftsByDay);
          setCalendarOpen(false);
        }}
      />

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
