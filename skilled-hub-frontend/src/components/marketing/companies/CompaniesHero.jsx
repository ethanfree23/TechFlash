import React from 'react';
import { FaPlay } from 'react-icons/fa';
import { CompaniesHeroProductPreview } from './CompaniesHeroProductPreview';

export function CompaniesHero({ onPostJob, onSeeHowItWorks }) {
  return (
    <section className="relative overflow-hidden bg-tf-navy px-4 pb-16 pt-10 text-white sm:px-6 sm:pb-20 sm:pt-12 lg:px-8 lg:pb-24 lg:pt-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(254,103,17,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_0%_100%,rgba(58,124,165,0.15),transparent)]" />

      <div className="relative mx-auto grid max-w-7xl min-w-0 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="min-w-0 max-w-xl lg:max-w-none">
          <span className="inline-block rounded-full bg-sky-400/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-100 ring-1 ring-sky-300/30">
            For companies
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.25rem]">
            Skilled labor when you need it most.
          </h1>
          <p className="mt-4 text-xl font-bold text-tf-orange sm:text-2xl">Fast. Reliable. Local.</p>
          <p className="mt-5 text-base leading-relaxed text-gray-300 sm:text-lg">
            TechFlash helps contractors and businesses find trusted, on-demand technicians for short-term skilled trade
            work, so your projects stay on schedule and your crews keep moving.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-gray-200 sm:text-base">
            {[
              'Post jobs in minutes',
              'Let qualified local technicians claim available work',
              'Manage job details, communication, and payment in one place',
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tf-blue text-[10px] font-bold text-white">
                  ✓
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={onPostJob}
              className="inline-flex items-center justify-center rounded-xl bg-tf-orange px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover"
            >
              Post a Job
            </button>
            <button
              type="button"
              onClick={onSeeHowItWorks}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/40 bg-transparent px-6 py-3.5 text-sm font-bold text-white transition hover:border-white hover:bg-white/5"
            >
              <FaPlay className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
              See How It Works
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <CompaniesHeroProductPreview />
        </div>
      </div>
    </section>
  );
}
