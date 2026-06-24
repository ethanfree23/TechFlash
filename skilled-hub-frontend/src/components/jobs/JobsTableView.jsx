import React from 'react';
import { Link } from 'react-router-dom';
import JobStatusBadge from './JobStatusBadge';
import JobCardActions from './JobCardActions';
import { getJobDisplayStatus } from '../../utils/jobStatus';
import {
  formatJobLocation,
  formatJobPay,
  formatJobStart,
  getClaimedTechnicianName,
} from '../../utils/jobDisplayUtils';

const ROW_BG = {
  open: 'hover:bg-blue-50/40',
  expired: 'hover:bg-slate-50 bg-slate-50/30',
  claimed: 'hover:bg-amber-50/40',
  active: 'hover:bg-emerald-50/40',
  completed: 'hover:bg-emerald-50/30',
  default: 'hover:bg-slate-50/80',
};

export default function JobsTableView({
  jobs,
  role,
  claimingJobId,
  onClaim,
  onMessageTech,
  onMessageCompany,
  onRefresh,
  messagingBusy,
}) {
  const showClaimedByCol = role === 'admin' || role === 'company';

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50/90 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Job</th>
              {role === 'admin' && (
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Company</th>
              )}
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Trade</th>
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Location</th>
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Start</th>
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Pay</th>
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
              {showClaimedByCol && (
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Claimed By</th>
              )}
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Created</th>
              <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => {
              const display = getJobDisplayStatus(job);
              const rowClass = ROW_BG[display.key] || ROW_BG.default;
              return (
                <tr key={job.id} className={`transition-colors ${rowClass}`}>
                  <td className="px-3 py-3 max-w-[12rem]">
                    <Link
                      to={`/jobs/${job.id}`}
                      className="font-semibold text-slate-900 hover:text-blue-600 line-clamp-2 text-[13px] leading-snug"
                    >
                      {job.title}
                    </Link>
                  </td>
                  {role === 'admin' && (
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap text-xs">
                      {job.company_profile_id ? (
                        <Link to={`/companies/${job.company_profile_id}`} className="text-blue-600 hover:underline">
                          {job.company_profile?.company_name || '—'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap text-xs">{job.skill_class || '—'}</td>
                  <td className="px-3 py-3 text-slate-600 max-w-[10rem] truncate text-xs">{formatJobLocation(job) || '—'}</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap text-xs">{formatJobStart(job) || '—'}</td>
                  <td className="px-3 py-3 text-slate-900 font-semibold whitespace-nowrap text-xs">{formatJobPay(job) || '—'}</td>
                  <td className="px-3 py-3">
                    <JobStatusBadge job={job} layout="inline" />
                  </td>
                  {showClaimedByCol && (
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap text-xs">
                      {getClaimedTechnicianName(job) || '—'}
                    </td>
                  )}
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap text-xs">
                    {job.created_at
                      ? new Date(job.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-3 py-3 min-w-[12rem]">
                    <JobCardActions
                      job={job}
                      role={role}
                      compact
                      claimingJobId={claimingJobId}
                      onClaim={onClaim}
                      onMessageTech={onMessageTech}
                      onMessageCompany={onMessageCompany}
                      onRefresh={onRefresh}
                      messagingBusy={messagingBusy}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
