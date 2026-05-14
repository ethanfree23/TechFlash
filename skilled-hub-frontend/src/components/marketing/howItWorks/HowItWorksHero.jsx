import React from 'react';
import { Link } from 'react-router-dom';
import {
  FaBolt,
  FaCheckCircle,
  FaClipboardList,
  FaPaperPlane,
  FaPlay,
  FaUserCheck,
} from 'react-icons/fa';

const processSteps = [
  { label: 'Post', icon: FaPaperPlane, tone: 'navy' },
  { label: 'Available', icon: FaClipboardList, tone: 'navy' },
  { label: 'Claim', icon: FaUserCheck, tone: 'orange' },
  { label: 'Manage', icon: FaBolt, tone: 'orange' },
  { label: 'Complete', icon: FaCheckCircle, tone: 'navy' },
];

export function HowItWorksHero({ onSeeProcess }) {
  return (
    <section className="relative overflow-hidden bg-tf-navy px-4 pb-16 pt-10 text-white sm:px-6 sm:pb-20 sm:pt-12 lg:px-8 lg:pb-24 lg:pt-14">
      <div
        className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.04\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-90"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-tf-orange/10" />

      <div className="relative mx-auto grid max-w-7xl min-w-0 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-tf-orange">HOW TECHFLASH WORKS</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.1rem]">
            Post the job. Claim the work. Keep projects moving.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-gray-200 sm:text-xl">
            TechFlash gives companies and skilled technicians a simple way to connect for short-term trade work. Companies
            post available jobs, qualified technicians claim the right opportunities, and both sides manage the work from
            one streamlined platform.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              to="/login?tab=signup"
              className="inline-flex items-center justify-center rounded-xl bg-tf-orange px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover"
            >
              Get Started
            </Link>
            <button
              type="button"
              onClick={onSeeProcess}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/40 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"
            >
              <FaPlay className="h-3 w-3 opacity-90" aria-hidden />
              See the Process
            </button>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-sm sm:p-8">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-gray-300">At a glance</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:gap-0">
            {processSteps.map((step, index) => {
              const Icon = step.icon;
              const isOrange = step.tone === 'orange';
              return (
                <React.Fragment key={step.label}>
                  <div className="flex w-[45%] max-w-[6.5rem] flex-col items-center sm:w-auto sm:max-w-none sm:flex-1">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl border sm:h-16 sm:w-16 ${
                        isOrange
                          ? 'border-tf-orange/50 bg-tf-orange/20 text-tf-orange'
                          : 'border-white/20 bg-white/10 text-sky-200'
                      }`}
                    >
                      <Icon className="h-6 w-6" aria-hidden />
                    </div>
                    <p className="mt-2 text-center text-xs font-bold text-white sm:text-sm">{step.label}</p>
                  </div>
                  {index < processSteps.length - 1 && (
                    <div
                      className="hidden h-0 w-6 shrink-0 self-start border-t-2 border-dashed border-white/25 pt-7 sm:block sm:w-4 lg:w-8"
                      aria-hidden
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <p className="mx-auto mt-6 max-w-md text-center text-sm leading-relaxed text-gray-300">
            One technician claims each job—no bidding against long lists of &ldquo;matches.&rdquo; You manage the work in
            one place through completion and payment.
          </p>
        </div>
      </div>
    </section>
  );
}
