import React, { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';

const faqs = [
  {
    q: 'How is TechFlash different from a normal job board?',
    a: 'TechFlash is built for short-term skilled trade work. Companies post available jobs, and qualified technicians can claim opportunities that fit their trade, location, and schedule.',
  },
  {
    q: 'Do companies choose from multiple technician matches?',
    a: 'TechFlash is designed around job claiming. A company posts a job, and a qualified technician can claim it. Once claimed, the company can manage the job from the platform.',
  },
  {
    q: 'What details do technicians see before claiming a job?',
    a: 'Technicians should be able to review key details like trade, pay, location, date, start time, duration, scope, and requirements before claiming work.',
  },
  {
    q: 'What happens after a job is claimed?',
    a: 'The job moves into a claimed or active state, and both sides can manage the work through the platform until completion and payment.',
  },
  {
    q: 'Can technicians choose how far they want to travel?',
    a: 'You can set distance and alert preferences in your profile to focus on jobs in your service area.',
  },
];

export function HowItWorksFAQ() {
  const [open, setOpen] = useState(0);

  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-3xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">Common questions</h2>
        <div className="mt-10 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-gray-50/40">
          {faqs.map((item, index) => {
            const isOpen = open === index;
            return (
              <div key={item.q} className="px-4 py-1 sm:px-6">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-bold text-tf-navy">{item.q}</span>
                  <FaChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-500 transition ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {isOpen && <p className="pb-4 text-sm leading-relaxed text-gray-600">{item.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
