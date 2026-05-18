import React from 'react';
import { FaUsers, FaWrench, FaBuilding, FaChartLine, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { KpiCardsSkeleton } from './UsersSkeleton';

const CARDS = [
  { id: 'total', label: 'Total Users', icon: FaUsers },
  { id: 'technicians', label: 'Technicians', icon: FaWrench },
  { id: 'companies', label: 'Company Users', icon: FaBuilding },
  { id: 'active', label: 'Active (30d)', icon: FaChartLine },
  { id: 'pending', label: 'Pending', icon: FaClock },
  { id: 'flagged', label: 'Flagged', icon: FaExclamationTriangle },
];

function getCardValue(id, kpis) {
  switch (id) {
    case 'total': return kpis.total;
    case 'technicians': return kpis.technicians;
    case 'companies': return kpis.companies;
    case 'active': return kpis.active30d;
    case 'pending': return kpis.pending;
    case 'flagged': return kpis.flagged + kpis.suspended;
    default: return 0;
  }
}

function getCardSubtext(id, kpis) {
  switch (id) {
    case 'total':
      return kpis.newThisMonth > 0 ? `+${kpis.newThisMonth} this month` : 'All accounts';
    case 'technicians':
      if (kpis.techVerified != null) return `${kpis.techVerified} verified · ${kpis.techPending} pending`;
      return `${kpis.techPending ?? 0} pending`;
    case 'companies':
      return `${kpis.uniqueCompanies} companies`;
    case 'active':
      return `${kpis.activePercent}% of total`;
    case 'pending':
      return kpis.pending > 0 ? 'Needs review' : 'All clear';
    case 'flagged':
      return kpis.flagged + kpis.suspended > 0 ? 'Action needed' : 'None flagged';
    default:
      return '';
  }
}

function getCardAccent(id, kpis) {
  if (id === 'pending' && kpis.pending > 0) return 'ring-1 ring-amber-200/80 bg-amber-50/40';
  if (id === 'flagged' && kpis.flagged + kpis.suspended > 0) return 'ring-1 ring-red-200/80 bg-red-50/30';
  return 'bg-white hover:bg-slate-50/80';
}

export default function UsersKpiCards({ kpis, loading, onCardClick }) {
  if (loading) return <KpiCardsSkeleton />;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-4">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = getCardValue(card.id, kpis);
        const subtext = getCardSubtext(card.id, kpis);
        const accent = getCardAccent(card.id, kpis);

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onCardClick?.(card.id)}
            className={`group rounded-lg border border-slate-200/90 px-2.5 py-2 text-left transition-all hover:border-slate-300 hover:shadow-sm ${accent}`}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 leading-none truncate">
                {card.label}
              </p>
              <Icon className="w-3 h-3 text-slate-300 group-hover:text-slate-400 shrink-0" aria-hidden />
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 leading-none">{value}</p>
            <p className="mt-1 text-[10px] text-slate-500 truncate leading-tight">{subtext}</p>
          </button>
        );
      })}
    </div>
  );
}
