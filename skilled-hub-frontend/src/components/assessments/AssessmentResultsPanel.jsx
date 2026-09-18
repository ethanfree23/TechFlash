import React from 'react';

/**
 * Company-facing display of a technician's knowledge assessment results.
 *
 * Shared by the technician profile and the directory card so the score and the
 * disclaimer that gives it context cannot drift apart. A score is a snapshot of
 * trade knowledge — never a license, certification, or guarantee of field work.
 */

function scoreTone(score) {
  if (score == null) return 'bg-gray-100 text-gray-700 border-gray-200';
  if (score >= 90) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (score >= 75) return 'bg-blue-50 text-blue-800 border-blue-200';
  if (score >= 60) return 'bg-amber-50 text-amber-900 border-amber-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function formatDate(iso) {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function AssessmentScoreBadge({ result }) {
  if (!result) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreTone(
        result.score
      )}`}
      title={result.disclaimer}
    >
      <span>{`${result.assessment_title}: ${result.score}`}</span>
      {result.score_band_label ? (
        <span className="font-normal opacity-80">{result.score_band_label}</span>
      ) : null}
    </span>
  );
}

export default function AssessmentResultsPanel({ block, compact = false }) {
  const results = block?.results || [];

  if (results.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {results.map((result) => (
          <AssessmentScoreBadge key={result.id} result={result} />
        ))}
        <span className="text-xs text-gray-500">Knowledge assessment, not a certification</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Knowledge Assessments</h2>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Self-administered · not a certification
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {results.map((result) => {
          const completed = formatDate(result.completed_at);
          const categories = result.category_scores || [];

          return (
            <div key={result.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{result.assessment_title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {[
                      result.trade_type,
                      completed && `Completed ${completed}`,
                      result.version_number && `v${result.version_number}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold leading-none text-gray-900">{result.score}</p>
                  <p className="text-xs text-gray-500">out of 100</p>
                  {result.score_band_label ? (
                    <span
                      className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreTone(
                        result.score
                      )}`}
                    >
                      {result.score_band_label}
                    </span>
                  ) : null}
                </div>
              </div>

              {categories.length > 0 && (
                <div className="mt-4 space-y-2">
                  {categories.map((category) => (
                    <div key={category.slug}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-gray-700">{category.name}</span>
                        <span className="font-medium text-gray-900">{category.score}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-1.5 rounded-full bg-blue-500"
                          style={{ width: `${Math.max(0, Math.min(100, category.score))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
        {block?.disclaimer || results[0]?.disclaimer}
      </p>
    </div>
  );
}
