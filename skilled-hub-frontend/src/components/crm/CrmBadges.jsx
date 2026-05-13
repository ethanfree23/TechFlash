import React from 'react';
import { getStatusBadgeClasses, companyTypeLabel } from '../../utils/crmDisplayAdapter';

export function CrmStatusBadge({ status }) {
  const s = String(status || 'lead').toLowerCase();
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${getStatusBadgeClasses(s)}`}
    >
      {s}
    </span>
  );
}

export function CompanyTypeBadge({ type }) {
  return (
    <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
      {companyTypeLabel(type)}
    </span>
  );
}

export function CompanyTypeBadges({ types }) {
  const list = Array.isArray(types) ? types : [];
  if (!list.length) {
    return <span className="text-xs text-slate-400">No trade tags</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((t) => (
        <CompanyTypeBadge key={t} type={t} />
      ))}
    </div>
  );
}
