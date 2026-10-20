import React, { useState } from 'react';
import DateTimeInput from '../components/DateTimeInput';

/**
 * Dev-only harness for visual QA of DateTimeInput.
 * Mounted only when import.meta.env.DEV is true.
 */
export default function DateTimePickerPreviewPage() {
  const [hardDeadlineAt, setHardDeadlineAt] = useState('');
  const [savedValue, setSavedValue] = useState('2026-11-03T10:30');
  const [jobTimezone, setJobTimezone] = useState('America/Chicago');

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Dev preview</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Date & time picker</h1>
          <p className="mt-1 text-sm text-slate-600">
            Mirrors the Hard deadline field on job create. Empty fields preselect tomorrow 8:00 AM until Apply.
          </p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">Work schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Hard deadline</label>
              <DateTimeInput
                id="preview-hard-deadline"
                value={hardDeadlineAt}
                onChange={(e) => setHardDeadlineAt(e.target.value)}
                timeZone={jobTimezone}
                className="w-full"
              />
              <p className="mt-2 text-xs text-slate-500 font-mono">
                committed: {hardDeadlineAt || '(none)'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Job timezone</label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                value={jobTimezone}
                onChange={(e) => setJobTimezone(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">Existing value reopen</h2>
          <DateTimeInput
            id="preview-existing"
            value={savedValue}
            onChange={(e) => setSavedValue(e.target.value)}
            timeZone={jobTimezone}
            className="w-full max-w-md"
          />
          <p className="text-xs text-slate-500 font-mono">committed: {savedValue}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="font-semibold text-slate-900">Near bottom of viewport</h2>
          <p className="text-sm text-slate-600">Open this field to verify the popover flips upward.</p>
          <div className="h-[70vh]" aria-hidden="true" />
          <DateTimeInput
            id="preview-bottom"
            value=""
            onChange={() => {}}
            timeZone={jobTimezone}
            className="w-full max-w-md"
          />
        </section>
      </div>
    </div>
  );
}
