import React from 'react';
import { FaClock, FaHardHat, FaProjectDiagram, FaStream } from 'react-icons/fa';

const stats = [
  {
    icon: FaClock,
    title: 'Under 6 Hours',
    sub: 'Target fill time',
  },
  {
    icon: FaHardHat,
    title: 'Skilled Trades',
    sub: 'Electrical, HVAC, plumbing, maintenance, and more',
  },
  {
    icon: FaProjectDiagram,
    title: 'Built for Contractors',
    sub: 'Short-term labor without the hiring cycle',
  },
  {
    icon: FaStream,
    title: 'Simple Workflow',
    sub: 'Post, claim, manage, and pay',
  },
];

export function CompanyStatsStrip() {
  return (
    <section className="border-b border-gray-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl min-w-0 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ icon: Icon, title, sub }) => (
          <div key={title} className="flex gap-3 border-gray-100 sm:border-l sm:pl-6 first:sm:border-l-0 first:sm:pl-0">
            <Icon className="mt-0.5 h-6 w-6 shrink-0 text-tf-blue" aria-hidden />
            <div>
              <p className="font-bold text-tf-navy">{title}</p>
              <p className="mt-1 text-sm leading-snug text-gray-600">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
