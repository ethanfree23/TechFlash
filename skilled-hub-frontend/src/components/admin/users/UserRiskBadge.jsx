import React from 'react';
import StatusBadge from '../command-center/StatusBadge';
import { RISK_BADGE_VARIANT } from '../../../utils/adminUsersDisplayAdapter';

export default function UserRiskBadge({ level }) {
  const safe = level || 'Low';
  const variant = RISK_BADGE_VARIANT[safe] || 'success';
  return (
    <StatusBadge variant={variant}>
      <span className="whitespace-nowrap">{safe}</span>
    </StatusBadge>
  );
}
