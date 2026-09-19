import React from 'react';
import { FaBriefcase, FaCalendarTimes } from 'react-icons/fa';

const chip = 'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border';

/** Shown to technicians on any job the company flagged as a possible route to a permanent role. */
export const PotentialFullTimeBadge = ({ className = '' }) => (
  <span
    className={`${chip} text-indigo-800 bg-indigo-50 border-indigo-200/80 ${className}`}
    title="This job may lead to a permanent role. Permanent employment is not guaranteed."
  >
    <FaBriefcase className="h-2.5 w-2.5" />
    Potential full-time
  </span>
);

/**
 * Shown instead of hiding a job that overlaps something the technician already claimed.
 * The job stays claimable through an alternate-schedule proposal.
 */
export const ScheduleConflictBadge = ({ className = '' }) => (
  <span
    className={`${chip} text-amber-900 bg-amber-50 border-amber-300/80 ${className}`}
    title="This job overlaps work you have already claimed. You can propose an alternate schedule."
  >
    <FaCalendarTimes className="h-2.5 w-2.5" />
    Schedule conflict
  </span>
);
