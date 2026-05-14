import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight, FaBuilding, FaHardHat } from 'react-icons/fa';

export function HowItWorksHomeTeaser() {
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-gradient-to-b from-gray-50/80 to-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-5xl min-w-0 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl">How it works</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          Companies post short-term trade jobs. Qualified technicians see what fits, claim a job, and both sides
          manage the work through TechFlash—no picking from long &ldquo;match lists.&rdquo;
        </p>
        <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:justify-center">
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm">
            <FaBuilding className="h-8 w-8 shrink-0 text-tf-blue" aria-hidden />
            <div>
              <p className="font-bold text-tf-navy">Companies</p>
              <p className="text-sm text-gray-600">Post, then manage the claimed job to completion.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm">
            <FaHardHat className="h-8 w-8 shrink-0 text-tf-orange" aria-hidden />
            <div>
              <p className="font-bold text-tf-navy">Technicians</p>
              <p className="text-sm text-gray-600">Set preferences, claim work, get paid.</p>
            </div>
          </div>
        </div>
        <Link
          to="/how-it-works"
          className="mt-10 inline-flex items-center gap-2 text-base font-bold text-tf-orange hover:underline"
        >
          See full how it works
          <FaArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
