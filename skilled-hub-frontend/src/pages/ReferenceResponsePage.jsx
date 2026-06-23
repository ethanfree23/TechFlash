import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { verificationReferencesAPI } from '../api/api';

export default function ReferenceResponsePage() {
  const { token } = useParams();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    would_rehire: '',
    reliability: '',
    quality: '',
    communication: '',
    safety: '',
    comments: '',
  });

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await verificationReferencesAPI.respond(token, form);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Unable to submit reference.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Professional Reference</h1>
        <p className="text-sm text-gray-600 mb-5">Please answer honestly. Your feedback helps keep TechFlash trusted and safe.</p>

        {submitted ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            Thank you. Your reference response has been submitted.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <Select name="would_rehire" label="Would you hire this technician again?" value={form.would_rehire} onChange={onChange} required />
            <Select name="reliability" label="Reliability (1-5)" value={form.reliability} onChange={onChange} required numeric />
            <Select name="quality" label="Quality of work (1-5)" value={form.quality} onChange={onChange} required numeric />
            <Select name="communication" label="Communication (1-5)" value={form.communication} onChange={onChange} required numeric />
            <Select name="safety" label="Safety professionalism (1-5)" value={form.safety} onChange={onChange} required numeric />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
              <textarea
                name="comments"
                value={form.comments}
                onChange={onChange}
                className="w-full border rounded-lg px-3 py-2"
                rows={4}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-700">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit reference'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Select({ name, label, value, onChange, required, numeric = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full border rounded-lg px-3 py-2 bg-white"
        required={required}
      >
        <option value="">Select...</option>
        {numeric ? (
          [1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{n}</option>)
        ) : (
          <>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </>
        )}
      </select>
    </div>
  );
}
