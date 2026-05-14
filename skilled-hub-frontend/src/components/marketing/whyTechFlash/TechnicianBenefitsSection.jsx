import React from 'react';

const cards = [
  {
    title: 'See real jobs with real details',
    body: 'Review pay, location, timing, and scope before you commit.',
  },
  {
    title: 'Claim work that fits your skills',
    body: 'Choose jobs aligned with your trade and availability.',
  },
  {
    title: 'Flexible short-term opportunities',
    body: 'Built for gigs, fill-in work, and project-based needs.',
  },
  {
    title: 'Less chasing, more doing',
    body: 'Spend less time hunting leads and more time on paid work.',
  },
  {
    title: 'Organized job communication',
    body: 'Keep updates and coordination in one workflow.',
  },
  {
    title: 'A path from claim to completion',
    body: 'Manage the job through clear steps instead of guesswork.',
  },
];

export function TechnicianBenefitsSection() {
  return (
    <section className="bg-tf-muted px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">
          For technicians: find flexible work that fits
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold text-tf-navy">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
