import React from 'react';
import {
  FaPhone,
  FaEnvelope,
  FaGlobe,
  FaStickyNote,
  FaLink,
  FaPencilAlt,
  FaObjectGroup,
  FaTrash,
  FaBriefcase,
} from 'react-icons/fa';
import { CrmStatusBadge, CompanyTypeBadges } from './CrmBadges';
import { getPrimaryContactPreview, isLinkedToPlatformAccount, formatCrmDateTime } from '../../utils/crmDisplayAdapter';

export default function CompanyRecordHeader({
  form,
  detailLead,
  onCall,
  onEmail,
  onWebsite,
  onAddNote,
  onEdit,
  onMerge,
  onDelete,
  onCreateJob,
  onLinkAccount,
  onChangeStatus,
}) {
  const name = String(form?.name || '').trim() || '—';
  const pc = getPrimaryContactPreview({
    ...detailLead,
    contact_name: form?.contact_name,
    email: form?.email,
    phone: form?.phone,
    contacts: form?.contacts,
  });
  const linked = isLinkedToPlatformAccount({ ...detailLead, ...form });
  const dupProfiles =
    detailLead?.linked_company_profile_id != null
      ? 'Check pipeline for duplicate CRM rows sharing this platform company.'
      : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <div className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 truncate">{name}</h2>
              <CrmStatusBadge status={form?.status} />
              <CompanyTypeBadges types={form?.company_types} />
              {linked ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <FaLink className="h-3 w-3" aria-hidden />
                  Linked
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                  Not linked
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-xs font-medium text-slate-500">Primary contact</span>
                <p className="text-slate-900 font-medium">{pc.name || <span className="text-slate-400 font-normal">No contact</span>}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500">Email</span>
                <p className="text-slate-900">
                  {pc.email ? (
                    <a href={`mailto:${pc.email}`} className="text-blue-600 hover:underline break-all">
                      {pc.email}
                    </a>
                  ) : (
                    <span className="text-slate-400">Missing</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500">Phone</span>
                <p className="text-slate-900">{pc.phone || <span className="text-slate-400">Missing</span>}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500">Website</span>
                <p className="text-slate-900">
                  {form?.website ? (
                    <a
                      href={/^https?:\/\//i.test(form.website) ? form.website : `https://${form.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline break-all"
                    >
                      {form.website}
                    </a>
                  ) : (
                    <span className="text-slate-400">Missing</span>
                  )}
                </p>
              </div>
              <div className="sm:col-span-2 text-xs text-slate-500">
                Created {formatCrmDateTime(detailLead?.created_at)} · Updated {formatCrmDateTime(detailLead?.updated_at)}
              </div>
            </div>
            {dupProfiles && linked ? <p className="text-xs text-amber-700">{dupProfiles}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={onCall}
              disabled={!pc.phone}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              <FaPhone className="h-3.5 w-3.5 text-blue-600" aria-hidden />
              Call
            </button>
            <button
              type="button"
              onClick={onEmail}
              disabled={!pc.email}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              <FaEnvelope className="h-3.5 w-3.5 text-orange-500" aria-hidden />
              Email
            </button>
            <button
              type="button"
              onClick={onWebsite}
              disabled={!form?.website}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              <FaGlobe className="h-3.5 w-3.5 text-sky-600" aria-hidden />
              Website
            </button>
            <button
              type="button"
              onClick={onAddNote}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FaStickyNote className="h-3.5 w-3.5 text-violet-600" aria-hidden />
              Add note
            </button>
            <button
              type="button"
              onClick={onChangeStatus}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Change status
            </button>
            <button
              type="button"
              onClick={onCreateJob}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"
            >
              <FaBriefcase className="h-3.5 w-3.5" aria-hidden />
              Create job
            </button>
            <button
              type="button"
              onClick={onLinkAccount}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-100"
            >
              <FaLink className="h-3.5 w-3.5" aria-hidden />
              Link account
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <FaPencilAlt className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
            <button
              type="button"
              onClick={onMerge}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <FaObjectGroup className="h-3.5 w-3.5" aria-hidden />
              Merge
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
            >
              <FaTrash className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
