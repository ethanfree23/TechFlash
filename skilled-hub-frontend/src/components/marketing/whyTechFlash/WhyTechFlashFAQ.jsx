import React, { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';

const faqs = [
  {
    q: 'Is TechFlash a staffing agency?',
    a: 'No. TechFlash is a software platform that connects companies and technicians around short-term trade jobs. It is not a traditional staffing agency.',
  },
  {
    q: 'What trades does TechFlash support?',
    a: 'Available job categories depend on what is configured in the app for your market. Companies post within supported trades, and technicians see work aligned with their profile.',
  },
  {
    q: 'How do companies find technicians?',
    a: 'Companies post jobs with clear details. Qualified technicians in the area can discover those jobs and claim work that fits their skills and schedule.',
  },
  {
    q: 'Do companies pick from a list of matched technicians?',
    a: 'TechFlash is not designed as a multi-match selection tool. The workflow centers on posting a job and a qualified technician claiming it.',
  },
  {
    q: 'Can technicians see job details before claiming?',
    a: 'Yes. Technicians should review key details like trade, pay, location, timing, and scope before they choose to claim a job.',
  },
  {
    q: 'What happens after a job is claimed?',
    a: 'The job moves into an active workflow so both sides can coordinate, update status, and work toward completion and payment in the platform.',
  },
];

export function WhyTechFlashFAQ() {
  const [open, setOpen] = useState(0);

  return (
    <section className="bg-tf-muted px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-3xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">Common questions</h2>
        <div className="mt-10 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
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
