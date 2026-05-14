import React from 'react';
import { FaBell, FaClipboardList, FaMapMarkedAlt, FaShieldAlt, FaUserCheck, FaWrench } from 'react-icons/fa';

const cards = [
  {
    icon: FaBell,
    title: 'Job Alerts',
    desc: 'Turn on alerts and get notified when new jobs match your preferences.',
  },
  {
    icon: FaMapMarkedAlt,
    title: 'Local Opportunities',
    desc: 'Find short-term jobs in your area with less travel and more control.',
  },
  {
    icon: FaClipboardList,
    title: 'Flexible Schedule',
    desc: 'Pick the jobs you want and work when it fits your life.',
  },
  {
    icon: FaWrench,
    title: 'Clear Pay',
    desc: 'Review the rate, timing, location, and scope before accepting.',
  },
  {
    icon: FaShieldAlt,
    title: 'Trusted Platform',
    desc: 'Work with companies using a platform built for skilled trades.',
  },
  {
    icon: FaUserCheck,
    title: 'Grow Your Profile',
    desc: 'Build your reputation over time with completed jobs and strong ratings.',
  },
];

export function TechnicianBenefitCards() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-tf-orange">Built for skilled pros.</p>
        <h2 className="mt-3 text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">
          Why technicians choose TechFlash
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition hover:border-gray-200 hover:shadow-md"
            >
              <Icon className="h-8 w-8 text-tf-orange" aria-hidden />
              <h3 className="mt-4 text-lg font-bold text-tf-navy">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
