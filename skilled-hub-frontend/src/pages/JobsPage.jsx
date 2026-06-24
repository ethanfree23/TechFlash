import React from 'react';
import { useSearchParams } from 'react-router-dom';
import JobsDashboard from '../components/jobs/JobsDashboard';
import AppHeader from '../components/AppHeader';

const JobsPage = ({ user, onLogout }) => {
  const [searchParams] = useSearchParams();
  const showWelcome = searchParams.get('welcome') === '1' && user?.role === 'technician';

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader user={user} onLogout={onLogout} activePage="jobs" emailVariant="welcome" />

      <main className="py-8 lg:py-10">
        {showWelcome && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950 shadow-sm">
              <p className="font-semibold text-lg mb-1">Welcome aboard!</p>
              <p className="text-sm text-emerald-900/90 mb-2">
                Browse open jobs below and claim one that fits your skills.
              </p>
              <p className="text-xs text-emerald-800/80">Tip: use filters on the job list to narrow your search.</p>
            </div>
          </div>
        )}
        <JobsDashboard />
      </main>
    </div>
  );
};

export default JobsPage; 