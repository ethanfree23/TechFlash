import React, { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { adminReviewsAPI } from '../api/api';

const metricValue = (value, suffix = '') => (value == null ? '—' : `${value}${suffix}`);

export default function AdminReviewsPage({ user, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [flaggedReviews, setFlaggedReviews] = useState([]);
  const [flags, setFlags] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [analyticsRes, moderationRes, flagsRes] = await Promise.all([
          adminReviewsAPI.analytics(),
          adminReviewsAPI.moderationQueue(),
          adminReviewsAPI.flags({ status: 'open', limit: 50 }),
        ]);
        if (cancelled) return;
        setAnalytics(analyticsRes || {});
        setFlaggedReviews(Array.isArray(moderationRes) ? moderationRes : []);
        setFlags(Array.isArray(flagsRes?.flags) ? flagsRes.flags : []);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || 'Failed to load review moderation dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveFlag = async (flagId, status) => {
    try {
      await adminReviewsAPI.updateFlag(flagId, { status });
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {
      // Keep silent, avoid breaking moderation flow for transient errors.
    }
  };

  const hideReview = async (reviewId) => {
    try {
      const updated = await adminReviewsAPI.hide(reviewId, 'Hidden from admin review dashboard.');
      setFlaggedReviews((prev) => prev.map((r) => (r.id === reviewId ? updated : r)));
    } catch {
      // Keep silent, table remains unchanged on failure.
    }
  };

  const restoreReview = async (reviewId) => {
    try {
      const updated = await adminReviewsAPI.restore(reviewId, 'Restored from admin review dashboard.');
      setFlaggedReviews((prev) => prev.map((r) => (r.id === reviewId ? updated : r)));
    } catch {
      // Keep silent, table remains unchanged on failure.
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="reviews" emailVariant="crm" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Moderation</h1>
          <p className="text-sm text-gray-600 mt-1">Double-blind reviews, fraud signals, and marketplace quality analytics.</p>
        </div>

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">Loading review analytics...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Avg technician rating</p>
                <p className="text-lg font-semibold text-gray-900">{metricValue(analytics?.average_technician_rating)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Avg company rating</p>
                <p className="text-lg font-semibold text-gray-900">{metricValue(analytics?.average_company_rating)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Completion rate</p>
                <p className="text-lg font-semibold text-gray-900">{metricValue(analytics?.review_completion_rate, '%')}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Recommendation rate</p>
                <p className="text-lg font-semibold text-gray-900">{metricValue(analytics?.recommendation_rate, '%')}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Repeat hire rate</p>
                <p className="text-lg font-semibold text-gray-900">{metricValue(analytics?.repeat_hire_rate, '%')}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Open flags</p>
                <p className="text-lg font-semibold text-gray-900">{flags.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">Open Fraud Flags</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {flags.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-gray-500">No open review flags.</p>
                  ) : (
                    flags.map((flag) => (
                      <div key={flag.id} className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{flag.reason.replaceAll('_', ' ')}</p>
                        <p className="text-xs text-gray-500 mt-1">Review #{flag.rating_id} · Risk {flag.risk_score}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => resolveFlag(flag.id, 'resolved')}
                            className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveFlag(flag.id, 'dismissed')}
                            className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">Moderation Queue</h2>
                </div>
                <div className="max-h-[420px] overflow-auto divide-y divide-gray-100">
                  {flaggedReviews.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-gray-500">No reviews currently in moderation queue.</p>
                  ) : (
                    flaggedReviews.map((review) => (
                      <div key={review.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">Review #{review.id}</p>
                          <span className={`text-xs px-2 py-1 rounded-full ${review.moderation_status === 'hidden' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                            {review.moderation_status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Job #{review.job_id} · {review.reviewer_type} → {review.reviewee_type}
                        </p>
                        {review.comment && <p className="text-sm text-gray-700 mt-2">{review.comment}</p>}
                        <div className="mt-2 flex gap-2">
                          {review.moderation_status === 'hidden' ? (
                            <button
                              type="button"
                              onClick={() => restoreReview(review.id)}
                              className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => hideReview(review.id)}
                              className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                            >
                              Hide
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
