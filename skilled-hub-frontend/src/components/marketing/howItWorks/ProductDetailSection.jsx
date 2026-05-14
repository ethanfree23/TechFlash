import React from 'react';

export function ProductDetailSection() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl min-w-0">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">
          What each side can manage
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
          Core areas you&apos;ll use in the app today—wording stays general where screens vary by account type.
        </p>
        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-8 shadow-sm">
            <h3 className="text-lg font-bold text-tf-navy">Company side</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-gray-700">
              <li>Job posting details (trade, pay, schedule, location, scope)</li>
              <li>Job statuses such as open, claimed, in progress, and completed</li>
              <li>Information about the technician who claimed the job</li>
              <li>Messaging with the other party when you use Messages</li>
              <li>Completion confirmation and payment flow tied to the job</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-8 shadow-sm">
            <h3 className="text-lg font-bold text-tf-navy">Technician side</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-gray-700">
              <li>Profile and trade details</li>
              <li>Job preferences and notification settings (including distance)</li>
              <li>Available jobs that fit your filters</li>
              <li>Claimed jobs and job detail views</li>
              <li>Work history and payment-related status as shown in your account</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
