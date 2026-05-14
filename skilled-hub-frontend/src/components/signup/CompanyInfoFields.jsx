import React from 'react';
import { FaEnvelope, FaMapMarkerAlt, FaPhone, FaUser } from 'react-icons/fa';
import { US_STATES } from '../../data/statesByCountry';
import { TRADE_OPTIONS } from '../../constants/trades';
import { requiresElectricalLicenseForState } from '../../utils/licensingRules';

const inputWrap =
  'mt-1 flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm focus-within:border-[#3A7CA5] focus-within:ring-1 focus-within:ring-[#3A7CA5]';

const HIRING_OPTIONS = [
  'Short-term labor coverage',
  'Extra help for active jobs',
  'Emergency callout coverage',
  'Seasonal demand',
  'Project-based work',
  'Long-term hiring support',
  'Other',
];

export function CompanyInfoFields({ registerData, setRegisterData, idPrefix, emailReadOnly }) {
  const set = (patch) => setRegisterData((prev) => ({ ...prev, ...patch }));
  const needLicense = requiresElectricalLicenseForState(registerData.state);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-base font-bold text-tf-navy">Personal Information</h3>
        <p className="mt-1 text-xs text-gray-500">Primary contact for this company account.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Contact full name
            <div className={inputWrap}>
              <FaUser className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-full-name`}
                type="text"
                value={registerData.full_name}
                onChange={(e) => set({ full_name: e.target.value })}
                placeholder="Jane Smith"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
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
        </div>
      </section>
      <section>
        <h3 className="text-base font-bold text-tf-navy">Company Details</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Company name
            <div className={inputWrap}>
              <input
                id={`${idPrefix}-company-name`}
                type="text"
                value={registerData.company_name}
                onChange={(e) => set({ company_name: e.target.value })}
                placeholder="Acme Services LLC"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Company type / Trade focus
            <select
              id={`${idPrefix}-industry`}
              value={registerData.industry}
              onChange={(e) => set({ industry: e.target.value })}
              className={`${inputWrap} cursor-pointer`}
            >
              <option value="">Select focus</option>
              {TRADE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Primary hiring need
            <select
              id={`${idPrefix}-hiring`}
              value={registerData.primary_hiring_need}
              onChange={(e) => set({ primary_hiring_need: e.target.value })}
              className={`${inputWrap} cursor-pointer`}
            >
              <option value="">Select one</option>
              {HIRING_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Company location / Service area
            <div className={inputWrap}>
              <FaMapMarkerAlt className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-city`}
                type="text"
                value={registerData.city}
                onChange={(e) => set({ city: e.target.value })}
                placeholder="City"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
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
          {needLicense && (
            <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
              Electrical license number
              <div className={inputWrap}>
                <input
                  id={`${idPrefix}-elicense`}
                  type="text"
                  value={registerData.electrical_license_number}
                  onChange={(e) => set({ electrical_license_number: e.target.value })}
                  placeholder="TECL / required license"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
                />
              </div>
            </label>
          )}
        </div>
      </section>
    </div>
  );
}
