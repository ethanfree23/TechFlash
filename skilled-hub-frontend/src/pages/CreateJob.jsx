import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { jobsAPI, profilesAPI, crmAPI } from '../api/api';
import DateTimeInput from '../components/DateTimeInput';
import CountryStateSelect from '../components/CountryStateSelect';
import AlertModal from '../components/AlertModal';
import { EXPERIENCE_YEAR_OPTIONS } from '../constants/experienceSelect';
import { auth } from '../auth';

const toDatetimeLocal = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const LUNCH_HOURS = 1;

const getDefaultStart = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  return tomorrow;
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
  const end = new Date(start);
  end.setDate(end.getDate() + d - 1);
  const endHour = start.getHours() + hpd + LUNCH_HOURS;
  end.setHours(endHour, start.getMinutes(), 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
};

const CreateJob = () => {
  const user = auth.getUser();
  const isAdmin = user?.role === 'admin';
  const defaultStart = getDefaultStart();
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
  const [scheduledStartAt, setScheduledStartAt] = useState(toDatetimeLocal(defaultStart));
  const [scheduledEndAt, setScheduledEndAt] = useState(
    computeEndFromPricing(toDatetimeLocal(defaultStart), 1, 8)
  );
  const [saving, setSaving] = useState(false);
  const [companyProfileId, setCompanyProfileId] = useState(null);
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [enforceCardValidation, setEnforceCardValidation] = useState(true);
  const [successModal, setSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) return;

    const fetchProfile = async () => {
      try {
        const profile = await profilesAPI.getCompanyProfile();
        setCompanyProfileId(profile.id);
      } catch {
        setCompanyProfileId(null);
      }
    };
    fetchProfile();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
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
  }, [companyQuery, isAdmin]);

  // Auto-compute end date/time from start + days + hours per day (+ 1 hr lunch)
  useEffect(() => {
    const computed = computeEndFromPricing(scheduledStartAt, days, hoursPerDay);
    if (computed) setScheduledEndAt(computed);
  }, [scheduledStartAt, days, hoursPerDay]);

  const hr = parseFloat(hourlyRate) || 0;
  const hpd = parseInt(hoursPerDay, 10) || 8;
  const d = parseInt(days, 10) || 0;
  const jobAmount = hr * hpd * d;
  const companyCharge = jobAmount * 1.05;

  const handleSubmit = async (e) => {
    e.preventDefault();
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
        company_profile_id: companyProfileId,
        scheduled_start_at: scheduledStartAt ? new Date(scheduledStartAt).toISOString() : null,
        scheduled_end_at: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : null,
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
      setSuccessModal(true);
    } catch (err) {
      setErrorModal(err.message || 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 bg-white p-8 rounded shadow">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-bold mb-6">Create New Job</h1>
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
              />
              {companySearchLoading && (
                <p className="text-xs text-gray-500">Searching companies...</p>
              )}
              {!companySearchLoading && companyOptions.length > 0 && (
                <div className="max-h-44 overflow-y-auto border rounded bg-white">
                  {companyOptions.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => {
                        setCompanyProfileId(company.id);
                        setSelectedCompanyName(company.company_name || `Company #${company.id}`);
                        setCompanyQuery(company.company_name || '');
                        setCompanyOptions([]);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0"
                    >
                      {company.company_name || `Company #${company.id}`}
                    </button>
                  ))}
                </div>
              )}
              {selectedCompanyName && (
                <p className="text-sm text-green-700">
                  Selected company: <span className="font-medium">{selectedCompanyName}</span>
                </p>
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
            />
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
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
          <h3 className="font-medium text-gray-900">Job Location</h3>
          <div>
            <label className="block font-medium mb-1 text-sm">Address</label>
            <input
              className="w-full border px-3 py-2 rounded bg-white"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. 123 Main St"
              required
            />
          </div>
          <div>
            <label className="block font-medium mb-1 text-sm">City</label>
            <input
              className="w-full border px-3 py-2 rounded bg-white"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Houston"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CountryStateSelect
              country={country}
              state={state}
              onCountryChange={setCountry}
              onStateChange={setState}
              required
            />
          </div>
          <div>
            <label className="block font-medium mb-1 text-sm">Zip Code</label>
            <input
              className="w-full border px-3 py-2 rounded bg-white"
              value={zipCode}
              onChange={e => setZipCode(e.target.value)}
              placeholder="e.g. 77007"
            />
          </div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
          <h3 className="font-medium text-gray-900">Pricing</h3>
          <p className="text-sm text-gray-600">When a tech claims this job, you will be charged the total + 5% platform fee.</p>
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
              <p><span className="font-medium">You pay (incl. 5% fee):</span> ${companyCharge.toFixed(2)}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-1">Start Date & Time</label>
            <DateTimeInput
              value={scheduledStartAt}
              onChange={(e) => setScheduledStartAt(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">End Date & Time</label>
            <DateTimeInput
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
