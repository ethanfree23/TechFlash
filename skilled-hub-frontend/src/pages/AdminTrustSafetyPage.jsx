import React, { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { adminTrustSafetyAPI } from '../api/api';

export default function AdminTrustSafetyPage({ user, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminTrustSafetyAPI.dashboard();
      setDashboard(data || {});
    } catch (e) {
      setError(e.message || 'Failed to load trust and safety dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const reviewBackground = async (checkId, overrideStatus) => {
    const adminNotes = window.prompt('Optional admin notes:') || '';
    try {
      await adminTrustSafetyAPI.overrideBackgroundCheck(checkId, { override_status: overrideStatus, admin_notes: adminNotes });
      await loadDashboard();
    } catch {
      // keep screen stable on transient error
    }
  };

  const reviewReference = async (referenceId, status) => {
    const reviewNotes = window.prompt('Optional review notes:') || '';
    try {
      await adminTrustSafetyAPI.reviewReference(referenceId, { status, review_notes: reviewNotes });
      await loadDashboard();
    } catch {
      // keep screen stable on transient error
    }
  };

  const reviewDocument = async (documentId, status) => {
    const reason = status === 'rejected' ? (window.prompt('Rejection reason (shown to technician):') || '') : '';
    try {
      await adminTrustSafetyAPI.reviewDocument(documentId, { status, rejection_reason: reason });
      await loadDashboard();
    } catch {
      // keep screen stable on transient error
    }
  };

  const cards = dashboard?.cards || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="trust_safety" emailVariant="crm" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trust and Safety</h1>
          <p className="text-sm text-gray-600 mt-1">Verification queues, expiring credentials, and audit activity.</p>
        </div>

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">Loading trust and safety dashboard...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <Card label="Pending background" value={cards.pending_background_reviews} />
              <Card label="Pending references" value={cards.pending_references} />
              <Card label="Pending docs" value={cards.pending_licenses_certs} />
              <Card label="Expiring soon" value={cards.expiring_soon} />
              <Card label="Flagged checks" value={cards.failed_flagged_checks} />
              <Card label="Verified techs" value={cards.verified_technicians} />
              <Card label="Completion rate" value={cards.verification_completion_rate != null ? `${cards.verification_completion_rate}%` : '—'} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <Header title="Background Checks" />
                <div className="max-h-[420px] overflow-auto divide-y divide-gray-100">
                  {(dashboard?.pending_background_checks || []).length === 0 ? (
                    <Empty text="No pending background checks." />
                  ) : (
                    dashboard.pending_background_checks.map((check) => (
                      <Row
                        key={check.id}
                        title={`Check #${check.id}`}
                        subtitle={`User #${check.user_id} · ${check.normalized_status || check.status} · ${check.package_name || 'package n/a'} · ${[check.work_location_city, check.work_location_state, check.work_location_country].filter(Boolean).join(', ') || 'location n/a'}`}
                      >
                        {(check.dashboard_url || check.report_url) && (
                          <a
                            href={check.dashboard_url || check.report_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800 hover:bg-blue-200"
                          >
                            Report
                          </a>
                        )}
                        <Action onClick={() => reviewBackground(check.id, 'manually_approved')} tone="green">Approve</Action>
                        <Action onClick={() => reviewBackground(check.id, 'manually_rejected')} tone="red">Reject</Action>
                      </Row>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <Header title="Reference Reviews" />
                <div className="max-h-[420px] overflow-auto divide-y divide-gray-100">
                  {(dashboard?.pending_references || []).length === 0 ? (
                    <Empty text="No pending references." />
                  ) : (
                    dashboard.pending_references.map((ref) => (
                      <Row key={ref.id} title={ref.full_name} subtitle={`${ref.relationship} · ${ref.email}`}>
                        <Action onClick={() => reviewReference(ref.id, 'approved')} tone="green">Approve</Action>
                        <Action onClick={() => reviewReference(ref.id, 'rejected')} tone="red">Reject</Action>
                      </Row>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <Header title="Document Reviews" />
                <div className="max-h-[420px] overflow-auto divide-y divide-gray-100">
                  {(dashboard?.pending_documents || []).length === 0 ? (
                    <Empty text="No pending documents." />
                  ) : (
                    dashboard.pending_documents.map((doc) => (
                      <Row key={doc.id} title={`${doc.doc_type} #${doc.id}`} subtitle={`${doc.uploadable_type} #${doc.uploadable_id}`}>
                        <Action onClick={() => reviewDocument(doc.id, 'approved')} tone="green">Approve</Action>
                        <Action onClick={() => reviewDocument(doc.id, 'rejected')} tone="red">Reject</Action>
                      </Row>
                    ))
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <Header title="Verification Audit Timeline" />
              <div className="max-h-[320px] overflow-auto divide-y divide-gray-100">
                {(dashboard?.audit_timeline || []).length === 0 ? (
                  <Empty text="No audit events yet." />
                ) : (
                  dashboard.audit_timeline.map((evt) => (
                    <div key={evt.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{evt.action.replaceAll('_', ' ')}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        User #{evt.user_id} · Actor #{evt.actor_user_id} · {new Date(evt.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value ?? '—'}</p>
    </div>
  );
}

function Header({ title }) {
  return (
    <div className="px-4 py-3 border-b border-gray-200">
      <h2 className="font-semibold text-gray-900">{title}</h2>
    </div>
  );
}

function Empty({ text }) {
  return <p className="px-4 py-4 text-sm text-gray-500">{text}</p>;
}

function Row({ title, subtitle, children }) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      <div className="mt-2 flex gap-2">{children}</div>
    </div>
  );
}

function Action({ onClick, tone = 'gray', children }) {
  const styles = tone === 'green'
    ? 'bg-green-600 text-white hover:bg-green-700'
    : tone === 'red'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : 'bg-gray-200 text-gray-800 hover:bg-gray-300';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded ${styles}`}
    >
      {children}
    </button>
  );
}
