import React from 'react';
import { FaBell, FaBolt, FaCheckCircle, FaPaperPlane } from 'react-icons/fa';

const cards = [
  {
    icon: FaPaperPlane,
    title: 'Post',
    sub: 'Companies publish short-term trade jobs with clear details.',
  },
  {
    icon: FaBell,
    title: 'Alert',
    sub: 'Qualified local technicians see jobs that fit their preferences.',
  },
  {
    icon: FaBolt,
    title: 'Claim',
    sub: 'A technician claims the job and is attached to the work.',
  },
  {
    icon: FaCheckCircle,
    title: 'Complete',
    sub: 'Both sides manage completion, payment, and reputation.',
  },
];

export function ProcessSummaryStrip() {
  return (
    <section className="border-b border-gray-200 bg-white px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl min-w-0 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ icon: Icon, title, sub }) => (
          <div key={title} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 shadow-sm">
            <Icon className="h-7 w-7 text-tf-orange" aria-hidden />
            <p className="mt-3 text-lg font-bold text-tf-navy">{title}</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
