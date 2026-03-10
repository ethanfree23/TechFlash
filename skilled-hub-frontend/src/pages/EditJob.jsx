import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { jobsAPI } from '../api/api';

const toDatetimeLocal = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const EditJob = () => {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', location: '', status: 'open' });
  const [saving, setSaving] = useState(false);
  const [extendEndAt, setExtendEndAt] = useState('');
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        setLoading(true);
        const data = await jobsAPI.getById(id);
        setJob(data);
        setForm({
          title: data.title || '',
          description: data.description || '',
          location: data.location || '',
          status: data.status || 'open',
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await jobsAPI.update(id, form);
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
          <label className="block font-medium mb-1">Location</label>
          <input
            className="w-full border px-3 py-2 rounded"
            name="location"
            value={form.location}
            onChange={handleChange}
            required
          />
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
        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
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