import React from 'react';
import { FaBolt, FaBuilding, FaClock, FaCog, FaSnowflake, FaTools, FaWrench } from 'react-icons/fa';

const chips = [
  { label: 'Electrical', icon: FaBolt },
  { label: 'HVAC', icon: FaSnowflake },
  { label: 'Plumbing', icon: FaWrench },
  { label: 'Refrigeration', icon: FaCog },
  { label: 'Facility Maintenance', icon: FaBuilding },
  { label: 'General Contracting', icon: FaTools },
];

export function IndustryChips() {
  return (
    <section className="border-y border-gray-100 bg-white/60 px-4 py-10 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl min-w-0">
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {chips.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50/90 px-4 py-2.5 text-sm font-semibold text-tf-navy shadow-sm"
            >
              <Icon className="h-4 w-4 text-tf-orange" aria-hidden />
              {label}
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-center text-base font-semibold text-tf-navy sm:text-lg">
          <FaClock className="h-5 w-5 shrink-0 text-tf-orange" aria-hidden />
          <span>Find short-term technicians in under 6 hours.</span>
        </p>
      </div>
    </section>
  );
}
