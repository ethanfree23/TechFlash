import React from 'react';
import { Link } from 'react-router-dom';
import {
  FaBookmark,
  FaCalendarAlt,
  FaClock,
  FaDollarSign,
  FaMapMarkerAlt,
  FaStar,
  FaUsers,
} from 'react-icons/fa';
import JobStatusBadge from './JobStatusBadge';
import JobCardActions from './JobCardActions';
import { getCardSurfaceClasses } from '../../utils/jobStatus';
import {
  formatCertifications,
  formatJobDuration,
  formatJobLocation,
  formatJobPay,
  formatJobStart,
  getApplicationCount,
  getJobDistance,
  getTechnicianUnavailableReason,
  isJobClaimedByTechnician,
  matchesSavedSearch,
} from '../../utils/jobDisplayUtils';
import { formatExperienceShort } from '../../constants/experienceSelect';

function MetaRow({ icon: Icon, children, highlight }) {
  return (
    <div className={`flex items-start gap-2 text-xs ${highlight ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
      <Icon className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" aria-hidden />
      <span className="min-w-0 leading-snug">{children}</span>
    </div>
  );
}

export default function JobCard({
  job,
  role,
  technicianProfile,
  savedSearches = [],
  savedJobIds = [],
  claimingJobId,
  onClaim,
  onMessageTech,
  onMessageCompany,
  onSaveJob,
  onRefresh,
  messagingBusy,
}) {
  const pay = formatJobPay(job);
  const duration = formatJobDuration(job);
  const start = formatJobStart(job);
  const location = formatJobLocation(job);
  const certs = formatCertifications(job);
  const distance = role === 'technician' ? getJobDistance(job, technicianProfile) : null;
  const appCount = getApplicationCount(job);
  const unavailableReason = role === 'technician' ? getTechnicianUnavailableReason(job, technicianProfile) : null;
  const claimedByMe = role === 'technician' && isJobClaimedByTechnician(job, technicianProfile);
  const matchesSaved = role === 'technician' && savedSearches.some((s) => matchesSavedSearch(job, s, technicianProfile));
  const isBookmarked = savedJobIds.includes(job.id);
  const isUnavailable = role === 'technician' && unavailableReason && !claimedByMe;
  const surfaceClasses = getCardSurfaceClasses(job);

  return (
    <article
      className={`group flex h-full min-h-[22rem] flex-col rounded-xl border border-slate-200/90 shadow-sm transition-all hover:shadow-md hover:border-slate-300/90 ${surfaceClasses} ${
        isUnavailable ? 'opacity-[0.92]' : ''
      }`}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100/80">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 pr-1">
            <h3 className="text-[15px] font-semibold text-slate-900 line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors">
              {job.title}
            </h3>
            {(role === 'admin' || role === 'technician') && job.company_profile?.company_name && (
              <Link
                to={`/companies/${job.company_profile_id}`}
                className="mt-1 block text-[11px] font-medium text-slate-500 hover:text-blue-600 truncate transition-colors"
              >
                {job.company_profile.company_name}
              </Link>
            )}
            {role === 'company' && job.skill_class && (
              <p className="mt-1 text-[11px] font-medium text-slate-500 truncate">{job.skill_class}</p>
            )}
          </div>
          <JobStatusBadge job={job} layout="stack" />
        </div>

        {(matchesSaved || isBookmarked) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {matchesSaved && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-200/70 px-1.5 py-0.5 rounded">
                <FaBookmark className="h-2.5 w-2.5" />
                Saved search
              </span>
            )}
            {isBookmarked && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-blue-800 bg-blue-50 border border-blue-200/70 px-1.5 py-0.5 rounded">
                <FaBookmark className="h-2.5 w-2.5" />
                Saved
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body — flex-1 with consistent min height for equal card alignment */}
      <div className="flex flex-1 flex-col px-4 py-3 min-h-[9.5rem]">
        <p className="text-sm text-slate-600 line-clamp-2 min-h-[2.5rem] mb-3">
          {job.description || '\u00A0'}
        </p>

        <div className="flex flex-wrap gap-1 mb-3 min-h-[1.25rem]">
          {job.skill_class && role !== 'company' && (
            <span className="inline-flex rounded-md bg-slate-100/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {job.skill_class}
            </span>
          )}
          {job.minimum_years_experience != null && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              <FaStar className="h-2 w-2 text-amber-500" />
              {formatExperienceShort(job.minimum_years_experience)} yrs
            </span>
          )}
          {certs && (
            <span className="inline-flex max-w-full rounded-md bg-orange-50/80 border border-orange-100/80 px-2 py-0.5 text-[10px] font-medium text-orange-900 truncate">
              {certs}
            </span>
          )}
        </div>

        <div className="space-y-1.5 flex-1">
          {pay && <MetaRow icon={FaDollarSign} highlight>{pay}</MetaRow>}
          {start && (
            <MetaRow icon={FaCalendarAlt}>
              <span className="text-slate-500">Starts </span>
              {start}
            </MetaRow>
          )}
          {duration && <MetaRow icon={FaClock}>{duration}</MetaRow>}
          {location && (
            <MetaRow icon={FaMapMarkerAlt}>
              {location}
              {distance != null && <span className="text-slate-400"> · {distance.toFixed(1)} mi</span>}
            </MetaRow>
          )}
          {appCount > 0 && (role === 'admin' || role === 'company') && (
            <MetaRow icon={FaUsers}>
              {appCount} application{appCount !== 1 ? 's' : ''}
            </MetaRow>
          )}
        </div>

        {job.notes && (
          <div className="mt-3 rounded-lg bg-slate-50/80 border border-slate-100 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Notes</p>
            <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{job.notes}</p>
          </div>
        )}

        {claimedByMe && (
          <div className="mt-3 rounded-lg bg-emerald-50/90 border border-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
            Claimed by you
          </div>
        )}

        {isUnavailable && (
          <div className="mt-3 rounded-lg bg-slate-100/80 border border-slate-200/80 px-2.5 py-1.5 text-[11px] text-slate-600 leading-snug">
            {unavailableReason}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-slate-100 bg-slate-50/40 px-4 py-3 space-y-2 rounded-b-xl">
        <JobCardActions
          job={job}
          role={role}
          disabled={isUnavailable}
          claimingJobId={claimingJobId}
          onClaim={onClaim}
          onMessageTech={onMessageTech}
          onMessageCompany={onMessageCompany}
          onRefresh={onRefresh}
          messagingBusy={messagingBusy}
        />
        {role === 'technician' && onSaveJob && !isUnavailable && (
          <button
            type="button"
            onClick={() => onSaveJob(job.id)}
            className={`w-full rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              isBookmarked
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200/80 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600'
            }`}
            title="Saved locally — backend sync coming soon"
          >
            {isBookmarked ? 'Saved to bookmarks' : 'Save job'}
          </button>
        )}
      </div>
    </article>
  );
}
