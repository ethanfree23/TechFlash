import React from 'react';
import { FaHardHat } from 'react-icons/fa';

export function TechnicianCTA({ onFindWork, onCreateProfile }) {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-tf-navy px-6 py-12 text-white shadow-2xl sm:px-10 sm:py-14 lg:px-12 lg:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(254,103,17,0.15),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_80%,rgba(58,124,165,0.2),transparent_40%)]" />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr] lg:items-center">
          <div className="hidden justify-center lg:flex">
            <div className="flex h-44 w-44 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
              <FaHardHat className="h-16 w-16 text-tf-orange" aria-hidden />
              <p className="mt-4 text-center text-xs font-semibold leading-snug text-gray-300">On-site work, real jobs</p>
            </div>
          </div>
          <div className="min-w-0 text-center lg:text-left">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to find your next job?</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-gray-300 lg:mx-0">
              Create your TechFlash profile and start seeing short-term skilled trade opportunities near you.
            </p>
            <div className="mt-8 flex max-w-md flex-col gap-3 sm:mx-auto sm:max-w-none sm:flex-row lg:mx-0">
              <button
                type="button"
                onClick={onFindWork}
                className="rounded-xl bg-tf-orange px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover"
              >
                Find Work Now
              </button>
              <button
                type="button"
                onClick={onCreateProfile}
                className="rounded-xl border-2 border-white/40 px-8 py-3.5 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"
              >
                Create Your Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
