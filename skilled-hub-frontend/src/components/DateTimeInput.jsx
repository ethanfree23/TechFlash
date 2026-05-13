import React, { useMemo, useState } from 'react';

/**
 * Custom date-time input that shows AM above PM in the time picker.
 * The native datetime-local picker cannot be customized, so we use
 * separate date + time inputs with AM listed first.
 */
const DateTimeInput = ({ value, onChange, id, className = '', disabled = false }) => {
  const pad = (n) => String(n).padStart(2, '0');
  
  const parseValue = (val) => {
    if (!val) return { date: '', hour: 12, minute: 0, ampm: 'AM' };
    const d = new Date(val);
    const hour12 = d.getHours() % 12 || 12;
    const ampm = d.getHours() < 12 ? 'AM' : 'PM';
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      hour: hour12,
      minute: d.getMinutes(),
      ampm,
    };
  };

  const buildValue = (date, hour, minute, ampm) => {
    if (!date) return '';
    let h = hour;
    if (ampm === 'PM') h = hour === 12 ? 12 : hour + 12;
    else h = hour === 12 ? 0 : hour;
    return `${date}T${pad(h)}:${pad(minute)}`;
  };

  const { date, hour, minute, ampm } = parseValue(value);
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(date);
  const [draftHour, setDraftHour] = useState(hour);
  const [draftMinute, setDraftMinute] = useState(minute);
  const [draftAmpm, setDraftAmpm] = useState(ampm);

  const handleChange = (newDate, newHour, newMinute, newAmpm) => {
    const val = buildValue(newDate || date, newHour ?? hour, newMinute ?? minute, newAmpm || ampm);
    onChange({ target: { value: val } });
  };

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);

  const dateOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = -30; i <= 180; i += 1) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      list.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    if (date && !list.includes(date)) list.unshift(date);
    return list;
  }, [date]);

  const openEditor = () => {
    setDraftDate(date || dateOptions[0] || '');
    setDraftHour(hour);
    setDraftMinute(minute);
    setDraftAmpm(ampm);
    setOpen(true);
  };

  return (
    <div id={id} className={`space-y-2 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={openEditor}
        className={`w-full border rounded px-3 py-2 text-left ${disabled ? 'bg-gray-100 text-gray-400' : 'bg-white'}`}
      >
        {date ? `${date} ${pad(hour)}:${pad(minute)} ${ampm}` : 'Select date/time'}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-3">
          <div className="w-full max-w-lg rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Choose date & time</h3>
              <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Date</p>
                <div className="max-h-52 overflow-y-auto rounded border">
                  {dateOptions.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDraftDate(d)}
                      className={`block w-full px-3 py-2 text-left text-sm ${draftDate === d ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Hour</p>
                <div className="max-h-52 overflow-y-auto rounded border">
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setDraftHour(h)}
                      className={`block w-full px-3 py-2 text-left text-sm ${draftHour === h ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                    >
                      {pad(h)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Minute</p>
                <div className="max-h-52 overflow-y-auto rounded border">
                  {minutes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDraftMinute(m)}
                      className={`block w-full px-3 py-2 text-left text-sm ${draftMinute === m ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                    >
                      {pad(m)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className={`rounded border px-3 py-2 text-sm ${draftAmpm === 'AM' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300'}`}
                onClick={() => setDraftAmpm('AM')}
              >
                AM
              </button>
              <button
                type="button"
                className={`rounded border px-3 py-2 text-sm ${draftAmpm === 'PM' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300'}`}
                onClick={() => setDraftAmpm('PM')}
              >
                PM
              </button>
              <div className="ml-auto flex gap-2">
                <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    handleChange(draftDate, draftHour, draftMinute, draftAmpm);
                    setOpen(false);
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DateTimeInput;
