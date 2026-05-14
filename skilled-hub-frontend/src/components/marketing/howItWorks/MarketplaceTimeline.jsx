import React from 'react';

const steps = [
  {
    title: 'Company posts a job',
    desc: 'The company adds the trade, location, date, start time, hourly rate, expected duration, job scope, and requirements.',
    side: 'company',
  },
  {
    title: 'Job is shown to qualified technicians',
    desc: 'Technicians who match the trade, distance, preferences, and availability can view or receive the opportunity.',
    side: 'company',
  },
  {
    title: 'Technician reviews the details',
    desc: 'The technician checks the pay, location, timing, scope, and requirements before deciding whether the job fits.',
    side: 'technician',
  },
  {
    title: 'Technician claims the job',
    desc: 'Once the technician claims the job, they are attached to that job and the company can see the claimed technician information.',
    side: 'technician',
  },
  {
    title: 'The work gets done',
    desc: 'The technician completes the job while both sides can keep details, communication, and status organized in the platform.',
    side: 'shared',
  },
  {
    title: 'Completion and payment',
    desc: 'The job is confirmed, payment is handled, and both sides build a stronger record for future work.',
    side: 'shared',
  },
];

function StepConnector({ useOrange }) {
  return (
    <li className="hidden h-0 shrink-0 self-start pt-[1.375rem] lg:block lg:w-3 xl:w-6" aria-hidden>
      <div className={`h-0 border-t-2 border-dashed ${useOrange ? 'border-tf-orange/35' : 'border-tf-blue/35'}`} />
    </li>
  );
}

function circleClassForStep(side) {
  if (side === 'technician') return 'bg-tf-orange text-white';
  if (side === 'shared') return 'bg-tf-blue text-white';
  return 'bg-tf-navy text-white';
}

export function MarketplaceTimeline() {
  return (
    <section id="marketplace-timeline" className="scroll-mt-24 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0 text-center lg:text-left">
        <h2 className="text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">How the marketplace works</h2>
        <p className="mx-auto mt-3 max-w-3xl text-lg text-gray-600 lg:mx-0">
          One simple process connecting companies that need help with technicians ready to work.
        </p>

        <ol className="mt-12 flex flex-col gap-6 text-left lg:mt-14 lg:flex-row lg:items-start lg:gap-0">
          {steps.map((step, index) => {
            const next = steps[index + 1];
            return (
              <React.Fragment key={step.title}>
                <li className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-5 shadow-sm lg:flex-1 lg:min-w-0 lg:flex-col lg:items-center lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:text-center">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${circleClassForStep(step.side)}`}
                  >
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
                      <div
                        className={`h-6 w-0 border-l-2 border-dashed ${
                          step.side === 'technician' || (next && next.side === 'technician')
                            ? 'border-tf-orange/35'
                            : 'border-tf-blue/35'
                        }`}
                      />
                    </li>
                    <StepConnector
                      useOrange={step.side === 'technician' || (next && next.side === 'technician')}
                    />
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
