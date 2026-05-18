import React from 'react';
import StatusBadge from '../command-center/StatusBadge';
import { VERIFICATION_BADGE_VARIANT } from '../../../utils/adminUsersDisplayAdapter';

export default function UserVerificationBadge({ status }) {
  if (!status) return <span className="text-[10px] text-slate-400">Not verified</span>;
  const variant = VERIFICATION_BADGE_VARIANT[status] || 'warning';
  return (
    <StatusBadge variant={variant}>
      <span className="whitespace-nowrap">{status}</span>
    </StatusBadge>
  );
}
