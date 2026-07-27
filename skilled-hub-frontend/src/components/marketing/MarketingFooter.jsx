import React from 'react';
import { Link } from 'react-router-dom';
import { FaBolt, FaCheckCircle, FaShieldAlt, FaUsers } from 'react-icons/fa';

const FOOTER_VARIANTS = {
  default: [
    {
      icon: FaBolt,
      title: 'Fast Response',
      copy: 'Get matched quickly with verified local technicians.',
    },
    {
      icon: FaShieldAlt,
      title: 'Built on Trust',
      copy: 'Identity, references, and safety checks are central.',
    },
    {
      icon: FaUsers,
      title: 'Marketplace Reach',
      copy: 'Connect companies and technicians in one workflow.',
    },
    {
      icon: FaCheckCircle,
      title: 'Clear Outcomes',
      copy: 'Track jobs, feedback, and performance with confidence.',
    },
  ],
  companies: [
    {
      icon: FaBolt,
      title: 'Hire Faster',
      copy: 'Post urgent jobs and fill them with qualified techs.',
    },
    {
      icon: FaShieldAlt,
      title: 'Reduce Risk',
      copy: 'Use verification signals before assigning work.',
    },
    {
      icon: FaUsers,
      title: 'Build Your Bench',
      copy: 'Keep a repeat-ready network of trusted technicians.',
    },
    {
      icon: FaCheckCircle,
      title: 'Run Leaner',
      copy: 'Keep dispatch, updates, and follow-through in one place.',
    },
  ],
  technicians: [
    {
      icon: FaBolt,
      title: 'Find Work Faster',
      copy: 'Discover nearby jobs that match your trade and tier.',
    },
    {
      icon: FaShieldAlt,
      title: 'Get Verified',
      copy: 'Show trust signals companies look for before hiring.',
    },
    {
      icon: FaUsers,
      title: 'Grow Reputation',
      copy: 'Build social proof with reviews and repeat customers.',
    },
    {
      icon: FaCheckCircle,
      title: 'Stay In Control',
      copy: 'Manage availability, profile, and active jobs in one app.',
    },
  ],
};

export default function MarketingFooter({ variant = 'default' }) {
  const year = new Date().getFullYear();
  const trustItems = FOOTER_VARIANTS[variant] || FOOTER_VARIANTS.default;

  return (
    <footer className="border-t border-gray-200 bg-gray-100/90">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {trustItems.map(({ icon: Icon, title, copy }) => (
            <div key={title} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm">
              <Icon className="mb-2 h-5 w-5 text-tf-orange" aria-hidden />
              <p className="text-sm font-semibold text-tf-navy">{title}</p>
              <p className="mt-1 text-xs text-gray-600">{copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gray-600">
          <Link to="/for-companies" className="hover:text-[#3A7CA5]">
            For Companies
          </Link>
          <Link to="/for-technicians" className="hover:text-[#3A7CA5]">
            For Technicians
          </Link>
          <Link to="/how-it-works" className="hover:text-[#3A7CA5]">
            How It Works
          </Link>
          <Link to="/why-techflash" className="hover:text-[#3A7CA5]">
            Why TechFlash
          </Link>
          <Link to="/download" className="hover:text-[#3A7CA5]">
            Get the App
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <Link to="/terms-of-service" className="hover:text-[#3A7CA5]">
            Terms
          </Link>
          <Link to="/privacy-policy" className="hover:text-[#3A7CA5]">
            Privacy
          </Link>
          <Link to="/cookie-policy" className="hover:text-[#3A7CA5]">
            Cookies
          </Link>
          <span>{`© ${year} TechFlash`}</span>
        </div>
      </div>
    </footer>
  );
}
