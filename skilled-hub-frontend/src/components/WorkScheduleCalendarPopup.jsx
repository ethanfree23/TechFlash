import React, { useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import { WEEKDAY_OPTIONS } from '../utils/workSchedule';

const popupStyles = {
  overlay: { backgroundColor: 'rgba(2, 6, 23, 0.4)', zIndex: 60 },
  content: {
    inset: '8% auto auto 50%',
    transform: 'translateX(-50%)',
    width: 'min(720px, 92vw)',
    borderRadius: '14px',
    border: '1px solid #e2e8f0',
    padding: '20px',
    maxHeight: '84vh',
    overflow: 'auto',
  },
};

const defaultShift = { start_time: '08:00', end_time: '17:00' };

const WorkScheduleCalendarPopup = ({
  isOpen,
  onClose,
  selectedDays,
  shiftsByDay,
  onApply,
}) => {
  const [days, setDays] = useState(selectedDays || []);
  const [shifts, setShifts] = useState(shiftsByDay || {});

  useEffect(() => {
    if (!isOpen) return;
    setDays(selectedDays || []);
    setShifts(shiftsByDay || {});
  }, [isOpen, selectedDays, shiftsByDay]);

  const daySet = useMemo(() => new Set(days.map((d) => Number(d))), [days]);

  const toggleDay = (day) => {
    const num = Number(day);
    setDays((prev) => (prev.includes(num) ? prev.filter((d) => d !== num) : [...prev, num]));
    setShifts((prev) => {
      if (prev[String(num)]) return prev;
      return { ...prev, [String(num)]: { ...defaultShift } };
    });
  };

  const updateShift = (day, field, value) => {
    setShifts((prev) => ({
      ...prev,
      [String(day)]: {
        ...(prev[String(day)] || defaultShift),
        [field]: value,
      },
    }));
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={onClose} style={popupStyles} ariaHideApp={false}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Calendar schedule picker</h3>
          <p className="text-sm text-slate-600">Select working days and set one start/end shift per day.</p>
        </div>
        <button type="button" className="text-slate-500 hover:text-slate-800" onClick={onClose}>Close</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {WEEKDAY_OPTIONS.map((opt) => {
          const active = daySet.has(opt.value);
          const shift = shifts[String(opt.value)] || defaultShift;
          return (
            <div key={opt.value} className={`rounded-lg border p-3 ${active ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
              <label className="flex items-center justify-between gap-2 text-sm font-medium text-slate-800 mb-2">
                <span>{opt.label}</span>
                <input type="checkbox" checked={active} onChange={() => toggleDay(opt.value)} />
              </label>
              {active && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={shift.start_time || defaultShift.start_time}
                    onChange={(e) => updateShift(opt.value, 'start_time', e.target.value)}
                  />
                  <input
                    type="time"
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={shift.end_time || defaultShift.end_time}
                    onChange={(e) => updateShift(opt.value, 'end_time', e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="px-4 py-2 rounded border border-slate-300 text-sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm"
          onClick={() => onApply({ selectedDays: days.sort((a, b) => a - b), shiftsByDay: shifts })}
        >
          Apply schedule
        </button>
      </div>
    </Modal>
  );
};

export default WorkScheduleCalendarPopup;
