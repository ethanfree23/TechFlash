import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jobsAPI } from '../api/api';
import CountryStateSelect from '../components/CountryStateSelect';

const toDatetimeLocal = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const EditJob = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', required_certifications: [''], address: '', city: '', state: '', zip_code: '', country: '', status: 'open',
    hourly_rate_cents: '', hours_per_day: '8', days: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [extendEndAt, setExtendEndAt] = useState('');
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        setLoading(true);
        const data = await jobsAPI.getById(id);
        setJob(data);
        const hasNewPricing = data.hourly_rate_cents != null && data.days != null;
        setForm({
          title: data.title || '',
          description: data.description || '',
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
          status: data.status || 'open',
          hourly_rate_cents: hasNewPricing ? (data.hourly_rate_cents / 100).toFixed(2) : '',
          hours_per_day: data.hours_per_day ?? 8,
          days: data.days ?? '',
        });
        const currentEnd = data.scheduled_end_at;
        const defaultEnd = currentEnd ? new Date(currentEnd) : new Date(Date.now() + 24 * 60 * 60 * 1000);
        setExtendEndAt(toDatetimeLocal(currentEnd || defaultEnd));
        setError(null);
      } catch (err) {
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
  const companyCharge = jobAmount * 1.05;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        required_certifications: Array.isArray(form.required_certifications) && form.required_certifications.filter((c) => c?.trim()).length
          ? form.required_certifications.filter((c) => c?.trim()).join(", ")
          : null,
        address: form.address,
        city: form.city,
        state: form.state,
        zip_code: form.zip_code,
        country: form.country,
        status: form.status,
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
      alert('Job updated!');
      const data = await jobsAPI.getById(id);
      setJob(data);
    } catch (err) {
      alert('Failed to update job');
    } finally {
      setSaving(false);
    }
  };

  const handleExtend = async (e) => {
    e.preventDefault();
    if (!extendEndAt) {
      alert('Please select a new end date and time');
      return;
    }
    setExtending(true);
    try {
      await jobsAPI.extend(id, { scheduled_end_at: new Date(extendEndAt).toISOString() });
      alert('Job extended!');
      const data = await jobsAPI.getById(id);
      setJob(data);
      setExtendEndAt(toDatetimeLocal(data.scheduled_end_at));
    } catch (err) {
      alert(err.message || 'Failed to extend job');
    } finally {
      setExtending(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this job? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await jobsAPI.delete(id);
      alert('Job deleted.');
      navigate('/dashboard');
    } catch (err) {
      alert(err.message || 'Failed to delete job');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="max-w-xl mx-auto mt-10">Loading...</div>;
  if (error) return <div className="max-w-xl mx-auto mt-10 text-red-600">{error}</div>;
  if (!job) return <div className="max-w-xl mx-auto mt-10 text-red-600">Job not found</div>;

  return (
    <div className="max-w-xl mx-auto mt-10 bg-white p-8 rounded shadow">
      <h1 className="text-2xl font-bold mb-6">Edit Job</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium mb-1">Title</label>
          <input
            className="w-full border px-3 py-2 rounded"
            name="title"
            value={form.title}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label className="block font-medium mb-1">Description</label>
          <textarea
            className="w-full border px-3 py-2 rounded"
            name="description"
            value={form.description}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label className="block font-medium mb-1">Required Certifications</label>
          <p className="text-xs text-gray-500 mb-2">List certifications the tech must have. Techs upload certificate images; you verify they match.</p>
          <div className="space-y-2">
            {(form.required_certifications || ['']).map((cert, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className="flex-1 border px-3 py-2 rounded"
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
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
          <h3 className="font-medium text-gray-900">Job Location</h3>
          <div>
            <label className="block font-medium mb-1 text-sm">Address</label>
            <input className="w-full border px-3 py-2 rounded bg-white" name="address" value={form.address} onChange={handleChange} placeholder="e.g. 123 Main St" required />
          </div>
          <div>
            <label className="block font-medium mb-1 text-sm">City</label>
            <input className="w-full border px-3 py-2 rounded bg-white" name="city" value={form.city} onChange={handleChange} placeholder="e.g. Houston" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CountryStateSelect
              country={form.country}
              state={form.state}
              onCountryChange={(v) => handleChange({ target: { name: 'country', value: v } })}
              onStateChange={(v) => handleChange({ target: { name: 'state', value: v } })}
              required
            />
          </div>
          <div>
            <label className="block font-medium mb-1 text-sm">Zip Code</label>
            <input className="w-full border px-3 py-2 rounded bg-white" name="zip_code" value={form.zip_code} onChange={handleChange} placeholder="e.g. 77007" />
          </div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
          <h3 className="font-medium text-gray-900">Pricing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium mb-1 text-sm">Hourly rate (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                name="hourly_rate_cents"
                className="w-full border px-3 py-2 rounded bg-white"
                value={form.hourly_rate_cents}
                onChange={handleChange}
                placeholder="e.g. 50"
              />
            </div>
            <div>
              <label className="block font-medium mb-1 text-sm">Hours per day</label>
              <input
                type="number"
                min="1"
                max="24"
                name="hours_per_day"
                className="w-full border px-3 py-2 rounded bg-white"
                value={form.hours_per_day}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block font-medium mb-1 text-sm">Number of days</label>
              <input
                type="number"
                min="0"
                name="days"
                className="w-full border px-3 py-2 rounded bg-white"
                value={form.days}
                onChange={handleChange}
                placeholder="e.g. 3"
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
        <div>
          <label className="block font-medium mb-1">Status</label>
          <select
            className="w-full border px-3 py-2 rounded"
            name="status"
            value={form.status}
            onChange={handleChange}
          >
            <option value="open">Open</option>
            <option value="draft">Draft</option>
            <option value="filled">Filled</option>
            <option value="finished">Finished</option>
            <option value="closed">Closed</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="flex gap-4 items-center">
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Job'}
          </button>
        </div>
      </form>

      {job?.status === 'reserved' && (
        <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
          <h2 className="text-lg font-semibold mb-4">Extend Job</h2>
          <p className="text-sm text-gray-600 mb-4">Current end: {job.scheduled_end_at ? new Date(job.scheduled_end_at).toLocaleString() : 'Not set'}</p>
          <form onSubmit={handleExtend} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block font-medium mb-1 text-sm">New End Date & Time</label>
              <input
                type="datetime-local"
                className="w-full border px-3 py-2 rounded"
                value={extendEndAt}
                onChange={e => setExtendEndAt(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="bg-amber-600 text-white px-6 py-2 rounded hover:bg-amber-700"
              disabled={extending}
            >
              {extending ? 'Extending...' : 'Extend'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default EditJob;
