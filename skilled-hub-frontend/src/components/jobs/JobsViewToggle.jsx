import React from 'react';
import { FaCalendarAlt, FaGripHorizontal, FaThLarge } from 'react-icons/fa';
import { VIEW_MODES } from '../../utils/jobDashboardConfig';

const MODES = [
  { id: VIEW_MODES.CARD, label: 'Cards', icon: FaThLarge },
  { id: VIEW_MODES.TABLE, label: 'Table', icon: FaGripHorizontal },
  { id: VIEW_MODES.CALENDAR, label: 'Schedule', icon: FaCalendarAlt, placeholder: true },
];

export default function JobsViewToggle({ viewMode, onChange, allowedModes }) {
  const modes = MODES.filter((m) => allowedModes.includes(m.id));

  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {modes.map(({ id, label, icon: Icon, placeholder }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          title={placeholder ? 'Schedule view coming soon' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 ${
            viewMode === id
              ? 'bg-blue-600 text-white'
              : placeholder
                ? 'text-slate-400 hover:text-slate-600'
                : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
