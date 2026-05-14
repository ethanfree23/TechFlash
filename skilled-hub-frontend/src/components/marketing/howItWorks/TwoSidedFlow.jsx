import React from 'react';
import { FaBuilding, FaHardHat } from 'react-icons/fa';

const companySteps = [
  { title: 'Create your company account', body: 'Set up your business profile and payment information.' },
  { title: 'Post available work', body: 'Add job details including trade, pay, time, location, and scope.' },
  {
    title: 'Wait for a qualified tech to claim it',
    body: 'Qualified local technicians can view the job and claim it if it fits.',
  },
  { title: 'Manage the claimed job', body: 'Track the job, communicate as needed, confirm completion, and handle payment.' },
];

const techSteps = [
  { title: 'Create your profile', body: 'Add your trade, experience, certifications, service area, and availability.' },
  { title: 'Set your preferences', body: 'Choose distance, trade types, alert settings, schedule, and pay expectations.' },
  { title: 'Review available jobs', body: 'See jobs that match your qualifications, location, and preferences.' },
  {
    title: 'Claim the job and get to work',
    body: 'Accept the opportunity, complete the job, and get paid securely.',
  },
];

export function TwoSidedFlow({ onPostJob, onFindWork }) {
  return (
    <section className="border-y border-gray-100 bg-gray-50/80 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto grid max-w-7xl min-w-0 gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-tf-blue/20 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-tf-blue/15">
              <FaBuilding className="h-6 w-6 text-tf-blue" aria-hidden />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-tf-navy">For Companies</h2>
              <p className="mt-1 text-sm font-medium text-gray-600">Fill labor gaps without the long hiring cycle.</p>
            </div>
          </div>
          <ol className="mt-8 space-y-5">
            {companySteps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tf-navy text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold text-tf-navy">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={onPostJob}
            className="mt-8 w-full rounded-xl bg-tf-orange py-3 text-sm font-bold text-white shadow-md transition hover:bg-tf-orange-hover sm:w-auto sm:px-8"
          >
            Post a Job
          </button>
        </div>

        <div className="rounded-2xl border border-orange-100 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
              <FaHardHat className="h-6 w-6 text-tf-orange" aria-hidden />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-tf-navy">For Technicians</h2>
              <p className="mt-1 text-sm font-medium text-gray-600">Find short-term trade work that fits your schedule.</p>
            </div>
          </div>
          <ol className="mt-8 space-y-5">
            {techSteps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tf-orange text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold text-tf-navy">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={onFindWork}
            className="mt-8 w-full rounded-xl border-2 border-tf-orange bg-white py-3 text-sm font-bold text-tf-orange transition hover:bg-orange-50 sm:w-auto sm:px-8"
          >
            Find Work
          </button>
        </div>
      </div>
    </section>
  );
}
