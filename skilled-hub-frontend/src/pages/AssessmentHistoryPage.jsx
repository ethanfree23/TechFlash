import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppPageLayout from '../components/layout/AppPageLayout';
import { assessmentsAPI } from '../api/api';

function formatDate(iso) {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AssessmentHistoryPage({ user, onLogout }) {
  const { assessmentSlug } = useParams();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await assessmentsAPI.history(assessmentSlug);
      setAttempts(data.attempts || []);
    } catch (e) {
      setError(e?.message || 'Could not load your attempts');
    } finally {
      setLoading(false);
    }
  }, [assessmentSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const bestScore = attempts.reduce((best, attempt) => {
    if (attempt.score == null) return best;
    return best == null || attempt.score > best ? attempt.score : best;
  }, null);

  return (
    <AppPageLayout user={user} onLogout={onLogout} activePage="assessments" maxWidthClass="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My attempts</h1>
        <p className="mt-1 text-gray-600">You see every attempt here. Employers only see your best result.</p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}
      {loading && <p className="text-gray-500">Loading your attempts…</p>}
      {!loading && attempts.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          You have not taken an assessment yet.
        </div>
      )}

      <div className="space-y-3">
        {attempts.map((attempt) => {
          const isBest = bestScore != null && attempt.score === bestScore;
          const finished = attempt.status !== 'in_progress';

          return (
            <button
              key={attempt.id}
              type="button"
              onClick={() =>
                navigate(
                  finished
                    ? `/assessments/results/${attempt.id}`
                    : `/assessments/attempts/${attempt.id}`
                )
              }
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-gray-300"
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">
                  {`Attempt ${attempt.attempt_number} · ${attempt.assessment_title}`}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {[
                    formatDate(attempt.completed_at || attempt.started_at),
                    `v${attempt.version_number}`,
                    attempt.status === 'expired' ? 'Ran out of time' : null,
                    attempt.status === 'in_progress' ? 'In progress' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {attempt.score_band_label && (
                  <p className="mt-1 text-xs font-medium text-blue-800">{attempt.score_band_label}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{attempt.score == null ? '—' : attempt.score}</p>
                {isBest && (
                  <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                    Shown to employers
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </AppPageLayout>
  );
}
