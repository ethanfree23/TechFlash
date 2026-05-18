import React from 'react';
import StatusBadge from '../command-center/StatusBadge';
import { TYPE_BADGE_VARIANT } from '../../../utils/adminUsersDisplayAdapter';

const LABELS = { technician: 'Technician', company: 'Company', admin: 'Admin' };

export default function UserTypeBadge({ role }) {
  if (!role) return <span className="text-[10px] text-slate-400">—</span>;
  const variant = TYPE_BADGE_VARIANT[role] || 'default';
  return (
    <StatusBadge variant={variant}>
      <span className="whitespace-nowrap">{LABELS[role] || role}</span>
    </StatusBadge>
  );
}
