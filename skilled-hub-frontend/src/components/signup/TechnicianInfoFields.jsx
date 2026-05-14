import React, { useCallback, useState } from 'react';
import { FaEnvelope, FaMapMarkerAlt, FaPhone, FaTimes, FaUser, FaWrench } from 'react-icons/fa';
import { US_STATES } from '../../data/statesByCountry';
import { TRADE_OPTIONS } from '../../constants/trades';

const inputWrap =
  'mt-1 flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm focus-within:border-[#3A7CA5] focus-within:ring-1 focus-within:ring-[#3A7CA5]';

const SPECIALTY_SUGGESTIONS = [
  'Heating',
  'Air Conditioning',
  'Ductwork',
  'Commercial',
  'Residential',
  'Diagnostics',
  'Install',
  'Service calls',
];

export function TechnicianInfoFields({ registerData, setRegisterData, idPrefix, emailReadOnly }) {
  const [specialtyDraft, setSpecialtyDraft] = useState('');

  const set = useCallback((patch) => setRegisterData((prev) => ({ ...prev, ...patch })), [setRegisterData]);

  const addSpecialty = (raw) => {
    const t = raw.trim();
    if (!t) return;
    setRegisterData((prev) => {
      const cur = Array.isArray(prev.specialties) ? prev.specialties : [];
      if (cur.includes(t)) return prev;
      return { ...prev, specialties: [...cur, t] };
    });
    setSpecialtyDraft('');
  };

  const removeSpecialty = (t) => {
    setRegisterData((prev) => ({
      ...prev,
      specialties: (Array.isArray(prev.specialties) ? prev.specialties : []).filter((s) => s !== t),
    }));
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-base font-bold text-tf-navy">Personal Information</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Full name
            <div className={inputWrap}>
              <FaUser className="h-4 w-4 text-gray-400" aria-hidden />
              <input
                id={`${idPrefix}-full-name`}
                type="text"
                value={registerData.full_name}
                onChange={(e) => set({ full_name: e.target.value })}
                placeholder="John Doe"
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
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Location / Service area
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
            Street address (optional)
            <div className={inputWrap}>
              <input
                id={`${idPrefix}-address`}
                type="text"
                value={registerData.address}
                onChange={(e) => set({ address: e.target.value })}
                placeholder="123 Main St"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              />
            </div>
          </label>
        </div>
      </section>
      <section>
        <h3 className="text-base font-bold text-tf-navy">Trade &amp; Specialty</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Primary trade
            <div className={inputWrap}>
              <FaWrench className="h-4 w-4 text-gray-400" aria-hidden />
              <select
                id={`${idPrefix}-trade`}
                value={registerData.trade_type}
                onChange={(e) => set({ trade_type: e.target.value })}
                className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm text-gray-900 outline-none ring-0"
              >
                <option value="">Select trade</option>
                {TRADE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-gray-700">Specialties (optional)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Array.isArray(registerData.specialties) ? registerData.specialties : []).map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900"
                >
                  {s}
                  <button type="button" onClick={() => removeSpecialty(s)} className="rounded p-0.5 hover:bg-sky-200" aria-label={`Remove ${s}`}>
                    <FaTimes className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select
                value={specialtyDraft}
                onChange={(e) => setSpecialtyDraft(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">Add suggested specialty…</option>
                {SPECIALTY_SUGGESTIONS.filter((s) => !(registerData.specialties || []).includes(s)).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => specialtyDraft && addSpecialty(specialtyDraft)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-tf-navy hover:bg-gray-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
