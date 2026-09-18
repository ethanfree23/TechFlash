import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppPageLayout from '../components/layout/AppPageLayout';
import { assessmentsAPI } from '../api/api';

function formatTime(assessment) {
  const minutes = assessment.estimated_minutes;
  if (!minutes) return 'No time limit';
  return assessment.time_limit_minutes ? `${minutes} min limit` : `About ${minutes} min`;
}

function formatRetakeDate(iso) {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function MetaPill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
      {children}
    </span>
  );
}

export default function SkillsAssessmentsPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingSlug, setStartingSlug] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setCatalog(await assessmentsAPI.catalog());
    } catch (e) {
      setError(e?.message || 'Could not load assessments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onStart = async (assessment) => {
    setStartingSlug(assessment.slug);
    setError('');
    try {
      const attempt = await assessmentsAPI.start(assessment.slug);
      navigate(`/assessments/attempts/${attempt.id}`);
    } catch (e) {
      setError(e?.message || 'Could not start this assessment');
      load();
    } finally {
      setStartingSlug(null);
    }
  };

  const assessments = catalog?.assessments || [];
  const contribution = catalog?.profile_contribution || null;

  return (
    <AppPageLayout user={user} onLogout={onLogout} activePage="assessments" maxWidthClass="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Skills Assessments</h1>
        <p className="mt-1 text-gray-600">
          Show employers what you know. These are knowledge assessments — not licenses or
          certifications — and taking one is completely optional.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {contribution && contribution.available_strength_percent > 0 && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">{contribution.label}</p>
          <p className="mt-1 text-sm text-blue-900">
            {contribution.state === 'completed'
              ? `Your ${contribution.assessment_title} score of ${contribution.score} is on your profile.`
              : contribution.recommended_assessment_title
              ? `Completing the ${contribution.recommended_assessment_title} adds ${contribution.available_strength_percent}% to your profile strength.`
              : `Completing an assessment adds ${contribution.available_strength_percent}% to your profile strength.`}
          </p>
          <p className="mt-1 text-xs text-blue-800">Skipping this never limits the jobs you can see or apply to.</p>
        </div>
      )}

      {loading && <p className="text-gray-500">Loading assessments…</p>}

      {!loading && assessments.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No assessments are available yet. Check back soon.
        </div>
      )}

      <div className="space-y-4">
        {assessments.map((assessment) => {
          const inProgress = assessment.in_progress_attempt;
          const result = assessment.result;
          const retakeAt = formatRetakeDate(assessment.retake_available_at);
          const busy = startingSlug === assessment.slug;

          return (
            <section key={assessment.slug} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">{assessment.title}</h2>
                    {assessment.recommended && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                        For your trade
                      </span>
                    )}
                  </div>
                  {assessment.description && (
                    <p className="mt-1 text-sm text-gray-600">{assessment.description}</p>
                  )}
                </div>
                {result && (
                  <div className="text-right">
                    <p className="text-2xl font-bold leading-none text-gray-900">{result.score}</p>
                    {result.score_band_label && (
                      <p className="text-xs text-gray-500">{result.score_band_label}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <MetaPill>{`${assessment.question_count} questions`}</MetaPill>
                <MetaPill>{formatTime(assessment)}</MetaPill>
                {assessment.max_attempts ? (
                  <MetaPill>{`${assessment.attempts_used} of ${assessment.max_attempts} attempts used`}</MetaPill>
                ) : null}
              </div>

              {assessment.topics?.length > 0 && (
                <p className="mt-3 text-sm text-gray-500">
                  {`Covers: ${assessment.topics.map((topic) => topic.name).join(', ')}`}
                </p>
              )}

              {inProgress && (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-sm text-gray-600">
                    <span>{`In progress — ${inProgress.answered_questions} of ${inProgress.total_questions} answered`}</span>
                    <span>{`${inProgress.progress_percent}%`}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-orange-500"
                      style={{ width: `${inProgress.progress_percent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {inProgress ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/assessments/attempts/${inProgress.id}`)}
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                  >
                    Resume assessment
                  </button>
                ) : assessment.can_start ? (
                  <button
                    type="button"
                    onClick={() => onStart(assessment)}
                    disabled={busy}
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                  >
                    {busy ? 'Starting…' : result ? 'Retake assessment' : 'Take Assessment'}
                  </button>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p>{assessment.start_blocked_message || 'This assessment is not available right now.'}</p>
                    {retakeAt && <p className="mt-0.5">{`Next attempt opens ${retakeAt}.`}</p>}
                  </div>
                )}

                {assessment.attempts_count > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate(`/assessments/${assessment.slug}/attempts`)}
                    className="text-sm font-medium text-blue-700 hover:text-blue-900"
                  >
                    {`View my ${assessment.attempts_count} attempt${assessment.attempts_count === 1 ? '' : 's'}`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {catalog?.disclaimer && (
        <p className="mt-6 rounded-lg bg-gray-100 p-4 text-xs leading-relaxed text-gray-600">
          {catalog.disclaimer}
        </p>
      )}
    </AppPageLayout>
  );
}
