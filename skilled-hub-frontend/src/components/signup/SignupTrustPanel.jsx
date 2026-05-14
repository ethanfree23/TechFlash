import React from 'react';
import { Link } from 'react-router-dom';
import { FaShieldAlt } from 'react-icons/fa';

const COPY = {
  email: {
    badge: 'STEP 1 OF 4',
    title: 'Create your password',
    body: 'Your email is already on file from the previous step. Choose a secure password to protect your TechFlash account.',
    trustTitle: 'Your information is safe with us.',
    trustBody: (
      <>
        We never share your data. Read our{' '}
        <Link to="/privacy-policy" className="font-semibold text-[#3A7CA5] hover:underline">
          Privacy Policy
        </Link>{' '}
        to learn more.
      </>
    ),
  },
  profile: {
    badge: 'STEP 2 OF 4',
    title: 'Tell us about yourself',
    body: 'We’ll use this information to personalize your experience and connect you with the right opportunities.',
    trustTitle: 'Your information is safe with us.',
    trustBody: (
      <>
        We never share your data. Read our{' '}
        <Link to="/privacy-policy" className="font-semibold text-[#3A7CA5] hover:underline">
          Privacy Policy
        </Link>{' '}
        to learn more.
      </>
    ),
  },
  membership: {
    badge: 'STEP 3 OF 4',
    title: 'Choose your membership',
    body: 'Select the plan that fits your needs. You can upgrade or change your plan later.',
    trustTitle: 'You’re in good hands.',
    trustBody: 'We use secure, industry-standard encryption to keep your data and payments safe.',
  },
  review: {
    badge: 'STEP 4 OF 4',
    title: 'Review & complete',
    body: 'Double-check your information and membership details before you finish.',
    trustTitle: 'You’re in good hands.',
    trustBody: 'We use secure, industry-standard encryption to keep your data and payments safe.',
  },
};

export function SignupTrustPanel({ variant = 'profile' }) {
  const c = COPY[variant] || COPY.profile;
  return (
    <div className="flex h-full flex-col border-b border-gray-100 pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
      <span className="inline-flex w-fit rounded-lg bg-orange-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-tf-orange">
        {c.badge}
      </span>
      <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-tf-navy lg:text-3xl">{c.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-gray-600 lg:text-base">{c.body}</p>
      <div className="mt-8 flex gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
        <FaShieldAlt className="mt-0.5 h-8 w-8 shrink-0 text-tf-orange" aria-hidden />
        <div>
          <p className="font-bold text-tf-navy">{c.trustTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{c.trustBody}</p>
        </div>
      </div>
      {(variant === 'membership' || variant === 'review') && (
        <ul className="mt-8 space-y-4 text-sm text-gray-700">
          <li>
            <p className="font-bold text-tf-navy">Flexible plans</p>
            <p className="text-xs text-gray-600">Change or cancel anytime.</p>
          </li>
          <li>
            <p className="font-bold text-tf-navy">Built for trades</p>
            <p className="text-xs text-gray-600">Designed for real work in the field.</p>
          </li>
          <li>
            <p className="font-bold text-tf-navy">Secure billing</p>
            <p className="text-xs text-gray-600">Safe payments with industry-standard protection.</p>
          </li>
        </ul>
      )}
    </div>
  );
}
