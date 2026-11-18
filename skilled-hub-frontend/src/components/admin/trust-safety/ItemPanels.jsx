import React from 'react';
import { FaExclamationTriangle, FaLock } from 'react-icons/fa';
import StatusBadge from '../command-center/StatusBadge';
import DocumentPreview from './DocumentPreview';
import { ExternalLink, KeyValue, ItemStatusBadge } from './primitives';
import { formatDate, formatDateTime, daysUntil, toneToBadgeVariant } from '../../../utils/trustSafety';

function Section({ title, children, hint }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Callout({ tone = 'info', icon, children }) {
  const cls =
    tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-900'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReviewerDecision({ decision, labels }) {
  if (!decision) return null;
  const { status, reviewed_at: reviewedAt, reviewer } = decision;
  const text = decision.rejection_reason || decision.review_notes || decision.notes;
  const decided = status && !['pending_review', 'requested', 'responded'].includes(status);
  if (!decided && !text) return <p className="text-xs text-slate-400">No reviewer decision yet.</p>;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs space-y-1">
      {decided && (
        <p className="text-slate-800">
          <span className="font-semibold">{labels?.[status] || String(status).replace(/_/g, ' ')}</span>
          {reviewer?.name ? ` by ${reviewer.name}` : ''}
          {reviewedAt ? ` · ${formatDateTime(reviewedAt)}` : ''}
        </p>
      )}
      {text && <blockquote className="rounded bg-slate-50 border border-slate-100 px-2 py-1 text-slate-700 whitespace-pre-wrap">{text}</blockquote>}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Documents / credentials
// ------------------------------------------------------------------------------------

export function DocumentPanel({ item }) {
  const d = item.details || {};
  const expiresIn = daysUntil(d.valid_until);
  return (
    <div className="space-y-5">
      <Section title="Submitted document" hint={item.sensitive ? 'Sensitive — identity document' : null}>
        <DocumentPreview documentId={item.id} file={item.file} technicianName={item.technician?.display_name} title={item.title} />
        <Callout tone="info">
          <p>{item.verification_note}</p>
        </Callout>
      </Section>

      <Section title="Document details">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <KeyValue label="Document type" value={item.review_type_label} />
          <KeyValue label="Review status" value={<ItemStatusBadge status={item.status} />} />
          <KeyValue label="Issuing authority / title" value={d.issuer} />
          <KeyValue label="License / document number" value={d.document_number} mono />
          <KeyValue label="Issued on" value={d.issued_on ? formatDate(d.issued_on) : null} />
          <KeyValue
            label="Expires"
            value={
              d.valid_until ? (
                <span className={d.expired ? 'text-red-700 font-semibold' : d.expiring_soon ? 'text-amber-800 font-semibold' : ''}>
                  {formatDate(d.valid_until)}
                  {d.expired ? ' · expired' : expiresIn != null ? ` · in ${expiresIn}d` : ''}
                </span>
              ) : null
            }
          />
          <KeyValue label="Submitted" value={formatDateTime(item.submitted_at)} />
          <KeyValue label="Last updated" value={formatDateTime(item.updated_at)} />
          {d.metadata && Object.keys(d.metadata).length > 0 &&
            Object.entries(d.metadata).map(([k, v]) => <KeyValue key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
        </dl>
        {d.expired && item.status?.key !== 'rejected' && (
          <Callout tone="warning" icon={<FaExclamationTriangle />}>
            This credential's expiration date has passed. Approving it will not make the technician's license current.
          </Callout>
        )}
      </Section>

      <Section title="Reviewer decision">
        <ReviewerDecision decision={item.reviewer_decision} labels={{ approved: 'Approved', rejected: 'Rejected' }} />
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Background checks
// ------------------------------------------------------------------------------------

export function BackgroundCheckPanel({ item }) {
  const checkr = item.checkr || {};
  const lifecycle = item.lifecycle || {};
  const provider = item.provider_status || {};
  const eligibility = item.eligibility || {};
  const decision = item.reviewer_decision || {};
  const errors = item.processing_errors || [];
  const overrideBlocked = item.override_block_reason;
  const phase = provider.key;
  const inLawfulProcess = ['report_disputed', 'report_pre_adverse_action', 'adverse_action_notice_not_delivered', 'report_post_adverse_action'].includes(phase);

  return (
    <div className="space-y-5">
      {/* The four concepts, separated. */}
      <Section title="Verification state">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Checkr result</p>
            <div className="mt-1">
              <StatusBadge variant={toneToBadgeVariant(provider.tone)}>{provider.label || '—'}</StatusBadge>
            </div>
            {provider.detail && <p className="text-[11px] text-slate-500 mt-1">{provider.detail}</p>}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reviewer decision</p>
            <div className="mt-1">
              {decision.override_status ? (
                <StatusBadge variant={decision.override_status === 'manually_approved' ? 'success' : 'danger'}>
                  {decision.override_status === 'manually_approved' ? 'Manually approved' : 'Manually rejected'}
                </StatusBadge>
              ) : (
                <StatusBadge variant="neutral">No override</StatusBadge>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Final eligibility</p>
            <div className="mt-1">
              <StatusBadge variant={eligibility.eligible_for_verified_badge ? 'success' : 'neutral'}>
                {eligibility.eligible_for_verified_badge ? 'Background-verified' : 'Not verified'}
              </StatusBadge>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Profile flag</p>
            <div className="mt-1">
              <StatusBadge variant={eligibility.profile_flag_background_verified ? 'success' : 'neutral'}>
                {eligibility.profile_flag_background_verified ? 'background_verified = true' : 'background_verified = false'}
              </StatusBadge>
            </div>
          </div>
        </div>
        {item.action_reason && (
          <Callout tone={item.needs_review ? 'warning' : 'info'} icon={item.needs_review ? <FaExclamationTriangle /> : null}>
            <p className="font-semibold">{item.needs_review ? 'Review required' : 'Status'}</p>
            <p>{item.action_reason}</p>
          </Callout>
        )}
        {inLawfulProcess && (
          <Callout tone="danger" icon={<FaLock />}>
            <p className="font-semibold">Lawful process in progress</p>
            <p>Disputes and adverse action are managed exclusively in Checkr under FCRA procedures. TechFlash does not initiate or short-circuit adverse action from this screen.</p>
          </Callout>
        )}
        {overrideBlocked && !inLawfulProcess && (
          <Callout tone="info" icon={<FaLock />}>
            <p className="font-semibold">No approval available</p>
            <p>{overrideBlocked}</p>
          </Callout>
        )}
        {phase === 'consider' || phase === 'review_required' ? (
          <Callout tone="warning">
            <p>
              Checkr returned <strong>consider</strong>. Review the full report in the Checkr dashboard — report contents are intentionally not mirrored here. Any decision requires a written reason and confirmation.
            </p>
          </Callout>
        ) : null}
      </Section>

      <Section title="Checkr report" hint="Metadata only">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <KeyValue label="Candidate ID" value={checkr.candidate_id} mono />
          <KeyValue label="Invitation ID" value={checkr.invitation_id} mono />
          <KeyValue label="Report ID" value={checkr.report_id} mono />
          <KeyValue label="Package" value={checkr.package_name} />
          <KeyValue label="Provider status" value={checkr.provider_status} />
          <KeyValue label="Result" value={checkr.result} />
          <KeyValue label="Assessment" value={checkr.assess_status} />
          <KeyValue label="Adjudication" value={checkr.adjudication} />
          <KeyValue label="Includes canceled screenings" value={checkr.includes_canceled == null ? null : checkr.includes_canceled ? 'Yes' : 'No'} />
          <KeyValue label="Work location" value={checkr.work_location} />
          <KeyValue label="Report ETA" value={checkr.report_eta_at ? formatDateTime(checkr.report_eta_at) : null} />
          <KeyValue label="Provider updated" value={checkr.provider_updated_at ? formatDateTime(checkr.provider_updated_at) : null} />
        </dl>
        <div className="flex flex-wrap gap-3">
          <ExternalLink href={checkr.dashboard_url}>Open in Checkr</ExternalLink>
          {phase === 'invitation_sent' && checkr.invitation_url && <ExternalLink href={checkr.invitation_url}>Candidate invitation link</ExternalLink>}
        </div>
      </Section>

      <Section title="Timeline">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <KeyValue label="Created" value={formatDateTime(lifecycle.created_at)} />
          <KeyValue label="Started" value={formatDateTime(lifecycle.started_at)} />
          <KeyValue label="Completed" value={formatDateTime(lifecycle.completed_at)} />
          <KeyValue label="Expires" value={formatDateTime(lifecycle.expires_at)} />
          <KeyValue label="Disclosure accepted" value={formatDateTime(lifecycle.disclosure_accepted_at)} />
          <KeyValue label="Authorization accepted" value={formatDateTime(lifecycle.authorization_accepted_at)} />
          <KeyValue label="Payment" value={lifecycle.payment_status ? `${lifecycle.payment_status} · ${lifecycle.paid_by || ''}` : null} />
          <KeyValue label="Normalized phase" value={lifecycle.normalized_status} mono />
        </dl>
      </Section>

      <Section title="Webhook & reconciliation">
        {checkr.last_webhook ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <KeyValue label="Last event" value={checkr.last_webhook.event_type} mono />
            <KeyValue label="Received" value={formatDateTime(checkr.last_webhook.received_at)} />
            <KeyValue label="Processed" value={checkr.last_webhook.processed_at ? formatDateTime(checkr.last_webhook.processed_at) : 'Not processed'} />
            <KeyValue label="Event ID" value={checkr.last_webhook_event_id} mono />
          </dl>
        ) : (
          <p className="text-xs text-slate-400">No webhook has been recorded for this check.</p>
        )}
        {errors.length > 0 && (
          <div className="space-y-1.5">
            {errors.map((err, i) => (
              <Callout key={`${err.checkr_event_id || 'inv'}-${i}`} tone="danger" icon={<FaExclamationTriangle />}>
                <p className="font-semibold">
                  {err.event_type || 'event'} {err.attempt_count ? `· ${err.attempt_count} attempts` : ''}
                </p>
                <p className="break-words">{err.processing_error}</p>
                <p className="text-[10px] opacity-70">{formatDateTime(err.updated_at)}</p>
              </Callout>
            ))}
          </div>
        )}
      </Section>

      {decision.notes && (
        <Section title="Reviewer notes">
          <blockquote className="rounded bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-xs text-slate-700 whitespace-pre-wrap">{decision.notes}</blockquote>
        </Section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// References
// ------------------------------------------------------------------------------------

export function ReferencePanel({ item }) {
  const d = item.details || {};
  const answers = d.answers && typeof d.answers === 'object' ? Object.entries(d.answers) : [];
  return (
    <div className="space-y-5">
      <Section title="Reference">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <KeyValue label="Name" value={d.full_name} />
          <KeyValue label="Relationship" value={d.relationship} />
          <KeyValue label="Company" value={d.company_name} />
          <KeyValue label="Status" value={<ItemStatusBadge status={item.status} />} />
          <KeyValue label="Email" value={d.email ? <a href={`mailto:${d.email}`} className="text-tf-blue hover:underline">{d.email}</a> : null} />
          <KeyValue label="Phone" value={d.phone ? <a href={`tel:${d.phone}`} className="text-tf-blue hover:underline">{d.phone}</a> : null} />
          <KeyValue label="Requested" value={formatDateTime(d.requested_at)} />
          <KeyValue label="Responded" value={d.responded_at ? formatDateTime(d.responded_at) : 'No response yet'} muted={!d.responded_at} />
        </dl>
      </Section>

      <Section title="Reference response" hint={answers.length ? `${answers.length} answers` : null}>
        {answers.length === 0 ? (
          <Callout tone="info">
            <p>
              The reference has not submitted a response online. Use <strong>Record contact attempt</strong> after you call or email them, or <strong>Add note</strong> to save what you learned. Prefer that over approving until you have verified them directly.
            </p>
          </Callout>
        ) : (
          <dl className="space-y-2">
            {answers.map(([q, a]) => (
              <div key={q} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{q.replace(/_/g, ' ')}</dt>
                <dd className="text-xs text-slate-800 mt-0.5 whitespace-pre-wrap">{typeof a === 'object' ? JSON.stringify(a) : String(a)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title="Reviewer decision">
        <ReviewerDecision decision={item.reviewer_decision} labels={{ approved: 'Marked verified', rejected: 'Rejected' }} />
      </Section>
    </div>
  );
}
