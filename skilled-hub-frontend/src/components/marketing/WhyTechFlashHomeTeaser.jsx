import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';

export function WhyTechFlashHomeTeaser() {
  return (
    <section id="why-techflash" className="scroll-mt-24 border-y border-gray-200 bg-white px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-4xl min-w-0 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-tf-orange">Why TechFlash</p>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-tf-navy sm:text-3xl">
          The faster way to connect skilled labor with real work.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-gray-600">
          Short-term trade jobs, clear details, and a claim-based workflow — built for companies that need help now and
          technicians who want flexible work without the noise.
        </p>
        <Link
          to="/why-techflash"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-tf-navy px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-tf-navy/90"
        >
          Read the full story
          <FaArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
