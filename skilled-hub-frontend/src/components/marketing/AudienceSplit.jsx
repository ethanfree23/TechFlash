import React from 'react';
import { Link } from 'react-router-dom';
import { FaBuilding, FaHardHat } from 'react-icons/fa';

const companyBullets = [
  'Fill urgent labor gaps without a long hiring cycle',
  'Access skilled local technicians when demand spikes',
  'Reduce downtime, missed deadlines, and overworked crews',
  'Manage short-term labor in one streamlined platform',
];

const techBullets = [
  'Pick up flexible work that fits your schedule',
  'Find real local opportunities in your trade',
  'Review pay, distance, and job details before accepting',
  'Earn extra income and build your reputation over time',
];

export function AudienceSplit() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl min-w-0 gap-6 lg:grid-cols-2 lg:gap-8">
        <div
          id="for-companies"
          className="scroll-mt-24 rounded-2xl border border-tf-blue/20 bg-gradient-to-br from-sky-50/90 to-white p-8 shadow-sm sm:p-10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-tf-blue/15">
              <FaBuilding className="h-6 w-6 text-tf-blue" aria-hidden />
            </div>
            <h2 className="text-2xl font-extrabold text-tf-navy">For Companies</h2>
          </div>
          <ul className="mt-6 space-y-4">
            {companyBullets.map((text) => (
              <li key={text} className="flex gap-3 text-gray-700">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tf-blue text-[10px] font-bold text-white">
                  ✓
                </span>
                <span className="leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <Link to="/for-companies" className="text-sm font-bold text-tf-blue hover:underline">
              Company overview →
            </Link>
          </p>
        </div>

        <div
          id="for-technicians"
          className="scroll-mt-24 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/90 to-white p-8 shadow-sm sm:p-10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
              <FaHardHat className="h-6 w-6 text-tf-orange" aria-hidden />
            </div>
            <h2 className="text-2xl font-extrabold text-tf-navy">For Technicians</h2>
          </div>
          <ul className="mt-6 space-y-4">
            {techBullets.map((text) => (
              <li key={text} className="flex gap-3 text-gray-700">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tf-orange text-[10px] font-bold text-white">
                  ✓
                </span>
                <span className="leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <Link to="/for-technicians" className="text-sm font-bold text-tf-orange hover:underline">
              Technician overview →
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
