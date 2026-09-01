import React from 'react';
import { FaPlus, FaTimes } from 'react-icons/fa';
import { TRADE_OPTIONS } from '../constants/trades';
import { isTechnicianClass, technicianClassLabel, technicianClassSelectOptions } from '../constants/technicianClass';
import { makeTradeLine, unusedTradeOptions } from '../utils/tradeQualifications';

const SETTINGS_INPUT = 'w-full border rounded-lg px-3 py-2 bg-white';
const SIGNUP_INPUT =
  'mt-1 flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm focus-within:border-[#3A7CA5] focus-within:ring-1 focus-within:ring-[#3A7CA5]';
const SIGNUP_SELECT =
  'min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0';

export default function TechnicianTradeLines({
  lines,
  onChange,
  variant = 'settings',
  idPrefix = 'trade',
  required = true,
}) {
  const isSignup = variant === 'signup';
  const rows = Array.isArray(lines) && lines.length ? lines : [makeTradeLine()];
  const inputClass = isSignup ? SIGNUP_INPUT : SETTINGS_INPUT;
  const numberWrapClass = isSignup ? SIGNUP_INPUT : SETTINGS_INPUT;
  const labelClass = isSignup ? 'block text-sm font-medium text-gray-700' : 'block text-sm font-medium text-gray-700 mb-1';

  const updateLine = (id, patch) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addLine = () => {
    onChange([...rows, makeTradeLine()]);
  };

  const removeLine = (id) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((row) => row.id !== id));
  };

  const usedAllTrades = unusedTradeOptions(rows, null).length === 0;

  return (
    <div className="space-y-3">
      {rows.map((line, index) => {
        const tradeChoices = unusedTradeOptions(rows, line.trade_type);
        const showCurrent =
          line.trade_type && !TRADE_OPTIONS.includes(line.trade_type) && !tradeChoices.includes(line.trade_type);
        return (
          <div key={line.id} className={isSignup ? 'rounded-xl border border-gray-100 bg-gray-50/40 p-3' : ''}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
                <label className={labelClass}>
                  {index === 0 ? 'Trade type' : `Trade type ${index + 1}`}
                  {isSignup ? (
                    <div className={inputClass}>
                      <select
                        id={`${idPrefix}-type-${index}`}
                        value={line.trade_type || ''}
                        onChange={(e) => updateLine(line.id, { trade_type: e.target.value })}
                        className={SIGNUP_SELECT}
                        required={required && index === 0}
                      >
                        <option value="">Select trade type</option>
                        {showCurrent && <option value={line.trade_type}>{line.trade_type}</option>}
                        {tradeChoices.map((trade) => (
                          <option key={trade} value={trade}>
                            {trade}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <select
                      id={`${idPrefix}-type-${index}`}
                      value={line.trade_type || ''}
                      onChange={(e) => updateLine(line.id, { trade_type: e.target.value })}
                      className={inputClass}
                      required={required && index === 0}
                    >
                      <option value="">Select trade type</option>
                      {showCurrent && <option value={line.trade_type}>{line.trade_type}</option>}
                      {tradeChoices.map((trade) => (
                        <option key={trade} value={trade}>
                          {trade}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className={labelClass}>
                  Class
                  {isSignup ? (
                    <div className={inputClass}>
                      <select
                        id={`${idPrefix}-class-${index}`}
                        value={line.skill_class || ''}
                        onChange={(e) => updateLine(line.id, { skill_class: e.target.value })}
                        className={SIGNUP_SELECT}
                        required={required && index === 0}
                      >
                        <option value="">Select class</option>
                        {technicianClassSelectOptions(line.skill_class).map((value) => (
                          <option key={value} value={value} disabled={!isTechnicianClass(value)}>
                            {technicianClassLabel(value)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <select
                      id={`${idPrefix}-class-${index}`}
                      value={line.skill_class || ''}
                      onChange={(e) => updateLine(line.id, { skill_class: e.target.value })}
                      className={inputClass}
                      required={required && index === 0}
                    >
                      <option value="">Select class</option>
                      {technicianClassSelectOptions(line.skill_class).map((value) => (
                        <option key={value} value={value} disabled={!isTechnicianClass(value)}>
                          {technicianClassLabel(value)}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className={labelClass}>
                  Years of experience
                  {isSignup ? (
                    <div className={numberWrapClass}>
                      <input
                        id={`${idPrefix}-years-${index}`}
                        type="number"
                        min="0"
                        value={line.experience_years ?? ''}
                        onChange={(e) => updateLine(line.id, { experience_years: e.target.value })}
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
                        placeholder="0"
                      />
                    </div>
                  ) : (
                    <input
                      id={`${idPrefix}-years-${index}`}
                      type="number"
                      min="0"
                      value={line.experience_years ?? ''}
                      onChange={(e) => updateLine(line.id, { experience_years: e.target.value })}
                      className={SETTINGS_INPUT}
                    />
                  )}
                </label>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-red-600"
                    aria-label={`Remove trade ${index + 1}`}
                  >
                    <FaTimes className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
                {index === rows.length - 1 && (
                  <button
                    type="button"
                    onClick={addLine}
                    disabled={usedAllTrades}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-lg font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Add another trade"
                    title="Add another trade"
                  >
                    <FaPlus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
