import React from 'react';
import { FaBolt, FaClipboardList, FaDollarSign, FaLock, FaMapMarkedAlt, FaUsers } from 'react-icons/fa';

const cards = [
  {
    icon: FaBolt,
    title: 'Fast Job Posting',
    desc: 'Create and publish short-term skilled trade jobs in minutes.',
  },
  {
    icon: FaMapMarkedAlt,
    title: 'Qualified Local Technicians',
    desc: 'Reach technicians based on trade, location, availability, and job fit.',
  },
  {
    icon: FaUsers,
    title: 'Flexible Staffing',
    desc: 'Bring in short-term help when demand spikes, crews are stretched, or deadlines move.',
  },
  {
    icon: FaClipboardList,
    title: 'Simple Workflow',
    desc: 'Post, claim, message, manage, and close out work in one streamlined platform.',
  },
  {
    icon: FaDollarSign,
    title: 'Clear Job Details',
    desc: 'Set pay, schedule, location, scope, and requirements upfront.',
  },
  {
    icon: FaLock,
    title: 'Secure Payments',
    desc: 'Keep payment and job completion organized through the platform.',
  },
];

export function CompanyBenefitCards() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-tf-blue">Built for contractors. Designed for speed.</p>
        <h2 className="mt-3 text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">
          Why companies choose TechFlash
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition hover:border-gray-200 hover:shadow-md"
            >
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
