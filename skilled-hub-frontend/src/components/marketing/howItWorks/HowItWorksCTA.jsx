import React from 'react';

export function HowItWorksCTA({ onPostJob, onFindWork }) {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-tf-navy px-6 py-14 text-center text-white shadow-2xl sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(254,103,17,0.12),transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(58,124,165,0.2),transparent_45%)]" />
        <div className="relative">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to make short-term trade work simpler?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-300">
            Whether you need skilled help or want flexible work, TechFlash gives both sides a faster way to get the job
            done.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center">
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
              className="rounded-xl border-2 border-white/40 px-8 py-3.5 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"
            >
              Find Work
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
