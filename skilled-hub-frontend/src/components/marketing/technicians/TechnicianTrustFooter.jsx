import React from 'react';
import { FaBriefcase, FaHandshake, FaShieldAlt, FaStar } from 'react-icons/fa';

const items = [
  {
    icon: FaHandshake,
    title: 'Trusted by Contractors',
    sub: 'Work with companies that need skilled pros.',
  },
  {
    icon: FaShieldAlt,
    title: 'Secure Payments',
    sub: 'Keep payments organized through the platform.',
  },
  {
    icon: FaBriefcase,
    title: 'Real Opportunities',
    sub: 'Short-term trade jobs near you.',
  },
  {
    icon: FaStar,
    title: 'Build Your Reputation',
    sub: 'Complete jobs and strengthen your profile.',
  },
];

export function TechnicianTrustFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-100/90">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ icon: Icon, title, sub }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-tf-navy" aria-hidden />
              <div>
                <p className="text-sm font-bold text-tf-navy">{title}</p>
                <p className="mt-0.5 text-sm text-gray-600">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
