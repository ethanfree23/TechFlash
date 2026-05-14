import React from 'react';
import { FaPlay } from 'react-icons/fa';
import { TechniciansHeroProductPreview } from './TechniciansHeroProductPreview';

export function TechniciansHero({ onFindWork, onSeeHowItWorks }) {
  return (
    <section className="relative overflow-hidden bg-tf-navy px-4 pb-16 pt-10 text-white sm:px-6 sm:pb-20 sm:pt-12 lg:px-8 lg:pb-24 lg:pt-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_0%_0%,rgba(254,103,17,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_100%_100%,rgba(58,124,165,0.18),transparent)]" />

      <div className="relative mx-auto grid max-w-7xl min-w-0 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="min-w-0 max-w-xl lg:max-w-none">
          <span className="inline-block rounded-full bg-tf-orange/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-orange-100 ring-1 ring-tf-orange/40">
            For technicians
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.15rem]">
            Find trade work that fits your{' '}
            <span className="text-tf-orange">skills</span> and your <span className="text-tf-orange">schedule</span>.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-gray-200 sm:text-lg">
            TechFlash connects skilled technicians with short-term jobs from contractors and companies in your area.
            You choose the work that fits your trade, location, availability, and pay expectations.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-gray-100 sm:text-base">
            {[
              'Get alerted to jobs that match your trade and location',
              'Claim jobs and start working on your terms',
              'Get paid securely and build your reputation',
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tf-orange text-[10px] font-bold text-white">
                  ✓
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={onFindWork}
              className="inline-flex items-center justify-center rounded-xl bg-tf-orange px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover"
            >
              Find Work Now
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
          <TechniciansHeroProductPreview />
        </div>
      </div>
    </section>
  );
}
