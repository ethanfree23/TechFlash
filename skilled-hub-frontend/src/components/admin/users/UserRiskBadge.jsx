import React from 'react';
import StatusBadge from '../command-center/StatusBadge';
import { RISK_BADGE_VARIANT } from '../../../utils/adminUsersDisplayAdapter';

export default function UserRiskBadge({ level, reasons }) {
  const safe = level || 'Low';
  const variant = RISK_BADGE_VARIANT[safe] || 'success';
  const title = Array.isArray(reasons) && reasons.length ? reasons.join(' ') : undefined;
  return (
    <span title={title}>
      <StatusBadge variant={variant}>
        <span className="whitespace-nowrap">{safe}</span>
      </StatusBadge>
    </span>
  );
}
