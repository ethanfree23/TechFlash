import React from 'react';
import { FaArrowRight } from 'react-icons/fa';

function CityBackdrop() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-tf-orange/[0.07] sm:h-48"
      viewBox="0 0 1200 200"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M0 200V140l40-8v-20l32-6 8 26 24-4v-18l28-5 12 22 36-8v-24l44-10 16 30 52-12v-28l60-14 20 34 48-10V72l72-16 24 38 56-14v-32l80-18 28 42 64-12v-36l88-20 32 48 76-14v-40l96-22 36 52 84-16v-44l104-24 40 56 92-18V0L1200 200H0z"
      />
    </svg>
  );
}

export function ClosingCtaBanner({ onJoin }) {
  return (
    <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(254,103,17,0.08),transparent)]" />
      <CityBackdrop />
      <div className="relative mx-auto max-w-4xl min-w-0 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-tf-navy sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
          The marketplace for short-term skilled trade work.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          Built for contractors, technicians, and fast-moving field operations.
        </p>
        <button
          type="button"
          onClick={onJoin}
          className="mt-10 inline-flex items-center justify-center gap-2 rounded-xl bg-tf-orange px-8 py-4 text-base font-bold text-white shadow-xl shadow-orange-200/50 transition hover:bg-tf-orange-hover"
        >
          Join TechFlash Today
          <FaArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
