import React from 'react';
import { FaBolt, FaClock, FaLayerGroup, FaListAlt } from 'react-icons/fa';

const cards = [
  {
    icon: FaBolt,
    title: 'Clear upfront details',
    desc: 'Pay, location, timing, scope, and requirements are visible before anyone commits.',
  },
  {
    icon: FaClock,
    title: 'Less back-and-forth',
    desc: 'Companies post the job once and qualified technicians can claim available work.',
  },
  {
    icon: FaLayerGroup,
    title: 'Built for short-term labor',
    desc: 'TechFlash is designed for urgent gaps, temporary coverage, and flexible skilled work.',
  },
  {
    icon: FaListAlt,
    title: 'One organized workflow',
    desc: 'Posting, claiming, managing, completion, and payment stay connected.',
  },
];

export function WhyProcessWorks() {
  return (
    <section className="bg-gray-50/90 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">Why the process works</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {cards.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
              <Icon className="h-8 w-8 text-tf-blue" aria-hidden />
              <h3 className="mt-4 text-lg font-bold text-tf-navy">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
