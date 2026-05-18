import React from 'react';
import {
  FaBriefcase,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaFolderOpen,
  FaHourglassHalf,
} from 'react-icons/fa';

const ICONS = {
  total: FaBriefcase,
  open: FaFolderOpen,
  claimed: FaCheckCircle,
  completed: FaCheckCircle,
  expired: FaClock,
  counter: FaHourglassHalf,
  active: FaBriefcase,
};

const TONE_CLASSES = {
  slate: 'border-slate-200/90 bg-white hover:border-slate-300',
  blue: 'border-blue-100 bg-blue-50/50 hover:border-blue-200 hover:bg-blue-50',
  green: 'border-emerald-100 bg-emerald-50/40 hover:border-emerald-200 hover:bg-emerald-50/70',
  orange: 'border-orange-100 bg-orange-50/40 hover:border-orange-200 hover:bg-orange-50/70',
  gray: 'border-slate-200/90 bg-slate-50/80 hover:border-slate-300',
};

const ICON_TONE = {
  slate: 'text-slate-400',
  blue: 'text-blue-500',
  green: 'text-emerald-500',
  orange: 'text-orange-500',
  gray: 'text-slate-400',
};

export default function JobsKpiCard({ id, label, value, tone = 'slate', onClick }) {
  const Icon = ICONS[id] || FaExclamationCircle;
  const clickable = typeof onClick === 'function';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`rounded-lg border px-3 py-2.5 text-left transition-all ${TONE_CLASSES[tone] || TONE_CLASSES.slate} ${
        clickable ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 leading-none truncate">{label}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 leading-none">{value ?? 0}</p>
        </div>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${ICON_TONE[tone] || ICON_TONE.slate}`} aria-hidden />
      </div>
    </button>
  );
}
