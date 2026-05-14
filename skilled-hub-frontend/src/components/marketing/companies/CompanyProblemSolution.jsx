import React from 'react';
import { FaClipboardList, FaHardHat, FaLayerGroup, FaTools } from 'react-icons/fa';

const problems = [
  {
    icon: FaTools,
    title: 'Labor gaps slowing you down?',
    body: 'Post available work quickly so qualified local technicians can claim jobs and keep projects moving.',
  },
  {
    icon: FaHardHat,
    title: 'Need help without hiring full-time?',
    body: 'Use TechFlash for short-term coverage instead of committing to permanent headcount.',
  },
  {
    icon: FaLayerGroup,
    title: 'Overtime and burnout?',
    body: 'Add extra hands when your team is stretched thin.',
  },
  {
    icon: FaClipboardList,
    title: 'Too many tools to manage?',
    body: 'Keep job posting, technician communication, tracking, and payment in one place.',
  },
];

export function CompanyProblemSolution() {
  return (
    <section className="border-y border-gray-100 bg-gray-50/80 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto grid max-w-7xl min-w-0 gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-tf-blue">Your challenges. Our solution.</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">We help you keep projects moving.</h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            From last-minute callouts to short-term project coverage, TechFlash gives you a faster way to find skilled
            help without starting a long hiring process.
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-tf-navy via-tf-navy-soft to-tf-blue/90 p-8 shadow-lg">
            <div className="flex flex-col items-center text-center text-white">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 ring-2 ring-white/20">
                <FaHardHat className="h-10 w-10 text-tf-orange" aria-hidden />
              </div>
              <p className="mt-5 text-lg font-bold">Field-ready workflow</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-300">
                Post jobs, track open and claimed work, and manage completion in one place — built for crews and
                contractors, not generic gig marketplaces.
              </p>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {problems.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tf-blue/15">
                <Icon className="h-5 w-5 text-tf-blue" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-tf-navy">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
