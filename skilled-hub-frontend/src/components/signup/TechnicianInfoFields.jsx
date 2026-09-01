import React, { useCallback } from 'react';
import { FaEnvelope, FaMapMarkerAlt, FaPhone, FaUser } from 'react-icons/fa';
import { US_STATES } from '../../data/statesByCountry';
import TechnicianTradeLines from '../TechnicianTradeLines';
import { makeTradeLine, payloadFromTradeLines } from '../../utils/tradeQualifications';

const inputWrap =
  'mt-1 flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm focus-within:border-[#3A7CA5] focus-within:ring-1 focus-within:ring-[#3A7CA5]';

export function TechnicianInfoFields({ registerData, setRegisterData, idPrefix, emailReadOnly }) {
  const set = useCallback((patch) => setRegisterData((prev) => ({ ...prev, ...patch })), [setRegisterData]);
  const tradeLines =
    Array.isArray(registerData.trade_lines) && registerData.trade_lines.length
      ? registerData.trade_lines
      : [makeTradeLine({ trade_type: registerData.trade_type, skill_class: registerData.skill_class })];

  const setTradeLines = (next) => {
    const payload = payloadFromTradeLines(next);
    setRegisterData((prev) => ({
      ...prev,
      trade_lines: next,
      trade_type: payload.trade_type,
      skill_class: payload.skill_class,
      experience_years: payload.experience_years,
      specialties: payload.specialties.filter((trade) => trade !== payload.trade_type),
      trade_qualifications: payload.trade_qualifications,
    }));
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-base font-bold text-tf-navy">Personal Information</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            First name
            <div className={inputWrap}>
              <FaUser className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-first-name`}
                type="text"
                value={registerData.first_name}
                onChange={(e) => set({ first_name: e.target.value })}
                placeholder="John"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Last name
            <div className={inputWrap}>
              <FaUser className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-last-name`}
                type="text"
                value={registerData.last_name}
                onChange={(e) => set({ last_name: e.target.value })}
                placeholder="Doe"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Email address
            <div className={`${inputWrap} ${emailReadOnly ? 'bg-gray-50' : ''}`}>
              <FaEnvelope className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-email`}
                type="email"
                value={registerData.email}
                onChange={(e) => !emailReadOnly && set({ email: e.target.value })}
                readOnly={emailReadOnly}
                disabled={emailReadOnly}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-700 outline-none ring-0 disabled:cursor-not-allowed"
              />
            </div>
            {emailReadOnly && <p className="mt-1 text-xs text-gray-500">This email was captured from your signup request.</p>}
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Phone number
            <div className={inputWrap}>
              <FaPhone className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-phone`}
                type="tel"
                value={registerData.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Street address (optional)
            <div className={inputWrap}>
              <FaMapMarkerAlt className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-address`}
                type="text"
                value={registerData.address}
                onChange={(e) => set({ address: e.target.value })}
                placeholder="e.g. 123 Main St"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Optional. Add later for more accurate job distance on the map.</p>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            State
            <select
              id={`${idPrefix}-state`}
              value={registerData.state}
              onChange={(e) => set({ state: e.target.value })}
              className={`${inputWrap} cursor-pointer`}
            >
              <option value="">Select state</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            ZIP code
            <div className={inputWrap}>
              <input
                id={`${idPrefix}-zip`}
                type="text"
                value={registerData.zip_code}
                onChange={(e) => set({ zip_code: e.target.value })}
                placeholder="ZIP"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            City
            <div className={inputWrap}>
              <FaMapMarkerAlt className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-city`}
                type="text"
                value={registerData.city}
                onChange={(e) => set({ city: e.target.value })}
                placeholder="City (e.g. Dallas)"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
        </div>
      </section>
      <section>
        <h3 className="text-base font-bold text-tf-navy">Trades</h3>
        <p className="mt-1 text-sm text-gray-500">Add each trade you perform. Use + for another line.</p>
        <div className="mt-4">
          <TechnicianTradeLines
            lines={tradeLines}
            onChange={setTradeLines}
            variant="signup"
            idPrefix={`${idPrefix}-trade`}
          />
        </div>
      </section>
    </div>
  );
}
