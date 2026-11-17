import React from 'react';
import {
  callOutcomeLabel,
  interactionTypeLabel,
} from '../../../utils/technicianActivation';
import { formatRelativeTime } from '../../../utils/adminUsersDisplayAdapter';

export default function InteractionTimeline({ interactions = [], platformEvents = [] }) {
  const crmItems = (interactions || []).map((item) => ({
    key: `crm-${item.id}`,
    iso: item.occurred_at || item.created_at,
    label: buildCrmLabel(item),
    kind: 'crm',
  }));
  const platformItems = (platformEvents || []).map((ev, idx) => ({
    key: `plat-${idx}`,
    iso: ev.iso,
    label: ev.label,
    kind: 'platform',
  }));

  const merged = [...crmItems, ...platformItems]
    .filter((item) => item.iso)
    .sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime())
    .slice(0, 30);

  if (!merged.length) {
    return <p className="text-[11px] text-slate-400 italic">No interactions yet.</p>;
  }

  return (
    <ul className="max-h-48 space-y-1.5 overflow-y-auto">
      {merged.map((item) => (
        <li key={item.key} className="flex gap-2 text-[11px] leading-snug">
          <span className="w-12 shrink-0 tabular-nums text-slate-400">
            {formatRelativeTime(item.iso) || '—'}
          </span>
          <span className={item.kind === 'crm' ? 'text-slate-800' : 'text-slate-600'}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function buildCrmLabel(item) {
  const type = interactionTypeLabel(item.interaction_type);
  const outcome = item.outcome ? ` · ${callOutcomeLabel(item.outcome)}` : '';
  const body = item.body ? `: ${item.body}` : '';
  const author = item.author_name ? ` (${item.author_name})` : '';
  if (item.interaction_type === 'status_change') {
    const prev = item.metadata?.previous_status;
    const next = item.metadata?.new_status;
    return `Status${prev && next ? `: ${prev} → ${next}` : ''}${body}${author}`;
  }
  return `${type}${outcome}${body}${author}`;
}
