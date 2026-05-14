import React from 'react';
import { FaBalanceScale, FaComments, FaShieldAlt, FaUserCheck } from 'react-icons/fa';

const pillars = [
  {
    icon: FaUserCheck,
    title: 'Claim-based clarity',
    body: 'Jobs can move from posted to claimed in a way that is designed to make it clear who is attached to the work.',
  },
  {
    icon: FaComments,
    title: 'Organized communication',
    body: 'Updates and coordination can live in one workflow instead of scattered messages.',
  },
  {
    icon: FaShieldAlt,
    title: 'Details before commitment',
    body: 'Key job information should be visible before a technician claims, so both sides can align expectations.',
  },
  {
    icon: FaBalanceScale,
    title: 'Fair expectations',
    body: 'The platform is designed to support clear scope, timing, and pay details as part of the job record.',
  },
];

export function TrustSection() {
  return (
    <section className="bg-tf-muted px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">Built for trust on both sides</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
          TechFlash is designed to reduce guesswork by keeping job details visible and workflows organized.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <Icon className="h-7 w-7 text-tf-orange" aria-hidden />
              <h3 className="mt-4 font-bold text-tf-navy">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
