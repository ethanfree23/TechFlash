import React from 'react';
import {
  formatScheduleMoment,
  formatWorkingDate,
  scheduleOptionTitle,
} from '../../utils/scheduleAvailability';

const DateChips = ({ label, dates, tone }) => {
  if (!dates || dates.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {dates.map((d) => (
          <span key={d} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
            {formatWorkingDate(d)}
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * The company's view of an alternate schedule a technician proposed.
 *
 * Everything here is structured data the API calculated, so the company sees exactly which
 * of their requested days are covered and which are not — never a free-text explanation.
 */
const ScheduleProposalSummary = ({ offer }) => {
  const proposal = offer?.schedule_proposal;
  if (!proposal) return null;

  const covered = Array.isArray(proposal.proposed_working_dates) ? proposal.proposed_working_dates : [];
  const missed = Array.isArray(proposal.unavailable_working_dates) ? proposal.unavailable_working_dates : [];

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900">
          Alternate schedule
        </span>
        {proposal.reason === 'schedule_conflict' && (
          <span className="text-[10px] font-medium text-amber-800">
            proposed because of a clash with work they already have
          </span>
        )}
        {proposal.stale && (
          <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800">
            Out of date
          </span>
        )}
      </div>

      <p className="text-sm font-semibold text-slate-900">{scheduleOptionTitle(proposal)}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-700">
        <p>
          <span className="font-medium">You asked for:</span>{' '}
          {formatScheduleMoment(proposal.original_start_at)} – {formatScheduleMoment(proposal.original_end_at)}
          {proposal.original_days ? ` (${proposal.original_days} days)` : ''}
        </p>
        <p>
          <span className="font-medium">They can work:</span>{' '}
          {formatScheduleMoment(proposal.proposed_start_at)} – {formatScheduleMoment(proposal.proposed_end_at)}
          {proposal.proposed_days ? ` (${proposal.proposed_days} days)` : ''}
        </p>
      </div>

      <DateChips
        label="Days covered"
        dates={covered}
        tone="bg-emerald-50 text-emerald-800 border border-emerald-200/70"
      />
      <DateChips
        label="Days not covered"
        dates={missed}
        tone="bg-white text-slate-600 border border-slate-200"
      />

      {proposal.partial_duration ? (
        <p className="text-xs text-amber-900">
          Accepting shortens the job to {proposal.proposed_days} days. The pay rate is unchanged
          and you are refunded for the days that will not be worked.
        </p>
      ) : (
        <p className="text-xs text-amber-900">
          Accepting keeps all {proposal.original_days} days and your agreed pay; only the dates move.
        </p>
      )}

      {proposal.stale && (
        <p className="text-xs text-red-800">
          The job&apos;s schedule or pay changed after this was proposed, so it can no longer be
          accepted. Ask the technician to send an updated schedule.
        </p>
      )}
    </div>
  );
};

export default ScheduleProposalSummary;
