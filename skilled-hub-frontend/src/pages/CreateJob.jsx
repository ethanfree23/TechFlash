import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { jobsAPI, profilesAPI } from '../api/api';

const toDatetimeLocal = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const CreateJob = () => {
  const now = new Date();
  const defaultEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 day
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("open");
  const [scheduledStartAt, setScheduledStartAt] = useState(toDatetimeLocal(now));
  const [scheduledEndAt, setScheduledEndAt] = useState(toDatetimeLocal(defaultEnd));
  const [saving, setSaving] = useState(false);
  const [companyProfileId, setCompanyProfileId] = useState(null);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await jobsAPI.create({
        title,
        description,
        location,
        status,
        company_profile_id: companyProfileId,
        scheduled_start_at: scheduledStartAt ? new Date(scheduledStartAt).toISOString() : null,
        scheduled_end_at: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : null,
      });
      alert('Job created!');
      navigate('/dashboard');
    } catch (err) {
      alert('Failed to create job');
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
          <label className="block font-medium mb-1">Location</label>
          <input
            className="w-full border px-3 py-2 rounded"
            value={location}
            onChange={e => setLocation(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-1">Start Date & Time</label>
            <input
              type="datetime-local"
              className="w-full border px-3 py-2 rounded"
              value={scheduledStartAt}
              onChange={e => setScheduledStartAt(e.target.value)}
            />
          </div>
          <div>
            <label className="block font-medium mb-1">End Date & Time</label>
            <input
              type="datetime-local"
              className="w-full border px-3 py-2 rounded"
              value={scheduledEndAt}
              onChange={e => setScheduledEndAt(e.target.value)}
            />
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
    </div>
  );
};

export default CreateJob; 