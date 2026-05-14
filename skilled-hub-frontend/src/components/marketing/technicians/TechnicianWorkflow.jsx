import React from 'react';
import { FaBell, FaClipboardCheck, FaIdCard, FaSearch, FaWrench } from 'react-icons/fa';

const steps = [
  {
    title: 'Create your profile',
    desc: 'Add your trade, experience, certifications, service area, and availability.',
    icon: FaIdCard,
  },
  {
    title: 'Set your preferences',
    desc: 'Choose your trade types, distance, schedule, alert settings, and pay expectations.',
    icon: FaWrench,
  },
  {
    title: 'Get job alerts',
    desc: 'We notify you when available jobs match your skills, location, and availability.',
    icon: FaBell,
  },
  {
    title: 'Claim the job',
    desc: 'Review the scope, rate, location, date, and timing, then claim the job that works for you.',
    icon: FaSearch,
  },
  {
    title: 'Do the work. Get paid.',
    desc: 'Complete the job, confirm the work, get paid securely, and build your reputation.',
    icon: FaClipboardCheck,
  },
];

function StepConnector() {
  return (
    <li className="hidden h-0 shrink-0 self-start pt-[1.75rem] lg:block lg:w-3 xl:w-5" aria-hidden>
      <div className="h-0 border-t-2 border-dashed border-tf-orange/35" />
    </li>
  );
}

export function TechnicianWorkflow() {
  return (
    <section id="technician-workflow" className="scroll-mt-24 bg-gray-50/80 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">How TechFlash works for technicians</h2>
        <p className="mt-3 max-w-2xl text-lg text-gray-600">Simple steps to find work, claim jobs, and get paid.</p>

        <ol className="mt-12 flex flex-col gap-6 lg:mt-14 lg:flex-row lg:items-start lg:gap-0">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={step.title}>
                <li className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:flex-1 lg:min-w-0 lg:flex-col lg:items-center lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:text-center">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tf-orange text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <Icon className="hidden h-5 w-5 text-tf-orange lg:block" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-bold text-tf-navy">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">{step.desc}</p>
                  </div>
                </li>
                {index < steps.length - 1 && (
                  <>
                    <li className="flex justify-center lg:hidden" aria-hidden>
                      <div className="h-6 w-0 border-l-2 border-dashed border-tf-orange/35" />
                    </li>
                    <StepConnector />
                  </>
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
