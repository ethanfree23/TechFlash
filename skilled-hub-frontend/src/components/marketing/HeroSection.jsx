import React from 'react';
import { FaArrowRight } from 'react-icons/fa';
import { HeroProductMockup } from './HeroProductMockup';

export function HeroSection({ onPostJob, onFindWork }) {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-12 lg:px-8 lg:pb-24 lg:pt-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_70%_-10%,rgba(254,103,17,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_10%_20%,rgba(58,124,165,0.08),transparent)]" />

      <div className="relative mx-auto grid max-w-7xl min-w-0 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="min-w-0 max-w-xl lg:max-w-none">
          <p className="text-sm font-bold uppercase tracking-wide text-tf-orange">Short-term skilled labor, on demand</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight text-tf-navy sm:text-5xl lg:text-[3.25rem] xl:text-5xl">
            Hire trusted technicians fast. Find trade work on your terms.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-gray-600 sm:text-xl">
            TechFlash connects contractors and skilled technicians for fast, flexible short-term work across electrical,
            HVAC, plumbing, refrigeration, maintenance, and more.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={onPostJob}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-tf-orange px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200/40 transition hover:bg-tf-orange-hover"
            >
              Post a Job
              <FaArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onFindWork}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-tf-orange bg-white px-6 py-3.5 text-sm font-bold text-tf-orange transition hover:bg-orange-50"
            >
              Find Work
              <FaArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="min-w-0 pt-4 lg:pt-0">
          <HeroProductMockup />
        </div>
      </div>
    </section>
  );
}
