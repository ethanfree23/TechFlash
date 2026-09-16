import React, { useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import { jobsAPI } from '../../api/api';
import {
  describeScheduleOption,
  formatScheduleMoment,
  formatWorkingDate,
  scheduleOptionTitle,
} from '../../utils/scheduleAvailability';

const btnBase =
  'inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed px-4 py-2';
const btnPrimary = `${btnBase} bg-blue-600 text-white hover:bg-blue-700`;
const btnSecondary = `${btnBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium`;

const DateList = ({ label, dates, tone }) => {
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
 * Opens when a technician claims a job that overlaps work they already have.
 *
 * Instead of refusing the claim, TechFlash offers the alternate schedules it has already
 * worked out and sends the chosen one to the company as a counter offer, so the company
 * accepts or declines it through the same negotiation they already know.
 */
const ScheduleConflictModal = ({ isOpen, onClose, job, conflict, onProposalSent }) => {
  const options = useMemo(() => (Array.isArray(conflict?.options) ? conflict.options : []), [conflict]);
  const [selectedKind, setSelectedKind] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedKind(options[0]?.kind || '');
    setError('');
  }, [isOpen, options]);

  const selected = options.find((o) => o.kind === selectedKind) || null;

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const offer = await jobsAPI.createCounterOffer(job.id, { schedule_option: selected.kind });
      onProposalSent?.(offer);
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not send the schedule proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      ariaHideApp={false}
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      overlayClassName="fixed inset-0 bg-black/40 z-40"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-slate-900">This job overlaps your schedule</h2>
        <p className="mt-2 text-sm text-slate-600">
          {conflict?.message
            || 'You already have a job scheduled during part of this one.'}
          {' '}
          You do not have to give it up — pick a schedule you can actually work and TechFlash
          will send it to the company as a counter offer.
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
          <p>
            <span className="font-medium">Company asked for:</span>{' '}
            {formatScheduleMoment(conflict?.requested_start_at)} through{' '}
            {formatScheduleMoment(conflict?.requested_end_at)}
            {conflict?.requested_days ? ` (${conflict.requested_days} working days)` : ''}
          </p>
          {conflict?.committed_through_at && (
            <p>
              <span className="font-medium">You are already committed through:</span>{' '}
              {formatScheduleMoment(conflict.committed_through_at)}
            </p>
          )}
        </div>

        {options.length === 0 ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            There is no alternate schedule that fits this job&apos;s constraints, so it cannot be
            claimed. Check back if the company changes the dates.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {options.map((option) => {
              const active = option.kind === selectedKind;
              return (
                <label
                  key={option.kind}
                  className={`block cursor-pointer rounded-xl border p-3 transition-colors ${
                    active ? 'border-blue-400 bg-blue-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="schedule-option"
                      className="mt-1"
                      checked={active}
                      onChange={() => setSelectedKind(option.kind)}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {scheduleOptionTitle(option)}
                      </p>
                      <p className="text-sm text-slate-600">{describeScheduleOption(option)}</p>
                      {active && (
                        <div className="space-y-2 pt-1">
                          <DateList
                            label="Days you would work"
                            dates={option.working_dates}
                            tone="bg-emerald-50 text-emerald-800 border border-emerald-200/70"
                          />
                          <DateList
                            label="Requested days you cannot cover"
                            dates={option.unavailable_dates}
                            tone="bg-slate-100 text-slate-600 border border-slate-200"
                          />
                          {option.partial && (
                            <p className="text-xs text-amber-800">
                              You would be paid for the {option.days} day
                              {option.days === 1 ? '' : 's'} you work, not the full
                              {' '}{option.requested_days}. The company is refunded the difference
                              if they accept.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          {options.length > 0 && (
            <button
              type="button"
              className={btnPrimary}
              onClick={handleSubmit}
              disabled={submitting || !selected}
            >
              {submitting ? 'Sending…' : 'Send this schedule to the company'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ScheduleConflictModal;
