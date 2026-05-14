import React from 'react';
import { FaCheck } from 'react-icons/fa';

const rows = [
  { old: 'Slow hiring cycles for short-term needs', tf: 'Built for short-term labor gaps' },
  { old: 'Vague postings and unclear pay', tf: 'Clear job details before anyone commits' },
  { old: 'Back-and-forth calls and texts', tf: 'One organized workflow in the app' },
  { old: 'Hard to know who is actually available', tf: 'Technicians claim jobs they can do' },
  { old: 'Messy coordination and follow-ups', tf: 'Structured job management through completion' },
];

export function OldWayVsTechFlashSection() {
  return (
    <section className="bg-tf-muted px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">The old way vs TechFlash</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
          TechFlash is not trying to replace every hiring path. It is built for the moments when speed, clarity, and
          flexibility matter most.
        </p>
        <div className="mt-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="grid border-b border-gray-200 bg-gray-50 text-sm font-bold text-tf-navy sm:grid-cols-2">
            <div className="border-b border-gray-200 px-5 py-4 sm:border-b-0 sm:border-r">Traditional way</div>
            <div className="hidden px-5 py-4 sm:block">TechFlash way</div>
          </div>
          {rows.map((r) => (
            <div key={r.old} className="grid border-b border-gray-100 last:border-b-0 sm:grid-cols-2">
              <div className="border-b border-gray-100 px-5 py-4 text-sm text-gray-600 sm:border-b-0 sm:border-r sm:border-gray-100">
                <span className="font-semibold text-gray-500 sm:hidden">Traditional: </span>
                {r.old}
              </div>
              <div className="flex items-start gap-3 px-5 py-4 text-sm text-gray-800">
                <FaCheck className="mt-0.5 h-4 w-4 shrink-0 text-tf-orange" aria-hidden />
                <span>
                  <span className="font-semibold text-gray-500 sm:hidden">TechFlash: </span>
                  {r.tf}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
