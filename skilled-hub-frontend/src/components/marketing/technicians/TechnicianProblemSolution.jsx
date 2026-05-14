import React from 'react';
import { FaBell, FaCalendarAlt, FaHandshake, FaThumbsUp } from 'react-icons/fa';

const cards = [
  {
    icon: FaBell,
    title: 'Want extra work this week?',
    body: 'Get notified when short-term jobs match your trade and location.',
  },
  {
    icon: FaCalendarAlt,
    title: 'Need flexibility?',
    body: 'Pick jobs that fit around your schedule instead of locking into long-term work.',
  },
  {
    icon: FaThumbsUp,
    title: 'Tired of bad job details?',
    body: 'Review pay, location, timing, and scope before you claim the job.',
  },
  {
    icon: FaHandshake,
    title: 'Want to build repeat opportunities?',
    body: 'Complete good work, build your profile, and become easier for companies to trust.',
  },
];

export function TechnicianProblemSolution() {
  return (
    <section className="border-y border-gray-100 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">Work without chasing leads.</h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-gray-600">
          TechFlash gives skilled technicians a simpler way to find short-term trade work without cold calling companies,
          searching random job boards, or committing to full-time roles.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {cards.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tf-orange/15">
                <Icon className="h-5 w-5 text-tf-orange" aria-hidden />
              </div>
              <h3 className="mt-4 text-lg font-bold text-tf-navy">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
