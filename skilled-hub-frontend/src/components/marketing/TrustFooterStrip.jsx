import React from 'react';
import { Link } from 'react-router-dom';
import { FaLock, FaMapMarkedAlt, FaStar, FaUserCheck } from 'react-icons/fa';

const items = [
  {
    icon: FaMapMarkedAlt,
    text: 'Trusted by Contractors Across the U.S.',
  },
  {
    icon: FaUserCheck,
    text: 'Verified Technicians. Quality Work.',
  },
  {
    icon: FaLock,
    text: 'Secure Payments You Can Count On.',
  },
  {
    icon: FaStar,
    text: '5-Star Rated By Our Community.',
  },
];

export function TrustFooterStrip() {
  return (
    <footer className="border-t border-gray-200 bg-gray-100/90">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ icon: Icon, text }) => (
            <div key={text} className="flex gap-3 text-left">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-tf-orange" aria-hidden />
              <p className="text-sm font-semibold leading-snug text-tf-navy">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-gray-200/80 pt-8 text-center text-xs text-gray-500">
          <Link to="/terms-of-service" className="hover:text-tf-blue">
            Terms of Service
          </Link>
          <Link to="/privacy-policy" className="hover:text-tf-blue">
            Privacy Policy
          </Link>
          <Link to="/download" className="hover:text-tf-blue">
            Get the app
          </Link>
        </div>
      </div>
    </footer>
  );
}
