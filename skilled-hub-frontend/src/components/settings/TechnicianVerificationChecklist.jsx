import React, { useEffect, useMemo, useState } from 'react';
import {
  FaShieldAlt,
  FaChevronDown,
  FaChevronRight,
  FaEnvelope,
  FaPhone,
  FaUserCircle,
} from 'react-icons/fa';
import StatusBadge from '../admin/command-center/StatusBadge';
import { formatDateTime, formatRelative, toneToBadgeVariant } from '../../utils/trustSafety';
import { formatPhoneDisplay } from '../../utils/crmDisplayAdapter';
import { mediaUrlWithCacheBust } from '../../utils/mediaUrl';

const STATUS_DOT = {
  verified: 'bg-emerald-500',
  needs_review: 'bg-amber-500',
  pending: 'bg-sky-500',
  rejected: 'bg-red-500',
  expired: 'bg-red-400',
  incomplete: 'bg-slate-400',
  not_started: 'bg-slate-300',
  not_applicable: 'bg-slate-200',
};

function ItemStatusBadge({ status }) {
  if (!status) return <StatusBadge variant="default">—</StatusBadge>;
  if (typeof status === 'string') {
    return <StatusBadge variant="neutral">{status}</StatusBadge>;
  }
  return <StatusBadge variant={toneToBadgeVariant(status.tone)}>{status.label}</StatusBadge>;
}

function ProfileContactPanel({ technician, row, onGoToProfile }) {
  const [broken, setBroken] = useState(false);
  const avatarUrl = technician?.avatar_url && !broken
    ? mediaUrlWithCacheBust(technician.avatar_url, technician.avatar_updated_at)
    : null;
  const email = technician?.email;
  const phone = technician?.phone;

  useEffect(() => {
    setBroken(false);
  }, [technician?.avatar_url]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-400">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
          ) : (
            <FaUserCircle className="h-8 w-8" />
          )}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-900 truncate">
            {technician?.display_name || technician?.full_name || 'Your profile'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {[row?.has_photo ? 'Photo on file' : 'Photo missing', row?.has_email ? 'Email on file' : 'Email missing', row?.has_phone ? 'Phone on file' : 'Phone missing'].join(' · ')}
          </p>
        </div>
        {onGoToProfile && (
          <button
            type="button"
            onClick={onGoToProfile}
            className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit on Profile
          </button>
        )}
      </div>
      <div className="space-y-2 text-sm">
        {email ? (
          <a href={`mailto:${email}`} className="flex items-center gap-2 text-tf-blue hover:underline">
            <FaEnvelope className="h-3.5 w-3.5" /> {email}
          </a>
        ) : (
          <p className="text-xs text-slate-500">No email on file</p>
        )}
        {phone ? (
          <p className="flex items-center gap-2 text-slate-700">
            <FaPhone className="h-3.5 w-3.5 text-slate-400" /> {formatPhoneDisplay(phone) || phone}
          </p>
        ) : (
          <p className="text-xs text-slate-500">No phone on file</p>
        )}
      </div>
    </div>
  );
}

