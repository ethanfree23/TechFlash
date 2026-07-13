import React from 'react';
import { FaCheck } from 'react-icons/fa';

export function MembershipPlanCard({
  plan,
  selected,
  onSelect,
  billingInterval,
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex w-full flex-col rounded-2xl border-2 p-5 text-left transition ${
        selected
          ? 'border-tf-orange bg-orange-50/50 shadow-md ring-1 ring-tf-orange/20'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {plan.isPopular && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-tf-orange px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Most popular
        </span>
      )}
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            selected ? 'border-tf-orange bg-tf-orange' : 'border-gray-300 bg-white'
          }`}
          aria-hidden
        >
          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-bold text-tf-navy">{plan.name}</h3>
            <span className="text-lg font-bold text-tf-orange">{plan.priceLabel}</span>
          </div>
          {billingInterval === 'yearly' && plan.yearlySavingsLabel && (
            <p className="mt-1 text-xs font-semibold text-emerald-700">{plan.yearlySavingsLabel}</p>
          )}
          {plan.features.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <FaCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 space-y-2 pr-1 text-sm text-gray-700">
            <p>
              <span className="font-bold text-tf-navy">Job access: </span>
              {plan.jobAccessLabel}
            </p>
            <p>
              <span className="font-bold text-tf-navy">Commission: </span>
              {plan.commissionLabel}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
