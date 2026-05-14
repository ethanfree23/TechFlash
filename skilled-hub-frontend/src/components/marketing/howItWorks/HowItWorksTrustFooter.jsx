import React from 'react';
import { FaBriefcase, FaClipboardList, FaHandshake, FaWrench } from 'react-icons/fa';

const items = [
  {
    icon: FaBriefcase,
    title: 'Built for Short-Term Skilled Work',
    sub: 'Post or pick up trade jobs without a long hiring cycle.',
  },
  {
    icon: FaClipboardList,
    title: 'Clear Job Details',
    sub: 'See pay, timing, location, and scope before you commit.',
  },
  {
    icon: FaHandshake,
    title: 'Technician Job Claiming',
    sub: 'One qualified technician claims the job and is attached to the work.',
  },
  {
    icon: FaWrench,
    title: 'Organized Job Management',
    sub: 'Keep status, communication, and completion in one workflow.',
  },
];

export function HowItWorksTrustFooter() {
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