function BackgroundStatusPanel({ checks, backgroundCheck, completed }) {
  const latest = checks?.[0];
  const label = backgroundCheck?.technician_status_label
    || latest?.status?.label
    || (completed ? 'Completed — Clear' : 'Not started');

  if (!latest && !backgroundCheck) {
    return (
      <p className="text-xs text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">
        No background check has been started yet.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ItemStatusBadge status={latest?.status || { key: completed ? 'verified' : 'pending', label, tone: completed ? 'success' : 'info' }} />
        <span className="text-sm font-semibold text-slate-900">{latest?.title || 'Background check'}</span>
      </div>
      <div className="text-xs text-slate-600 space-y-1">
        <p>Status: {label}</p>
        {(latest?.updated_at || backgroundCheck?.updated_at) && (
          <p title={formatDateTime(latest?.updated_at || backgroundCheck?.updated_at)}>
            Updated {formatRelative(latest?.updated_at || backgroundCheck?.updated_at)}
          </p>
        )}
        {latest?.lifecycle_summary?.completed_at && (
          <p>Completed {formatDateTime(latest.lifecycle_summary.completed_at)}</p>
        )}
        {completed && (
          <p className="text-emerald-700 font-medium">Report clear — no action required.</p>
        )}
      </div>
      {!completed && backgroundCheck?.invitation_url && (
        <a
          href={backgroundCheck.invitation_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-tf-blue hover:bg-slate-50"
        >
          Continue Checkr invitation
        </a>
      )}
    </div>
  );
}

function ReferencesList({ items }) {
  if (!items?.length) {
    return (
      <p className="text-xs text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">
        No professional references on file yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white mb-3">
      {items.map((ref) => (
        <li key={ref.key || ref.id} className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{ref.title || ref.full_name}</p>
            <ItemStatusBadge status={ref.status} />
          </div>
          {(ref.subtitle || ref.relationship || ref.company_name) && (
            <p className="text-xs text-slate-600 mt-0.5">
              {ref.subtitle || [ref.relationship, ref.company_name].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {ref.phone && <span>{formatPhoneDisplay(ref.phone) || ref.phone}</span>}
            {ref.email && <span>{ref.email}</span>}
            {ref.reviewer_name && <span>Verified by {ref.reviewer_name}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CredentialsList({ items }) {
  if (!items?.length) {
    return (
      <p className="text-xs text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center mb-3">
        No licenses or certifications uploaded yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white mb-3">
      {items.map((doc) => (
        <li key={doc.key || doc.id} className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{doc.title}</p>
            <ItemStatusBadge status={doc.status} />
          </div>
          {doc.subtitle && <p className="text-xs text-slate-600 mt-0.5">{doc.subtitle}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {doc.issuer && <span>{doc.issuer}</span>}
            {doc.document_number && <span>No. {doc.document_number}</span>}
            {doc.reviewer_name && <span>Reviewed by {doc.reviewer_name}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChecklistSection({
  row,
  open,
  onToggle,
  trustProfile,
  backgroundCheck,
  backgroundComplete,
  backgroundStartContent,
  referencesContent,
  credentialsContent,
  onGoToProfile,
}) {
  const refs = trustProfile?.items?.references || [];
  const credentials = trustProfile?.items?.credentials || [];
  const checks = trustProfile?.items?.background_checks || [];

  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50/80"
        aria-expanded={open}
      >
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[row.status] || 'bg-slate-300'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{row.label}</p>
            <StatusBadge variant={toneToBadgeVariant(row.tone)}>{row.status_label}</StatusBadge>
          </div>
          {row.detail && <p className="mt-0.5 text-xs text-slate-600">{row.detail}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            {row.updated_at && (
              <span title={formatDateTime(row.updated_at)}>Updated {formatRelative(row.updated_at)}</span>
            )}
            {row.next_action && (
              <span>
                <span className="font-semibold text-slate-500">Next:</span> {row.next_action}
              </span>
            )}
            {row.counts && (
              <span>
                {row.counts.approved} verified · {row.counts.responded} awaiting review · {row.counts.requested} awaiting response
              </span>
            )}
          </div>
        </div>
        {open ? <FaChevronDown className="h-3.5 w-3.5 text-slate-400 mt-1" /> : <FaChevronRight className="h-3.5 w-3.5 text-slate-400 mt-1" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {row.key === 'background_check' && (
            <>
              {backgroundComplete ? (
                <BackgroundStatusPanel checks={checks} backgroundCheck={backgroundCheck} completed />
              ) : (
                <>
                  {(checks.length > 0 || backgroundCheck) && (
                    <BackgroundStatusPanel checks={checks} backgroundCheck={backgroundCheck} completed={false} />
                  )}
                  {backgroundStartContent}
                </>
              )}
            </>
          )}
          {row.key === 'references' && (
            referencesContent || <ReferencesList items={refs} />
          )}
          {row.key === 'trade_license' && (
            credentialsContent || <CredentialsList items={credentials} />
          )}
          {row.key === 'contact' && (
            <ProfileContactPanel
              technician={trustProfile?.technician}
              row={row}
              onGoToProfile={onGoToProfile}
            />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Technician-facing verification checklist — mirrors the admin Verification
 * workspace layout (summary + accordion rows) with technician actions.
 */
export default function TechnicianVerificationChecklist({
  trustProfile,
  loading = false,
  backgroundCheck = null,
  backgroundComplete = false,
  backgroundStartContent = null,
  referencesContent = null,
  credentialsContent = null,
  onGoToProfile = null,
}) {
  const checklist = trustProfile?.checklist || [];
  const defaultOpen = useMemo(() => {
    if (!checklist.length) return 'background_check';
    const incomplete = checklist.find((row) => !['verified', 'not_applicable'].includes(row.status));
    return incomplete?.key || 'background_check';
  }, [checklist]);
  const [openKey, setOpenKey] = useState(defaultOpen);

  useEffect(() => {
    setOpenKey(defaultOpen);
  }, [defaultOpen]);

  if (loading && !trustProfile) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!trustProfile) {
    return (
      <p className="text-sm text-slate-500">
        Verification status could not be loaded. Refresh the page or try again shortly.
      </p>
    );
  }

  const s = trustProfile.summary || {};

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <FaShieldAlt className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Verification</p>
              <p className="text-[11px] text-slate-500">
                {s.verified_count}/{s.total} checks complete
                {s.complete ? ' · all required checks satisfied' : ''}
                {s.needs_review_count > 0 ? ` · ${s.needs_review_count} awaiting TechFlash review` : ''}
                {' · '}
                Background-verified flag:{' '}
                <span className={s.background_verified ? 'text-emerald-700 font-semibold' : 'text-slate-600 font-semibold'}>
                  {s.background_verified ? 'on' : 'off'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(trustProfile.badges || []).map((b) => (
              <StatusBadge key={b.badge_type} variant={b.status === 'active' ? 'success' : 'neutral'}>
                {String(b.badge_type).replace(/_/g, ' ')} · {b.status}
              </StatusBadge>
            ))}
          </div>
        </div>
        <ul>
          {checklist.map((row) => (
            <ChecklistSection
              key={row.key}
              row={row}
              open={openKey === row.key}
              onToggle={() => setOpenKey((k) => (k === row.key ? null : row.key))}
              trustProfile={trustProfile}
              backgroundCheck={backgroundCheck}
              backgroundComplete={backgroundComplete}
              backgroundStartContent={backgroundStartContent}
              referencesContent={referencesContent}
              credentialsContent={credentialsContent}
              onGoToProfile={onGoToProfile}
            />
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-slate-400">
        A clear background check does not verify credentials or references. Approving an uploaded document is a document review, not an issuing-authority confirmation.
      </p>
    </div>
  );
}
