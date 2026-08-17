import React, { useCallback, useEffect, useState } from 'react';
import { jobsAPI } from '../../api/api';
import { isGuaranteedPay, payBasisLabel } from '../../utils/companyPlatformFee';

const formatMoney = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export default function JobTimeEntriesPanel({ job, canManage, canSubmit, onChanged }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workedOnDate, setWorkedOnDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!job?.id) return;
    setLoading(true);
    setError('');
    try {
      const data = await jobsAPI.listTimeEntries(job.id);
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Could not load time entries.');
    } finally {
      setLoading(false);
    }
  }, [job?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const submitHours = async (e) => {
    e.preventDefault();
    if (!workedOnDate) {
      setError('Choose the date worked.');
      return;
    }
    const start = new Date(`${workedOnDate}T${startTime}`);
    const end = new Date(`${workedOnDate}T${endTime}`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setError('End time must be after start time.');
      return;
    }
    const hours = (end.getTime() - start.getTime()) / 36e5;
    setSubmitting(true);
    setError('');
    try {
      await jobsAPI.createTimeEntry(job.id, {
        worked_on_date: workedOnDate,
        worked_start_at: start.toISOString(),
        worked_end_at: end.toISOString(),
        worked_hours: hours,
      });
      setWorkedOnDate('');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not submit hours.');
    } finally {
      setSubmitting(false);
    }
  };

  const actOnEntry = async (entryId, action) => {
    setError('');
    try {
      if (action === 'approve') await jobsAPI.approveTimeEntry(job.id, entryId);
      else await jobsAPI.rejectTimeEntry(job.id, entryId);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not update that time entry.');
    }
  };

  const approvedGross = entries
    .filter((entry) => entry.status === 'approved' || entry.status === 1)
    .reduce((sum, entry) => sum + (Number(entry.time_entry_pay_line?.gross_pay_cents) || 0), 0);

  return (
    <div className="mb-6 rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Hours worked</h3>
      <p className="text-sm text-gray-600 mb-3">
        Pay basis: {payBasisLabel(job?.pay_basis)}.
        {isGuaranteedPay(job?.pay_basis)
          ? ' Approved hours are operational only; settlement uses the guaranteed job pay.'
          : ' Approved hours (including overtime/weekend premiums) determine final labor before membership commissions.'}
      </p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading hours…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">No time entries yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 p-2 text-sm">
              <div>
                <span className="font-medium">{entry.worked_on_date || '—'}</span>
                {' · '}
                {Number(entry.worked_hours || 0).toFixed(2)} hrs
                {entry.time_entry_pay_line?.gross_pay_cents != null && (
                  <> · {formatMoney(entry.time_entry_pay_line.gross_pay_cents)}</>
                )}
                <span className="ml-2 text-gray-500">({entry.status})</span>
              </div>
              {canManage && (entry.status === 'submitted' || entry.status === 0) && (
                <div className="flex gap-2">
                  <button type="button" className="px-2 py-1 bg-green-600 text-white rounded text-xs" onClick={() => actOnEntry(entry.id, 'approve')}>
                    Approve
                  </button>
                  <button type="button" className="px-2 py-1 bg-red-600 text-white rounded text-xs" onClick={() => actOnEntry(entry.id, 'reject')}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          <p className="text-sm text-gray-700">Approved labor: {formatMoney(approvedGross)}</p>
        </div>
      )}
      {canSubmit && ['filled', 'reserved', 'accepted'].includes(job?.status) && (
        <form onSubmit={submitHours} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <label className="text-sm">
            Date
            <input type="date" className="mt-1 w-full border rounded p-2" value={workedOnDate} onChange={(e) => setWorkedOnDate(e.target.value)} />
          </label>
          <label className="text-sm">
            Start
            <input type="time" className="mt-1 w-full border rounded p-2" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="text-sm">
            End
            <input type="time" className="mt-1 w-full border rounded p-2" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
          <button type="submit" disabled={submitting} className="px-3 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit hours'}
          </button>
        </form>
      )}
    </div>
  );
}
