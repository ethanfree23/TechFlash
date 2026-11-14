import React from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime, formatRelative } from '../../../utils/trustSafety';

const ACTION_TONE = {
  background_check_override: 'bg-slate-900',
  document_approved: 'bg-emerald-500',
  reference_approved: 'bg-emerald-500',
  document_rejected: 'bg-red-500',
  reference_rejected: 'bg-red-500',
  document_rereviewed: 'bg-amber-500',
  reference_rereviewed: 'bg-amber-500',
  document_info_requested: 'bg-tf-blue',
  reference_info_requested: 'bg-tf-blue',
  reference_contact_attempt: 'bg-violet-500',
  reviewer_note: 'bg-slate-400',
};

function detailLine(event) {
  const d = event.details || {};
  const parts = [];
  if (d.override_status) parts.push(`Decision: ${String(d.override_status).replace(/_/g, ' ')}`);
  if (d.previous_override_status && d.previous_override_status !== 'none') parts.push(`was ${String(d.previous_override_status).replace(/_/g, ' ')}`);
  if (d.new_status && d.previous_status) parts.push(`${d.previous_status} → ${d.new_status}`);
  if (d.provider_normalized_status) parts.push(`Checkr: ${String(d.provider_normalized_status).replace(/_/g, ' ')}`);
  if (d.outcome) parts.push(`Outcome: ${String(d.outcome).replace(/_/g, ' ')}${d.method ? ` via ${d.method}` : ''}`);
  if (d.doc_type) parts.push(`Type: ${String(d.doc_type).replace(/_/g, ' ')}`);
  return parts.join(' · ');
}

function quoteText(event) {
  const d = event.details || {};
  return d.reason || d.note || d.message || d.rejection_reason || d.review_notes || d.admin_notes || null;
}

export default function AuditTimeline({ events, showTechnician = false, emptyText = 'No review activity recorded yet.', onOpenItem }) {
  if (!events?.length) {
    return <p className="text-xs text-slate-400 py-2">{emptyText}</p>;
  }
  return (
    <ol className="relative border-l border-slate-200 ml-1.5 space-y-4">
      {events.map((event) => {
        const quote = quoteText(event);
        const detail = detailLine(event);
        return (
          <li key={event.id} className="ml-4">
            <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${ACTION_TONE[event.action] || 'bg-slate-300'}`} aria-hidden="true" />
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <p className="text-xs font-semibold text-slate-800">
                {event.action_label}
                {showTechnician && event.technician && (
                  <>
                    {' '}
                    <span className="font-normal text-slate-500">for</span>{' '}
                    <Link to={event.technician.admin_user_path} className="text-tf-blue hover:underline">
                      {event.technician.display_name}
                    </Link>
                  </>
                )}
              </p>
              <time dateTime={event.created_at} title={formatDateTime(event.created_at)} className="text-[10px] text-slate-400 tabular-nums">
                {formatRelative(event.created_at)}
              </time>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              by {event.actor?.name || 'Unknown reviewer'}
              {detail ? ` · ${detail}` : ''}
              {onOpenItem && event.item_key && (
                <>
                  {' · '}
                  <button type="button" onClick={() => onOpenItem(event.item_key)} className="text-tf-blue hover:underline">
                    Open item
                  </button>
                </>
              )}
            </p>
            {quote && <blockquote className="mt-1 rounded-md bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-xs text-slate-700 whitespace-pre-wrap">{quote}</blockquote>}
          </li>
        );
      })}
    </ol>
  );
}
