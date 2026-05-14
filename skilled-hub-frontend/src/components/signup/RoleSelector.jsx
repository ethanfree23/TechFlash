import React from 'react';
import { FaBuilding, FaUser } from 'react-icons/fa';

export function RoleSelector({ role, onChange }) {
  const base =
    'flex flex-1 cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition sm:flex-row sm:text-left';
  const tech = role === 'technician';
  const comp = role === 'company';
  return (
    <div>
      <p className="text-sm font-semibold text-tf-navy">What best describes you?</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        <button
          type="button"
          onClick={() => onChange('technician')}
          className={`${base} ${
            tech ? 'border-[#3A7CA5] bg-sky-50/50 ring-1 ring-[#3A7CA5]/20' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <FaUser className={`h-8 w-8 ${tech ? 'text-[#3A7CA5]' : 'text-gray-400'}`} aria-hidden />
          <div>
            <p className={`text-base font-bold ${tech ? 'text-[#3A7CA5]' : 'text-gray-900'}`}>I’m a Technician</p>
            <p className="mt-1 text-xs text-gray-600">Find flexible work that fits your trade.</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange('company')}
          className={`${base} ${
            comp ? 'border-[#3A7CA5] bg-sky-50/50 ring-1 ring-[#3A7CA5]/20' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <FaBuilding className={`h-8 w-8 ${comp ? 'text-[#3A7CA5]' : 'text-gray-400'}`} aria-hidden />
          <div>
            <p className={`text-base font-bold ${comp ? 'text-[#3A7CA5]' : 'text-gray-900'}`}>I’m a Company</p>
            <p className="mt-1 text-xs text-gray-600">Post jobs and fill skilled labor gaps.</p>
          </div>
        </button>
      </div>
    </div>
  );
}
