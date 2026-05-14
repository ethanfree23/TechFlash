import React from 'react';
import { Link } from 'react-router-dom';
import { FaBolt, FaCheckCircle, FaClipboardList, FaMapMarkerAlt, FaPlay, FaShieldAlt, FaUserCheck } from 'react-icons/fa';

function FlowMini() {
  return (
    <div className="relative mx-auto w-full max-w-md space-y-3 lg:max-w-none">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Company</p>
        <p className="mt-1 text-sm font-bold text-white">Post job</p>
        <p className="text-xs text-gray-300">Trade, pay, schedule, location on one form.</p>
      </div>
      <div className="flex justify-center text-tf-orange">
        <span className="text-xs font-bold">↓</span>
      </div>
      <div className="rounded-2xl border border-sky-300/30 bg-sky-900/20 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-sky-200">Available</p>
        <p className="mt-1 text-sm font-bold text-white">Technicians see the job</p>
        <p className="text-xs text-gray-300">Matched by trade, distance, and preferences.</p>
      </div>
      <div className="flex justify-center text-tf-orange">
        <span className="text-xs font-bold">↓</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-tf-orange/40 bg-tf-orange/10 p-4">
          <FaUserCheck className="h-5 w-5 text-tf-orange" aria-hidden />
          <p className="mt-2 text-sm font-bold text-white">Technician claims</p>
          <p className="text-xs text-gray-200">One claim attaches them to the job.</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <FaClipboardList className="h-5 w-5 text-sky-200" aria-hidden />
          <p className="mt-2 text-sm font-bold text-white">Company view</p>
          <p className="text-xs text-gray-300">Manage claimed job through completion.</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-900/20 px-3 py-2 text-xs font-semibold text-emerald-100">
        <FaCheckCircle className="h-4 w-4" aria-hidden />
        Complete &amp; pay in platform
      </div>
    </div>
  );
}

export function WhyTechFlashHero({ onSeeWhyItWorks }) {
  return (
    <section className="relative overflow-hidden bg-tf-navy px-4 pb-16 pt-10 text-white sm:px-6 sm:pb-20 sm:pt-12 lg:px-8 lg:pb-24 lg:pt-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(254,103,17,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_0%_100%,rgba(58,124,165,0.18),transparent)]" />

      <div className="relative mx-auto grid max-w-7xl min-w-0 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-tf-orange">WHY TECHFLASH</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.05rem]">
            The faster way to connect skilled labor with real work.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-gray-200 sm:text-xl">
            TechFlash was built for the moments when companies need reliable help now — and skilled technicians want flexible
            work without chasing leads. One platform connects short-term trade jobs with qualified local pros ready to claim
            them.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { icon: FaBolt, title: 'Faster action', sub: 'Post once. Claim when it fits.' },
              { icon: FaShieldAlt, title: 'Built for trust', sub: 'Clear details and organized work.' },
              { icon: FaMapMarkerAlt, title: 'Local focus', sub: 'Jobs and pros in your area.' },
            ].map(({ icon: Icon, title, sub }) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <Icon className="h-6 w-6 text-tf-orange" aria-hidden />
                <p className="mt-2 text-sm font-bold text-white">{title}</p>
                <p className="mt-1 text-xs text-gray-300">{sub}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/login?tab=signup"
              className="inline-flex items-center justify-center rounded-xl bg-tf-orange px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover"
            >
              Get Started
            </Link>
            <button
              type="button"
              onClick={onSeeWhyItWorks}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/40 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"
            >
              <FaPlay className="h-3 w-3 opacity-90" aria-hidden />
              See Why It Works
            </button>
          </div>
        </div>
        <FlowMini />
      </div>
    </section>
  );
}
