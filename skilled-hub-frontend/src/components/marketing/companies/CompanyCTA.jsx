import React from 'react';
import { TECHFLASH_SALES_HREF } from '../../../constants/branding';

function CraneBackdrop() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 text-sky-300/25"
      viewBox="0 0 800 320"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        d="M520 260V120l60-20M580 100v160M460 180h140M620 200l40-80M120 260V80l40 20M160 100v160M80 200h120M40 220l30-100"
      />
      <path
        fill="currentColor"
        d="M60 270 L760 270 L740 290 L80 290 Z"
        opacity="0.2"
      />
    </svg>
  );
}

export function CompanyCTA({ onPostJobNow }) {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-tf-navy px-6 py-14 text-center shadow-2xl sm:px-12 sm:py-16">
        <CraneBackdrop />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(58,124,165,0.2),transparent_50%)]" />
        <div className="relative">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Ready to fill your next job?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-300">
            Post short-term skilled trade work and give qualified local technicians a faster way to claim it.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onPostJobNow}
              className="rounded-xl bg-tf-orange px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover"
            >
              Post a Job Now
            </button>
            <a
              href={TECHFLASH_SALES_HREF}
              className="rounded-xl border-2 border-white/35 px-8 py-3.5 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"
            >
              Talk to Sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
