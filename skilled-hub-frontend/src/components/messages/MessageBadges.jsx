import React from 'react';
import { MESSAGE_TYPES, MESSAGE_STATUSES, MESSAGE_PRIORITIES, ROLE_LABELS } from './constants';

function Badge({ className, label, title }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${className}`}
      title={title || label}
    >
      {label}
    </span>
  );
}

export function TypeBadge({ type, className = '' }) {
  const cfg = MESSAGE_TYPES[type] || MESSAGE_TYPES.general;
  return (
    <Badge
      className={`${cfg.badgeClass} ${className}`}
      label={cfg.label}
      title={cfg.description}
    />
  );
}

export function StatusBadge({ status, className = '' }) {
  const cfg = MESSAGE_STATUSES[status] || MESSAGE_STATUSES.open;
  return <Badge className={`${cfg.badgeClass} ${className}`} label={cfg.label} title={`Status: ${cfg.label}`} />;
}

export function PriorityBadge({ priority, className = '' }) {
  const cfg = MESSAGE_PRIORITIES[priority] || MESSAGE_PRIORITIES.normal;
  return <Badge className={`${cfg.badgeClass} ${className}`} label={cfg.label} title={`Priority: ${cfg.label}`} />;
}

export function RoleBadge({ role, className = '' }) {
  const cfg = ROLE_LABELS[role] || { label: role, badgeClass: 'bg-gray-100 text-gray-700 border-gray-200' };
  return <Badge className={`${cfg.badgeClass} ${className}`} label={cfg.label} title={`Role: ${cfg.label}`} />;
}
