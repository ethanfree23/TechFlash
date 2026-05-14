import React from 'react';
import { TECHFLASH_LOGO_NAV } from '../../constants/branding';

export function SignupCtaPanel({
  signupEmail,
  onSignupEmailChange,
  onSubmitEmail,
  onContinueAsCompany,
  onContinueAsTechnician,
  submittingLead,
  leadError,
}) {
  return (
    <section id="signup" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-tf-navy px-6 py-12 shadow-2xl sm:px-10 sm:py-14 lg:px-14 lg:py-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-tf-orange/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-tf-blue/20 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr] lg:items-center lg:gap-12">
          <div className="hidden justify-center lg:flex">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-white/5 blur-xl" />
              <img src={TECHFLASH_LOGO_NAV} alt="" className="relative h-36 w-36 object-contain opacity-95" />
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Ready to get started?</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-300 sm:text-lg">
              Whether you need skilled help fast or want flexible work opportunities, TechFlash makes it simple.
            </p>

            <form onSubmit={onSubmitEmail} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <label className="sr-only" htmlFor="marketing-signup-email">
                Email
              </label>
              <input
                id="marketing-signup-email"
                type="email"
                required
                value={signupEmail}
                onChange={(e) => onSignupEmailChange(e.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                className="min-h-[48px] w-full min-w-0 flex-1 rounded-xl border border-white/10 bg-white px-4 py-3 text-sm text-tf-navy shadow-inner placeholder:text-gray-400 focus:border-tf-orange focus:outline-none focus:ring-2 focus:ring-tf-orange/40"
              />
              <button
                type="submit"
                disabled={submittingLead}
                className="min-h-[48px] shrink-0 rounded-xl bg-tf-orange px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover disabled:opacity-50 sm:px-8"
              >
                {submittingLead ? 'Submitting…' : 'Create Your Account'}
              </button>
            </form>
            {leadError && <p className="mt-3 text-sm text-red-300">{leadError}</p>}

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-white/15" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-tf-navy px-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  or continue as
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onContinueAsCompany}
                className="flex-1 rounded-xl border-2 border-white/25 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:border-white/40 hover:bg-white/10"
              >
                I&apos;m a Company
              </button>
              <button
                type="button"
                onClick={onContinueAsTechnician}
                className="flex-1 rounded-xl border-2 border-white/25 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:border-white/40 hover:bg-white/10"
              >
                I&apos;m a Technician
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
