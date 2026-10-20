import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  TIME_PRESETS,
  QUICK_SELECTS,
  applyQuickSelect,
  buildMonthGrid,
  buildWallDateTime,
  clampHour12,
  clampMinute,
  formatDisplayValue,
  formatMonthLabel,
  initialDraftFromValue,
  isDateBeforeToday,
  parseDateKey,
  shiftMonth,
  todayDateKey,
} from '../utils/dateTimePicker';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');

/**
 * Premium date/time picker used across job scheduling fields.
 * Keeps the existing `{ target: { value } }` onChange contract and
 * `YYYY-MM-DDTHH:mm` wall-clock value format.
 *
 * @param {object} props
 * @param {string} [props.value]
 * @param {(e: { target: { value: string } }) => void} props.onChange
 * @param {string} [props.id]
 * @param {string} [props.className]
 * @param {boolean} [props.disabled]
 * @param {string} [props.timeZone] IANA zone for "today/tomorrow" defaults (does not shift saved wall times)
 * @param {boolean} [props.allowPast=true] When false, dates before today (in timeZone) cannot be newly selected
 * @param {string} [props.placeholder]
 */
const DateTimeInput = ({
  value,
  onChange,
  id,
  className = '',
  disabled = false,
  timeZone,
  allowPast = true,
  placeholder = 'Select date & time',
}) => {
  const reactId = useId();
  const panelId = `dtp-panel-${reactId}`;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelFocusRef = useRef(null);
  const hourSelectRef = useRef(null);
  const minuteSelectRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => initialDraftFromValue(value, { timeZone }));
  const [viewYear, setViewYear] = useState(() => {
    const p = parseDateKey(initialDraftFromValue(value, { timeZone }).date);
    return p?.year ?? new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const p = parseDateKey(initialDraftFromValue(value, { timeZone }).date);
    return p?.month ?? new Date().getMonth() + 1;
  });
  const [placement, setPlacement] = useState('bottom');

  const openEditor = () => {
    if (disabled) return;
    const next = initialDraftFromValue(value, { timeZone });
    setDraft(next);
    const parsed = parseDateKey(next.date);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
    setOpen(true);
  };

  const closeWithoutSaving = useCallback(() => {
    setOpen(false);
  }, []);

  const applyAndClose = useCallback(() => {
    if (!draft.date) return;
    const next = {
      ...draft,
      hour: clampHour12(draft.hour),
      minute: clampMinute(draft.minute),
      ampm: draft.ampm === 'PM' ? 'PM' : 'AM',
    };
    if (!allowPast && isDateBeforeToday(next.date, new Date(), timeZone)) return;
    const val = buildWallDateTime(next.date, next.hour, next.minute, next.ampm);
    onChange({ target: { value: val } });
    setOpen(false);
  }, [allowPast, draft, onChange, timeZone]);

  // Position: flip above the trigger when near the bottom of the viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    const update = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedPanel = 440;
      setPlacement(spaceBelow < estimatedPanel && rect.top > spaceBelow ? 'top' : 'bottom');
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeWithoutSaving();
        triggerRef.current?.focus();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const tag = e.target?.tagName;
        if (tag === 'TEXTAREA') return;
        if (tag === 'BUTTON') return;
        e.preventDefault();
        applyAndClose();
      }
    };

    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        closeWithoutSaving();
      }
    };

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPointer);
    // Move focus into the dialog for a11y without stealing clicks from time fields.
    const t = window.setTimeout(() => panelFocusRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPointer);
      window.clearTimeout(t);
    };
  }, [open, closeWithoutSaving, applyAndClose]);

  const setDraftDate = (dateKey) => {
    if (!allowPast && isDateBeforeToday(dateKey, new Date(), timeZone)) return;
    setDraft((prev) => ({ ...prev, date: dateKey }));
    const parsed = parseDateKey(dateKey);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  };

  const onQuick = (kind) => {
    const next = applyQuickSelect(kind, draft, { timeZone });
    setDraft(next);
    const parsed = parseDateKey(next.date);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  };

  const applyPreset = (preset) => {
    setDraft((prev) => ({
      ...prev,
      hour: preset.hour,
      minute: preset.minute,
      ampm: preset.ampm,
    }));
  };

  const setHour = (hour) => {
    setDraft((prev) => ({ ...prev, hour: clampHour12(hour) }));
  };

  const setMinute = (minute) => {
    setDraft((prev) => ({ ...prev, minute: clampMinute(minute) }));
  };

  const todayKey = todayDateKey(new Date(), timeZone);
  const cells = buildMonthGrid(viewYear, viewMonth);
  const display = value ? formatDisplayValue(value) : '';

  const navMonth = (delta) => {
    const next = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  };

  return (
    <div id={id} ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? closeWithoutSaving() : openEditor())}
        className={[
          'group w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-500',
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
            : open
              ? 'border-blue-500 bg-white text-slate-900 shadow-sm ring-2 ring-blue-500/15'
              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300',
        ].join(' ')}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={display ? 'text-slate-800' : 'text-slate-400'}>
            {display || placeholder}
          </span>
          <svg
            className={`h-4 w-4 shrink-0 transition-colors duration-150 ${open ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'}`}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6.5 3.5v1.2M13.5 3.5v1.2M3.75 7.25h12.5M4.5 5.5h11c.69 0 1.25.56 1.25 1.25v8c0 .69-.56 1.25-1.25 1.25h-11c-.69 0-1.25-.56-1.25-1.25v-8c0-.69.56-1.25 1.25-1.25z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <>
          {/* Mobile backdrop / bottom-sheet shell */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/35 sm:hidden transition-opacity duration-150"
            aria-hidden="true"
            onClick={closeWithoutSaving}
          />
          <div
            id={panelId}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Select date and time"
            className={[
              'z-50 w-full bg-white shadow-xl border border-slate-200/90',
              'transition-all duration-150 ease-out',
              // Mobile: bottom sheet
              'fixed inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
              // Desktop: anchored popover
              'sm:absolute sm:inset-x-auto sm:bottom-auto sm:max-h-none sm:overflow-visible sm:rounded-xl sm:p-3.5 sm:w-[22.5rem] sm:max-w-[calc(100vw-1.5rem)]',
              placement === 'top' ? 'sm:bottom-full sm:mb-2 sm:top-auto' : 'sm:top-full sm:mt-2',
              'sm:left-0',
            ].join(' ')}
          >
            <div
              ref={panelFocusRef}
              tabIndex={-1}
              className="outline-none"
              aria-hidden="true"
            />
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold tracking-tight text-slate-900">
                  Select date & time
                </p>
                {timeZone ? (
                  <p className="mt-0.5 text-[11px] text-slate-500 truncate" title={timeZone}>
                    {timeZone}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="sm:hidden -mr-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                onClick={closeWithoutSaving}
              >
                Close
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {QUICK_SELECTS.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onQuick(q.id)}
                  className="rounded-md border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-[12px] font-medium text-slate-700 transition-colors duration-150 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  {q.label}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-1.5">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => navMonth(-1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  <Chevron dir="left" />
                </button>
                <p className="text-[13px] font-semibold text-slate-900 tabular-nums">
                  {formatMonthLabel(viewYear, viewMonth)}
                </p>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => navMonth(1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  <Chevron dir="right" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-0 px-1.5 pt-2 pb-0.5">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 px-1.5 pb-2">
                {cells.map((cell) => {
                  const selected = draft.date === cell.key;
                  const isToday = cell.key === todayKey;
                  const past = !allowPast && isDateBeforeToday(cell.key, new Date(), timeZone);
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={past}
                      aria-label={cell.key}
                      aria-pressed={selected}
                      onClick={() => setDraftDate(cell.key)}
                      className={[
                        'relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12px] transition-colors duration-150',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
                        past ? 'cursor-not-allowed text-slate-300' : '',
                        !past && !selected && cell.inMonth ? 'text-slate-800 hover:bg-slate-100' : '',
                        !past && !selected && !cell.inMonth ? 'text-slate-300 hover:bg-slate-50' : '',
                        selected ? 'bg-blue-600 font-semibold text-white hover:bg-blue-600' : '',
                        !selected && isToday ? 'font-semibold text-blue-700 ring-1 ring-inset ring-blue-200' : '',
                      ].join(' ')}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Time
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/60 p-1">
                  <label className="sr-only" htmlFor={`${panelId}-hour`}>Hour</label>
                  <select
                    id={`${panelId}-hour`}
                    ref={hourSelectRef}
                    aria-label="Hour"
                    value={draft.hour}
                    onChange={(e) => setHour(Number(e.target.value))}
                    className="h-9 appearance-none rounded-md border-0 bg-white px-2 pr-6 text-sm font-semibold tabular-nums text-slate-900 outline-none ring-0 focus:ring-2 focus:ring-blue-500/25"
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' fill='none' stroke='%2394a3b8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.4rem center',
                    }}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>{pad(h)}</option>
                    ))}
                  </select>
                  <span className="px-0.5 text-sm font-semibold text-slate-400" aria-hidden="true">:</span>
                  <label className="sr-only" htmlFor={`${panelId}-minute`}>Minute</label>
                  <select
                    id={`${panelId}-minute`}
                    ref={minuteSelectRef}
                    aria-label="Minute"
                    value={draft.minute}
                    onChange={(e) => setMinute(Number(e.target.value))}
                    className="h-9 appearance-none rounded-md border-0 bg-white px-2 pr-6 text-sm font-semibold tabular-nums text-slate-900 outline-none ring-0 focus:ring-2 focus:ring-blue-500/25"
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' fill='none' stroke='%2394a3b8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.4rem center',
                    }}
                  >
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>{pad(m)}</option>
                    ))}
                  </select>
                </div>

                <div
                  className="inline-flex rounded-lg border border-slate-200 bg-slate-50/60 p-0.5"
                  role="group"
                  aria-label="AM or PM"
                >
                  {['AM', 'PM'].map((period) => {
                    const active = draft.ampm === period;
                    return (
                      <button
                        key={period}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setDraft((prev) => ({ ...prev, ampm: period }))}
                        className={[
                          'min-w-[2.75rem] rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors duration-150',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
                          active
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-white hover:text-slate-900',
                        ].join(' ')}
                      >
                        {period}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {TIME_PRESETS.map((preset) => {
                  const active =
                    draft.hour === preset.hour &&
                    draft.minute === preset.minute &&
                    draft.ampm === preset.ampm;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={[
                        'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors duration-150',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
                        active
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={closeWithoutSaving}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyAndClose}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

function Chevron({ dir }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M10 3.5L5.5 8l4.5 4.5' : 'M6 3.5L10.5 8 6 12.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default DateTimeInput;
