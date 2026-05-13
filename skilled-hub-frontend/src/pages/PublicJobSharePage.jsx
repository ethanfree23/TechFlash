import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { jobsAPI } from '../api/api';
import { formatExperienceLong } from '../constants/experienceSelect';
import { FormattedJobDescription } from '../utils/formattedJobText';

const STATUS_LABELS = {
  open: 'Open',
  reserved: 'Reserved',
  accepted: 'Accepted',
  completed: 'Completed',
  filled: 'Filled',
  finished: 'Finished',
};

function rollingRuleSummary(job) {
  if (!job || job.start_mode !== 'rolling_start') return null;
  const rule = job.rolling_start_rule_type || 'none';
  if (rule === 'exact_datetime') {
    if (!job.rolling_start_exact_start_at) return 'Rolling start: exact date/time required by company.';
    return `Rolling start: company requires exact start at ${new Date(job.rolling_start_exact_start_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`;
  }
  if (rule === 'days_after_acceptance') {
    return `Rolling start: begins ${job.rolling_start_days_after_acceptance || 1} day(s) after acceptance.`;
  }
  if (rule === 'following_weekday') {
    const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekday = Number.isFinite(Number(job.rolling_start_weekday))
      ? weekdayLabels[Number(job.rolling_start_weekday)] || 'selected weekday'
      : 'selected weekday';
    const timeLabel = job.rolling_start_weekday_time || 'configured time';
    return `Rolling start: begins the following ${weekday} at ${timeLabel} (never same-day).`;
  }
  return 'Rolling start: technician picks preferred start time when claiming.';
}

function normalizePreviewPayload(body) {
  if (!body || typeof body !== 'object') return null;
  return body.job ?? body.public_job_preview ?? body;
}

export default function PublicJobSharePage() {
  const { shareToken } = useParams();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const raw = await jobsAPI.getPublicPreviewByShareToken(shareToken);
        const data = normalizePreviewPayload(raw);
        if (!cancelled) {
          setPreview(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not load this job.');
          setPreview(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const rollingSummaryText = preview ? rollingRuleSummary(preview) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-bold text-[#1e3a5f] hover:opacity-90">
            TechFlash
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/login" className="text-blue-600 hover:text-blue-800 font-medium">
              Sign in
            </Link>
            <Link
              to="/"
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium"
            >
              Join
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {loading && (
          <div className="text-center text-gray-600 py-16">Loading job…</div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-red-800 text-center">
            <p className="font-medium mb-2">This link is invalid or the job is no longer available.</p>
            <p className="text-sm">{error}</p>
            <Link to="/" className="inline-block mt-4 text-blue-600 hover:underline font-medium">
              Back to home
            </Link>
          </div>
        )}

        {!loading && !error && preview && (
          <article className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-6 border-b border-gray-100">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{preview.title}</h1>
                <span className="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-800 capitalize">
                  {STATUS_LABELS[preview.status] || preview.status || '—'}
                </span>
              </div>
              {preview.company_preview?.company_name && (
                <p className="text-gray-600">
                  <span className="font-medium text-gray-800">{preview.company_preview.company_name}</span>
                </p>
              )}
              {(preview.city || preview.state) && (
                <p className="text-sm text-gray-500 mt-2">
                  {[preview.city, preview.state].filter(Boolean).join(', ')}
                  {preview.country && preview.country !== 'United States' ? ` · ${preview.country}` : ''}
                </p>
              )}
            </div>

            <div className="px-6 py-6 space-y-6">
              {preview.description && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Description</h2>
                  <FormattedJobDescription text={preview.description} />
                </section>
              )}

              <section className="grid sm:grid-cols-2 gap-4 text-sm">
                {preview.skill_class && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Class</h3>
                    <p className="text-gray-700">{preview.skill_class}</p>
                  </div>
                )}
                {preview.minimum_years_experience != null && preview.minimum_years_experience !== '' && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Experience</h3>
                    <p className="text-gray-700">{formatExperienceLong(Number(preview.minimum_years_experience))}</p>
                  </div>
                )}
                {(preview.hourly_rate_cents != null || preview.price_cents != null) && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Compensation</h3>
                    <p className="text-gray-700">
                      {preview.hourly_rate_cents != null &&
                      preview.hours_per_day != null &&
                      preview.days != null ? (
                        <>
                          ${(preview.hourly_rate_cents / 100).toFixed(2)}/hr × {preview.hours_per_day} hr/day ×{' '}
                          {preview.days} days
                        </>
                      ) : preview.price_cents != null ? (
                        <>${(preview.price_cents / 100).toFixed(2)} total</>
                      ) : (
                        '—'
                      )}
                    </p>
                  </div>
                )}
                {preview.scheduled_start_at && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Scheduled start</h3>
                    <p className="text-gray-700">
                      {new Date(preview.scheduled_start_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                )}
                {preview.scheduled_end_at && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Scheduled end</h3>
                    <p className="text-gray-700">
                      {new Date(preview.scheduled_end_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                )}
              </section>

              {preview.start_mode === 'rolling_start' && rollingSummaryText && (
                <section className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-800">
                  {rollingSummaryText}
                </section>
              )}

              {preview.required_certifications && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
                    Required certifications
                  </h2>
                  <p className="text-gray-700 whitespace-pre-wrap">{preview.required_certifications}</p>
                </section>
              )}

              {preview.required_documents && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
                    Required documents
                  </h2>
                  <p className="text-gray-700 whitespace-pre-wrap">{preview.required_documents}</p>
                </section>
              )}

              {preview.timeline && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Timeline</h2>
                  <p className="text-gray-700 whitespace-pre-wrap">{preview.timeline}</p>
                </section>
              )}

              <section className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-4">
                <p className="text-sm text-blue-950 mb-3">
                  Sign in to TechFlash to claim this job or contact the company. This preview shows role and location at a
                  city/state level; full details are available in the app.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-blue-300 text-blue-800 text-sm font-medium hover:bg-blue-100"
                  >
                    Create an account
                  </Link>
                </div>
              </section>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
