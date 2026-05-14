import React from 'react';

const cards = [
  {
    title: 'Companies need help faster than hiring can move.',
    body: 'When a crew is short, a job runs long, or a project needs extra hands, companies do not always need a full-time hire. They need qualified short-term help that can keep work moving.',
  },
  {
    title: 'Technicians need flexible work without chasing it.',
    body: 'Skilled tradespeople should be able to find real opportunities nearby, review the details upfront, and claim work that fits their skills and schedule.',
  },
  {
    title: 'TechFlash brings both sides into one workflow.',
    body: 'Companies post available work. Technicians claim jobs that fit. Both sides manage the job through one organized platform.',
  },
];

export function WhyExistsSection() {
  return (
    <section id="why-exists" className="scroll-mt-24 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">Why TechFlash exists</h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-lg leading-relaxed text-gray-600">
          Traditional hiring is too slow for short-term labor needs. Random job boards are messy. Texting around wastes time.
          Staffing agencies can be expensive and slow. TechFlash gives companies and technicians a cleaner way to connect
          around real work, clear expectations, and faster action.
        </p>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-8 shadow-sm">
              <h3 className="text-lg font-bold text-tf-navy">{c.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
