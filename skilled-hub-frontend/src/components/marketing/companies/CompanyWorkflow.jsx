import React from 'react';
import { FaBuilding } from 'react-icons/fa';

const steps = [
  {
    title: 'Create your company account',
    desc: 'Add your business profile, service area, contact details, and payment setup.',
  },
  {
    title: 'Post the job',
    desc: 'Enter the trade, location, date, start time, hourly rate, job length, scope, and any requirements.',
  },
  {
    title: 'Technicians are notified',
    desc: 'Qualified local technicians can view available work based on their trade, distance, preferences, and availability.',
  },
  {
    title: 'A technician claims the job',
    desc: 'Once a technician claims the job, the company can review the job details and claimed technician information.',
  },
  {
    title: 'Manage the work',
    desc: 'Track status, communicate as needed, confirm completion, and keep the job organized.',
  },
  {
    title: 'Close out and pay',
    desc: 'Confirm the work, handle payment, and build a reliable record for future jobs.',
  },
];

function StepConnector() {
  return (
    <li className="hidden h-0 shrink-0 self-start pt-[1.375rem] lg:block lg:w-4 xl:w-6" aria-hidden>
      <div className="h-0 border-t-2 border-dashed border-tf-blue/30" />
    </li>
  );
}

export function CompanyWorkflow() {
  return (
    <section id="company-workflow" className="scroll-mt-24 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tf-blue/15">
            <FaBuilding className="h-5 w-5 text-tf-blue" aria-hidden />
          </div>
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">How TechFlash works for companies</h2>
            <p className="mt-2 max-w-3xl text-lg text-gray-600">
              Post a job, let the right technician claim it, and manage the work from one place.
            </p>
          </div>
        </div>

        <ol className="mt-12 flex flex-col gap-6 lg:mt-14 lg:flex-row lg:items-start lg:gap-0">
          {steps.map((step, index) => (
            <React.Fragment key={step.title}>
              <li className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50/50 p-5 shadow-sm lg:flex-1 lg:min-w-0 lg:flex-col lg:items-center lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:text-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tf-navy text-sm font-bold text-white">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-tf-navy">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{step.desc}</p>
                </div>
              </li>
              {index < steps.length - 1 && (
                <>
                  <li className="flex justify-center lg:hidden" aria-hidden>
                    <div className="h-6 w-0 border-l-2 border-dashed border-tf-blue/30" />
                  </li>
                  <StepConnector />
                </>
              )}
            </React.Fragment>
          ))}
        </ol>
      </div>
    </section>
  );
}
