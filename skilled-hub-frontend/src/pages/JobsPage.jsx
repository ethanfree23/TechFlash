import React from 'react';
import { Link } from 'react-router-dom';
import { TECHFLASH_LOGO_NAV } from '../constants/branding';
import JobList from '../components/JobList';

const JobsPage = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="flex items-center">
              <img src={TECHFLASH_LOGO_NAV} alt="TechFlash" className="h-9 object-contain" />
            </Link>
            <nav className="flex items-center gap-4">
              <Link to="/dashboard" className="px-3 py-2 font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md">
                Dashboard
              </Link>
              <Link to="/jobs" className="px-3 py-2 font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md">
                Jobs
              </Link>
              <Link to="/messages" className="px-3 py-2 font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md">
                Messages
              </Link>
              <Link to="/settings" className="px-3 py-2 font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              Welcome, <span className="font-medium">{user?.email}</span>
              <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full capitalize">
                {user?.role}
              </span>
            </span>
            <button
              onClick={onLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="py-8">
        <JobList />
      </main>
    </div>
  );
};

export default JobsPage; 