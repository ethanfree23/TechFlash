import React from 'react';
import StatusBadge from '../command-center/StatusBadge';
import { STATUS_BADGE_VARIANT } from '../../../utils/adminUsersDisplayAdapter';

export default function UserStatusBadge({ status }) {
  if (!status) return <span className="text-xs text-slate-400">Not provided</span>;
  const variant = STATUS_BADGE_VARIANT[status] || 'default';
  return (
    <StatusBadge variant={variant}>
      <span className="whitespace-nowrap">{status}</span>
    </StatusBadge>
  );
}
