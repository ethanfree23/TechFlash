import React from 'react';
import { FaClipboardCheck, FaHandshake, FaLayerGroup, FaThLarge } from 'react-icons/fa';

const items = [
  {
    icon: FaLayerGroup,
    title: 'Purpose-built for short-term trade work',
    body: 'TechFlash focuses on skilled labor gaps, not every type of hiring.',
  },
  {
    icon: FaHandshake,
    title: 'Claim-based workflow',
    body: 'Technicians claim jobs they can do, which helps reduce confusion about who is on the job.',
  },
  {
    icon: FaClipboardCheck,
    title: 'Clear expectations up front',
    body: 'Job details are designed to be visible before commitment.',
  },
  {
    icon: FaThLarge,
    title: 'One place to manage the job',
    body: 'Posting, claiming, updates, and completion live in one connected experience.',
  },
];

export function DifferentiatorsSection() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">What makes TechFlash different</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {items.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-8 shadow-md ring-1 ring-gray-100/80"
            >
              <Icon className="h-8 w-8 text-tf-orange" aria-hidden />
              <h3 className="mt-4 text-lg font-bold text-tf-navy">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
