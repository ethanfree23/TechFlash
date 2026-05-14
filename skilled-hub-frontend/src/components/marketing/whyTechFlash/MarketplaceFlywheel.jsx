import React from 'react';
import { FaArrowRight, FaCheckCircle, FaClipboardList, FaSearch, FaUserPlus } from 'react-icons/fa';

const steps = [
  { icon: FaClipboardList, title: 'Post', sub: 'Companies publish short-term jobs with clear details.' },
  { icon: FaSearch, title: 'Discover', sub: 'Technicians see opportunities that fit trade and area.' },
  { icon: FaUserPlus, title: 'Claim', sub: 'A technician claims the job they can complete.' },
  { icon: FaCheckCircle, title: 'Complete', sub: 'Work is managed through completion in the app.' },
  { icon: FaArrowRight, title: 'Repeat', sub: 'Companies fill gaps; technicians find the next fit.' },
];

export function MarketplaceFlywheel() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">How the marketplace keeps moving</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
          Each step feeds the next: clearer posts lead to better claims, smoother jobs, and faster cycles for both sides.
        </p>
        <div className="mt-12 flex flex-col items-stretch gap-4 lg:flex-row lg:justify-between lg:gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <React.Fragment key={s.title}>
                <div className="flex flex-1 flex-col items-center rounded-2xl border border-gray-100 bg-gray-50/60 p-6 text-center shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tf-orange/15 text-tf-orange">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="mt-3 text-sm font-bold text-tf-navy">{s.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{s.sub}</p>
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden shrink-0 items-center self-center px-1 text-tf-orange lg:flex" aria-hidden>
                    <FaArrowRight className="h-4 w-4" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
