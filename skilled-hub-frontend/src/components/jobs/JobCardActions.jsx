import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobsAPI } from '../../api/api';
import {
  getAcceptedApplication,
  getClaimedTechnician,
  isJobEditable,
  canTechnicianClaim,
} from '../../utils/jobDisplayUtils';
import ConfirmModal from '../ConfirmModal';

const btnBase = 'inline-flex justify-center items-center rounded-lg text-sm font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none';
const btnPrimary = `${btnBase} bg-blue-600 text-white hover:bg-blue-700 px-3 py-2 font-semibold`;
const btnSecondary = `${btnBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 px-3 py-2`;
const btnSuccess = `${btnBase} bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-2 font-semibold`;
const btnDanger = `${btnBase} bg-red-600 text-white hover:bg-red-700 px-3 py-2 font-semibold`;
const btnCompact = 'inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium transition-colors';

export default function JobCardActions({
  job,
  role,
  compact = false,
  disabled = false,
  claimingJobId,
  onClaim,
  onMessageTech,
  onMessageCompany,
  onCloseJob,
  onRefresh,
  messagingBusy,
}) {
  const navigate = useNavigate();
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  const acceptedApp = getAcceptedApplication(job);
  const claimedTech = getClaimedTechnician(job);
  const techId = acceptedApp?.technician_profile_id ?? claimedTech?.id;

  const handleDuplicate = () => {
    navigate('/jobs/create', { state: { duplicateFrom: job } });
  };

  const handleCloseConfirm = async () => {
    setConfirmClose(false);
    setClosing(true);
    try {
      if (role === 'company' && job.status === 'filled') {
        await jobsAPI.finish(job.id);
      } else if (role === 'admin') {
        await jobsAPI.update(job.id, { status: 'finished' });
      } else if (onCloseJob) {
        await onCloseJob(job);
      }
      onRefresh?.();
    } catch {
      /* parent handles errors */
    } finally {
      setClosing(false);
    }
  };

  const wrapCard = (children) => (
    <div className={`grid grid-cols-2 gap-1.5 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>{children}</div>
  );
  const wrapCompact = (children) => <div className="flex flex-wrap gap-1">{children}</div>;
  const wrap = compact ? wrapCompact : wrapCard;

  const fullWidth = compact ? '' : 'col-span-2';

  if (role === 'admin') {
    return wrap(
      <>
        <Link to={`/jobs/${job.id}`} className={`${compact ? `${btnCompact} bg-blue-600 text-white` : btnPrimary} ${fullWidth}`}>
          View Details
        </Link>
        <Link to={`/jobs/${job.id}/edit`} className={compact ? `${btnCompact} border border-slate-200` : btnSecondary}>
          Edit
        </Link>
        <button type="button" onClick={handleDuplicate} className={compact ? `${btnCompact} border border-slate-200` : btnSecondary}>
          Duplicate
        </button>
        {job.company_profile_id && (
          <Link to={`/companies/${job.company_profile_id}`} className={compact ? `${btnCompact} text-blue-600` : btnSecondary}>
            Company
          </Link>
        )}
        {techId && (
          <>
            <Link to={`/technicians/${techId}`} className={compact ? `${btnCompact} text-blue-600` : btnSecondary}>
              View Tech
            </Link>
            <button
              type="button"
              disabled={messagingBusy}
              onClick={() => onMessageTech?.(job.id, techId)}
              className={compact ? `${btnCompact} border border-slate-200` : btnSecondary}
            >
              Msg Tech
            </button>
          </>
        )}
        {job.company_profile_id && (
          <button
            type="button"
            disabled={messagingBusy}
            onClick={() => onMessageCompany?.(job.id, null)}
            className={`${compact ? btnCompact : btnSecondary} border border-slate-200 ${!techId ? '' : ''}`}
          >
            Msg Company
          </button>
        )}
        {job.status !== 'finished' && (
          <button
            type="button"
            disabled={closing}
            onClick={() => setConfirmClose(true)}
            className={`${compact ? `${btnCompact} text-red-700 border border-red-200` : btnDanger} ${fullWidth}`}
          >
            Close Job
          </button>
        )}
        <ConfirmModal
          isOpen={confirmClose}
          onClose={() => setConfirmClose(false)}
          onConfirm={handleCloseConfirm}
          title="Close this job?"
          message="This will mark the job as finished. This action may affect billing and technician assignments."
          confirmLabel={closing ? 'Closing…' : 'Close Job'}
          variant="destructive"
        />
      </>
    );
  }

  if (role === 'company') {
    return wrap(
      <>
        <Link to={`/jobs/${job.id}`} className={`${compact ? `${btnCompact} bg-blue-600 text-white` : btnPrimary} ${fullWidth}`}>
          View Details
        </Link>
        {isJobEditable(job) && (
          <Link to={`/jobs/${job.id}/edit`} className={compact ? `${btnCompact} border border-slate-200` : btnSecondary}>
            Edit
          </Link>
        )}
        <button type="button" onClick={handleDuplicate} className={compact ? `${btnCompact} border border-slate-200` : btnSecondary}>
          Duplicate
        </button>
        {techId && (
          <>
            <Link to={`/technicians/${techId}`} className={compact ? `${btnCompact} text-blue-600` : btnSecondary}>
              Technician
            </Link>
            <button
              type="button"
              disabled={messagingBusy}
              onClick={() => onMessageTech?.(job.id, techId)}
              className={compact ? `${btnCompact} border border-slate-200` : btnSecondary}
            >
              Message
            </button>
          </>
        )}
        {(job.status === 'filled' || job.status === 'reserved') && job.status !== 'finished' && (
          <button
            type="button"
            disabled={closing}
            onClick={() => setConfirmClose(true)}
            className={`${compact ? `${btnCompact} bg-amber-600 text-white` : `${btnBase} bg-amber-600 text-white hover:bg-amber-700 px-3 py-2 font-semibold`} ${fullWidth}`}
          >
            {job.status === 'filled' ? 'Mark Complete' : 'Close Job'}
          </button>
        )}
        <ConfirmModal
          isOpen={confirmClose}
          onClose={() => setConfirmClose(false)}
          onConfirm={handleCloseConfirm}
          title={job.status === 'filled' ? 'Mark job complete?' : 'Close this job?'}
          message="Confirm you want to update this job's status."
          confirmLabel={closing ? 'Updating…' : 'Confirm'}
        />
      </>
    );
  }

  const canClaim = canTechnicianClaim(job) && !disabled;
  return wrap(
    <>
      <Link to={`/jobs/${job.id}`} className={`${compact ? `${btnCompact} bg-blue-600 text-white` : btnPrimary} ${fullWidth}`}>
        View Details
      </Link>
      {job.company_profile_id && (
        <Link to={`/companies/${job.company_profile_id}`} className={`${compact ? `${btnCompact} border border-slate-200` : btnSecondary} ${fullWidth}`}>
          Company Profile
        </Link>
      )}
      {canClaim && (
        <button
          type="button"
          disabled={claimingJobId === job.id}
          onClick={() => onClaim?.(job.id)}
          className={`${compact ? `${btnCompact} bg-emerald-600 text-white` : btnSuccess} ${fullWidth}`}
        >
          {claimingJobId === job.id ? 'Claiming…' : 'Claim Job'}
        </button>
      )}
    </>
  );
}
