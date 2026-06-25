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
    if (!form.reliability || !form.quality || !form.communication || !form.safety) {
      setError('Please provide a star rating for each category.');
      return;
    }
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
            <StarRating
              name="reliability"
              label="Reliability"
              value={form.reliability}
              onChange={onChange}
            />
            <StarRating
              name="quality"
              label="Quality of work"
              value={form.quality}
              onChange={onChange}
            />
            <StarRating
              name="communication"
              label="Communication"
              value={form.communication}
              onChange={onChange}
            />
            <StarRating
              name="safety"
              label="Safety professionalism"
              value={form.safety}
              onChange={onChange}
            />
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

function Select({ name, label, value, onChange, required }) {
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
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

function StarRating({ name, label, value, onChange }) {
  const selected = Number(value) || 0;
  const setRating = (rating) => {
    onChange({ target: { name, value: String(rating) } });
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={`${label} from 1 to 5 stars`}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            role="radio"
            aria-checked={selected === rating}
            aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
            onClick={() => setRating(rating)}
            className={`text-2xl leading-none transition-colors ${
              rating <= selected ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-1">Left is 1 star, right is 5 stars.</p>
    </div>
  );
}
