import React from 'react';

export function WhyTechFlashCTA({ onPostJob, onFindWork }) {
  return (
    <section className="bg-tf-navy px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-4xl min-w-0 text-center text-white">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to use TechFlash?</h2>
        <p className="mt-4 text-lg text-gray-200">Post a short-term job or find work that fits your trade.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
          <button
            type="button"
            onClick={onPostJob}
            className="rounded-xl bg-tf-orange px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover"
          >
            Post a Job
          </button>
          <button
            type="button"
            onClick={onFindWork}
            className="rounded-xl border-2 border-white/50 bg-white/5 px-8 py-3.5 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"
          >
            Find Work
          </button>
        </div>
      </div>
    </section>
  );
}
