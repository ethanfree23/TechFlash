import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AppPageLayout from '../components/layout/AppPageLayout';
import { assessmentsAPI } from '../api/api';

function formatDuration(seconds) {
  if (seconds == null) return null;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'Under a minute';
  return `${minutes} min`;
}

export default function AssessmentResultPage({ user, onLogout }) {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = location.state?.notice;

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  const load = useCallback(
    async (includeReview) => {
      setError('');
      try {
        const data = await assessmentsAPI.getAttempt(Number(attemptId), { includeReview });
        setResult(data);
      } catch (e) {
        setError(e?.message || 'Could not load your result');
      } finally {
        setLoading(false);
        setReviewLoading(false);
      }
    },
    [attemptId]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const onToggleReview = async () => {
    if (showReview) {
      setShowReview(false);
      return;
    }
    if (result?.review) {
      setShowReview(true);
      return;
    }
    setReviewLoading(true);
    await load(true);
    setShowReview(true);
  };

  return (
    <AppPageLayout user={user} onLogout={onLogout} activePage="assessments" maxWidthClass="max-w-3xl">
      {loading && <p className="text-gray-500">Scoring your assessment…</p>}

      {error && !result && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {result && (
        <>
          {notice && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {notice}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-gray-500">{result.assessment_title}</p>
            <p className="mt-1 text-6xl font-extrabold leading-none text-gray-900">{result.score ?? 0}</p>
            <p className="text-sm text-gray-500">out of 100</p>
            {result.score_band_label && (
              <span className="mt-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
                {result.score_band_label}
              </span>
            )}
            <p className="mt-3 text-sm text-gray-500">
              {[
                `${result.correct_answers} of ${result.total_questions} correct`,
                formatDuration(result.duration_seconds),
                `Attempt ${result.attempt_number}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {result.passed != null && (
              <p className="mt-1 text-sm text-gray-600">
                {result.passed
                  ? 'Met the benchmark for this assessment'
                  : 'Below the benchmark for this assessment'}
              </p>
            )}
          </div>

          {result.category_results?.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">By topic</h2>
              <div className="mt-3 space-y-3">
                {result.category_results.map((category) => (
                  <div key={category.slug}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-gray-800">{category.name}</span>
                      <span className="font-semibold text-gray-900">{category.score}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${category.score}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {`${category.correct_count} of ${category.questions_count} correct`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-lg bg-gray-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">What this score is</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{result.disclaimer}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onToggleReview}
              disabled={reviewLoading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {showReview ? 'Hide answer review' : reviewLoading ? 'Loading review…' : 'Review my answers'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/assessments')}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Back to assessments
            </button>
            <button
              type="button"
              onClick={() => navigate(`/assessments/${result.assessment_slug}/attempts`)}
              className="text-sm font-medium text-blue-700 hover:text-blue-900"
            >
              See all my attempts
            </button>
          </div>

          {showReview &&
            result.review?.map((entry) => {
              const selected = entry.choices.find((choice) => choice.id === entry.selected_answer_choice_id);
              const correct = entry.choices.find((choice) => choice.id === entry.correct_answer_choice_id);

              return (
                <div key={entry.question_id} className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {`Question ${entry.position}`}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        entry.correct
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {entry.correct ? 'Correct' : entry.answered ? 'Incorrect' : 'Skipped'}
                    </span>
                  </div>
                  <p className="mt-2 font-medium text-gray-900">{entry.prompt}</p>
                  <p className="mt-2 text-sm text-gray-600">
                    {entry.answered ? `Your answer: ${selected?.body ?? '—'}` : 'You did not answer this one.'}
                  </p>
                  {!entry.correct && correct && (
                    <p className="mt-1 text-sm text-emerald-700">{`Correct answer: ${correct.body}`}</p>
                  )}
                  {entry.explanation && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">{entry.explanation}</p>
                  )}
                </div>
              );
            })}
        </>
      )}
    </AppPageLayout>
  );
}
