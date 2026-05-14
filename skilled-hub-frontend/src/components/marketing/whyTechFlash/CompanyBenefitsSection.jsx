import React from 'react';

const cards = [
  {
    title: 'Fill labor gaps without a long hiring process',
    body: 'When you need help for days or weeks, not months, TechFlash is designed to help you move faster than a full hiring cycle.',
  },
  {
    title: 'Post once with the details technicians need',
    body: 'Trade, pay, location, timing, and scope are organized so technicians can decide quickly if the job fits.',
  },
  {
    title: 'Reduce back-and-forth coordination',
    body: 'Keep communication and job updates in one place instead of scattered calls and texts.',
  },
  {
    title: 'Know who claimed the job',
    body: 'A claim-based workflow helps make it clear who is attached to the work.',
  },
  {
    title: 'Manage work through completion',
    body: 'Track job status and completion steps in a structured workflow.',
  },
  {
    title: 'Built for real field work',
    body: 'TechFlash is designed around short-term trade jobs, not generic office hiring.',
  },
];

export function CompanyBenefitsSection() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">
          For companies: fill labor gaps without the hiring cycle
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="rounded-2xl border border-gray-100 bg-gray-50/40 p-6 shadow-sm">
              <h3 className="font-bold text-tf-navy">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
