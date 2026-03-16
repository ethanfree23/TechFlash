import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { jobsAPI, profilesAPI } from '../api/api';
import DateTimeInput from '../components/DateTimeInput';
import CountryStateSelect from '../components/CountryStateSelect';

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
  const defaultStart = getDefaultStart();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
  const [errorModal, setErrorModal] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await profilesAPI.getCompanyProfile();
        setCompanyProfileId(profile.id);
      } catch {
        setCompanyProfileId(null);
      }
    };
    fetchProfile();
  }, []);

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
      const payload = {
        title,
        description,
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
      if (jobAmount > 0) {
        payload.hourly_rate_cents = Math.round(hr * 100);
        payload.hours_per_day = hpd;
        payload.days = d;
      }
      await jobsAPI.create(payload);
      alert('Job created!');
      navigate('/dashboard');
    } catch (err) {
      setErrorModal(err.message || 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 bg-white p-8 rounded shadow">
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
          <label className="block font-medium mb-1">Description</label>
          <textarea
            className="w-full border px-3 py-2 rounded"
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
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
      </form>

      {/* Error modal - matches app design */}
      {errorModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Unable to create job</h2>
            <p className="text-gray-700 mb-6">{errorModal}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateJob;
