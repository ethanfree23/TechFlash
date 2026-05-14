import React from 'react';
import { FaBell, FaDollarSign, FaMapMarkerAlt, FaStar } from 'react-icons/fa';

const items = [
  {
    icon: FaBell,
    title: 'Jobs That Fit',
    sub: 'Get alerts for jobs that match your trade, skills, and location.',
  },
  {
    icon: FaMapMarkerAlt,
    title: 'Work Close to Home',
    sub: 'Find jobs near you and choose work that fits your schedule.',
  },
  {
    icon: FaDollarSign,
    title: 'Get Paid Securely',
    sub: 'Reliable payment handling so you can focus on the work.',
  },
  {
    icon: FaStar,
    title: 'Build Your Reputation',
    sub: 'Great work leads to stronger ratings and more opportunities.',
  },
];

export function TechnicianValueStrip() {
  return (
    <section className="border-b border-gray-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl min-w-0 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, sub }) => (
          <div key={title} className="flex gap-3">
            <Icon className="mt-0.5 h-6 w-6 shrink-0 text-tf-orange" aria-hidden />
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
