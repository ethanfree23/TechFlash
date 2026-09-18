import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AppFooter from '../components/layout/AppFooter';
import { adminAssessmentsAPI } from '../api/api';
import { TRADE_OPTIONS } from '../constants/trades';

export default function AdminAssessmentsPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', trade_type: '', description: '' });

  const load = async () => {
    setError('');
    try {
      const data = await adminAssessmentsAPI.list();
      setAssessments(data.assessments || []);
      setMeta(data);
    } catch (e) {
      setError(e?.message || 'Could not load assessments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const created = await adminAssessmentsAPI.create({
        slug: form.slug.trim(),
        title: form.title.trim(),
        trade_type: form.trade_type || null,
        description: form.description.trim() || null,
      });
      navigate(`/admin/assessments/${created.id}`);
    } catch (err) {
      setError(err?.details?.errors?.join?.(', ') || err?.message || 'Could not create assessment');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="assessments" emailVariant="crm" />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 pb-24">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Skills Assessments</h1>
          <p className="mt-1 text-sm text-gray-600">
            Author knowledge assessments, publish immutable versions, and import question banks. Scores are
            not certifications.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        <form onSubmit={onCreate} className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Create a new assessment</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              required
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="Title (e.g. HVAC Knowledge Assessment)"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <input
              required
              className="rounded-lg border px-3 py-2 text-sm font-mono"
              placeholder="slug (e.g. hvac_knowledge)"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={form.trade_type}
              onChange={(e) => setForm((f) => ({ ...f, trade_type: e.target.value }))}
            >
              <option value="">No recommended trade</option>
              {(meta.trade_options || TRADE_OPTIONS).map((trade) => (
                <option key={trade} value={trade}>
                  {trade}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="Short description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create draft'}
          </button>
        </form>

        {loading ? (
          <p className="text-gray-500">Loading assessments…</p>
        ) : assessments.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
            No assessments yet. Create one above or import a JSON bank from an assessment’s detail page.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Assessment</th>
                  <th className="px-4 py-3">Trade</th>
                  <th className="px-4 py-3">Live version</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assessments.map((assessment) => (
                  <tr key={assessment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/assessments/${assessment.id}`}
                        className="font-semibold text-blue-700 hover:text-blue-900"
                      >
                        {assessment.title}
                      </Link>
                      <p className="font-mono text-xs text-gray-500">{assessment.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{assessment.trade_type || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {assessment.live_version_number ? `v${assessment.live_version_number}` : 'None published'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {`${assessment.completed_attempts_count || 0} completed · ${
                        assessment.technicians_with_results_count || 0
                      } technicians`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          assessment.active
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {assessment.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
