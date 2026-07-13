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
  const needLicense = requiresElectricalLicenseForState(registerData.business_state || registerData.state);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-base font-bold text-tf-navy">Personal Information</h3>
        <p className="mt-1 text-xs text-gray-500">Primary contact for this company account.</p>
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
                placeholder="Jane"
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
                placeholder="Smith"
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
            Business street address
            <div className={inputWrap}>
              <FaMapMarkerAlt className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-business-address`}
                type="text"
                value={registerData.business_address || ''}
                onChange={(e) => set({ business_address: e.target.value })}
                placeholder="123 Main St"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">This address is used as your base service area.</p>
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Business city
            <div className={inputWrap}>
              <FaMapMarkerAlt className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-business-city`}
                type="text"
                value={registerData.business_city || ''}
                onChange={(e) => set({ business_city: e.target.value })}
                placeholder="City"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            State
            <select
              id={`${idPrefix}-business-state`}
              value={registerData.business_state || ''}
              onChange={(e) => set({ business_state: e.target.value })}
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
                id={`${idPrefix}-business-zip`}
                type="text"
                value={registerData.business_zip_code || ''}
                onChange={(e) => set({ business_zip_code: e.target.value })}
                placeholder="ZIP"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Business phone
            <div className={inputWrap}>
              <FaPhone className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-business-phone`}
                type="tel"
                value={registerData.business_phone || ''}
                onChange={(e) => set({ business_phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Business email
            <div className={inputWrap}>
              <FaEnvelope className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-business-email`}
                type="email"
                value={registerData.business_email || ''}
                onChange={(e) => set({ business_email: e.target.value })}
                placeholder="office@company.com"
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
