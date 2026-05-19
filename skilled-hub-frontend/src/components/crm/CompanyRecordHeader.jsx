import React, { useEffect, useRef, useState } from 'react';
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
  FaUserPlus,
  FaBell,
  FaChevronDown,
} from 'react-icons/fa';
import { CrmStatusBadge, CompanyTypeBadges } from './CrmBadges';
import { getPrimaryContactPreview, isLinkedToPlatformAccount, formatCrmDateTime, formatWebsiteLabel } from '../../utils/crmDisplayAdapter';

function formatAddressSnippet(form) {
  const parts = [form?.street_address, form?.city, form?.state, form?.zip].map((v) => String(v || '').trim()).filter(Boolean);
  return parts.join(', ') || '';
}

export default function CompanyRecordHeader({
  form,
  detailLead,
  onCall,
  onEmail,
  onWebsite,
  onAddNote,
  onReminder,
  onEdit,
  onMerge,
  onDelete,
  onCreateJob,
  onCreatePlatformAccount,
  onAddCompanyLogin,
  onLinkAccount,
  onChangeStatus,
  onOpenGmail,
  onSendEmail,
}) {
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const sendMenuRef = useRef(null);

  useEffect(() => {
    if (!sendMenuOpen) return undefined;
    const onDoc = (e) => {
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target)) setSendMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sendMenuOpen]);
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
  const addr = formatAddressSnippet(form);
  const showCreateJob = linked;

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm mb-6${sendMenuOpen ? ' relative z-30' : ''}`}
    >
      <div className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 px-4 py-4 sm:px-6">
        {/* Always stack meta above actions so the center column never squeezes text to one character wide */}
        <div className="flex flex-col gap-4">
          <div className="w-full min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 break-words min-w-0">{name}</h2>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm min-w-0">
              <div className="min-w-0 sm:col-span-2">
                <span className="text-xs font-medium text-slate-500">Company email</span>
                <p className="text-slate-900 min-w-0">
                  {form?.company_email ? (
                    <a href={`mailto:${form.company_email}`} className="text-blue-600 hover:underline break-words inline-block max-w-full">
                      {form.company_email}
                    </a>
                  ) : (
                    <span className="text-slate-400">Missing</span>
                  )}
                </p>
              </div>
              <div className="min-w-0">
                <span className="text-xs font-medium text-slate-500">Company phone</span>
                <p className="text-slate-900 break-words">{form?.company_phone || <span className="text-slate-400">Missing</span>}</p>
              </div>
              <div className="min-w-0">
                <span className="text-xs font-medium text-slate-500">Website</span>
                <p className="text-slate-900 min-w-0">
                  {form?.website ? (
                    <a
                      href={/^https?:\/\//i.test(form.website) ? form.website : `https://${form.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline break-words inline-block max-w-full"
                    >
                      {formatWebsiteLabel(form.website)}
                    </a>
                  ) : (
                    <span className="text-slate-400">Missing</span>
                  )}
                </p>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <span className="text-xs font-medium text-slate-500">Address</span>
                <p className="text-slate-900 break-words">{addr || <span className="text-slate-400">Missing</span>}</p>
              </div>
              <div className="sm:col-span-2 pt-1 border-t border-slate-100/80">
                <span className="text-xs font-medium text-slate-500">Primary contact</span>
                <p className="text-slate-800 text-sm mt-0.5 break-words">
                  {[pc.name || '—', pc.email && ` · ${pc.email}`, pc.phone && ` · ${pc.phone}`].filter(Boolean).join('')}
                </p>
              </div>
              <div className="sm:col-span-2 text-xs text-slate-500">
                Created {formatCrmDateTime(detailLead?.created_at)} · Updated {formatCrmDateTime(detailLead?.updated_at)}
              </div>
            </div>
            {dupProfiles && linked ? <p className="text-xs text-amber-700">{dupProfiles}</p> : null}
          </div>
          <div className="flex w-full min-w-0 flex-wrap gap-2">
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
            {typeof onOpenGmail === 'function' ? (
              <button
                type="button"
                onClick={onOpenGmail}
                disabled={!pc.email && !form?.company_email}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              >
                <FaEnvelope className="h-3.5 w-3.5 text-red-500" aria-hidden />
                Open in Gmail
              </button>
            ) : null}
            {typeof onSendEmail === 'function' ? (
              <div className="relative" ref={sendMenuRef}>
                <button
                  type="button"
                  onClick={() => setSendMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-100"
                >
                  <FaEnvelope className="h-3.5 w-3.5 text-orange-600" aria-hidden />
                  Send email
                  <FaChevronDown className="h-3 w-3 opacity-70" aria-hidden />
                </button>
                {sendMenuOpen ? (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-50"
                      onClick={() => {
                        setSendMenuOpen(false);
                        onSendEmail('sales_call_follow_up');
                      }}
                    >
                      Sales call follow-up
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-50"
                      onClick={() => {
                        setSendMenuOpen(false);
                        onSendEmail('custom_email');
                      }}
                    >
                      Custom email
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={onWebsite}
              disabled={!form?.website}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              <FaGlobe className="h-3.5 w-3.5 text-sky-600" aria-hidden />
              Website
            </button>
            {typeof onReminder === 'function' ? (
              <button
                type="button"
                onClick={onReminder}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <FaBell className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                Reminder
              </button>
            ) : null}
            <button
              type="button"
              onClick={onAddNote}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FaStickyNote className="h-3.5 w-3.5 text-violet-600" aria-hidden />
              Note
            </button>
            <button
              type="button"
              onClick={onChangeStatus}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Change status
            </button>
            {showCreateJob ? (
              <button
                type="button"
                onClick={onCreateJob}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"
              >
                <FaBriefcase className="h-3.5 w-3.5" aria-hidden />
                Create job
              </button>
            ) : null}
            {linked && typeof onAddCompanyLogin === 'function' ? (
              <button
                type="button"
                onClick={onAddCompanyLogin}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <FaUserPlus className="h-3.5 w-3.5" aria-hidden />
                Add company login
              </button>
            ) : null}
            {!linked && typeof onCreatePlatformAccount === 'function' ? (
              <button
                type="button"
                onClick={onCreatePlatformAccount}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <FaUserPlus className="h-3.5 w-3.5" aria-hidden />
                Create platform account
              </button>
            ) : null}
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
