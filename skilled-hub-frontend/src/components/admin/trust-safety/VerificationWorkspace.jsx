import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaShieldAlt,
  FaExternalLinkAlt,
  FaPlus,
  FaChevronDown,
  FaChevronRight,
  FaPhone,
  FaEnvelope,
} from 'react-icons/fa';
import { adminTrustSafetyAPI } from '../../../api/api';
import StatusBadge from '../command-center/StatusBadge';
import { ItemStatusBadge, ErrorState } from './primitives';
import {
  formatDateTime,
  formatRelative,
  toneToBadgeVariant,
  buildWorkspaceSearch,
} from '../../../utils/trustSafety';
import { formatPhoneDisplay } from '../../../utils/crmDisplayAdapter';
import { formatPhoneInput } from '../../../utils/phone';

const STATUS_DOT = {
  verified: 'bg-emerald-500',
  needs_review: 'bg-amber-500',
  pending: 'bg-sky-500',
  rejected: 'bg-red-500',
  expired: 'bg-red-400',
  incomplete: 'bg-slate-400',
  not_started: 'bg-slate-300',
  not_applicable: 'bg-slate-200',
};

const CONTACT_OUTCOMES = [
  { value: 'reached', label: 'Reached — spoke with reference' },
  { value: 'voicemail', label: 'Left voicemail' },
  { value: 'text_sent', label: 'Sent text message' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'email_bounced', label: 'Email bounced' },
  { value: 'declined', label: 'Declined to participate' },
];

const EMPTY_REFERENCE = {
  full_name: '',
  company_name: '',
  relationship: '',
  phone: '',
  email: '',
};

const EMPTY_CREDENTIAL = {
  doc_type: 'license',
  title: '',
  trade: '',
  issuer: '',
  document_number: '',
  state: '',
  issued_on: '',
  valid_until: '',
  verification_method: 'document_review',
  admin_notes: '',
  file: null,
};

function workspaceLink(userId, itemRef) {
  return `/admin/trust-safety${buildWorkspaceSearch({
    tab: 'queue',
    filters: { status: 'all' },
    technician: userId,
    item: itemRef || null,
  })}`;
}

function telHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `tel:+${digits.startsWith('1') ? digits : `1${digits}`}`;
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function inputClass() {
  return 'w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-tf-blue/30 focus:border-tf-blue';
}

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const tone =
    toast.type === 'error'
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-emerald-200 bg-emerald-50 text-emerald-900';
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs flex items-start justify-between gap-3 ${tone}`} role="status">
      <span>{toast.message}</span>
      <button type="button" onClick={onDismiss} className="font-semibold underline shrink-0">
        Dismiss
      </button>
    </div>
  );
}

function ReferencesManager({ userId, items, onChanged, setToast }) {
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState(EMPTY_REFERENCE);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [contactFor, setContactFor] = useState(null);
  const [contactDraft, setContactDraft] = useState({ outcome: 'reached', method: 'phone', note: '' });
  const [verifyFor, setVerifyFor] = useState(null);
  const [verifyNote, setVerifyNote] = useState('');

  const resetForm = () => {
    setForm(EMPTY_REFERENCE);
    setEditingId(null);
    setOpenForm(false);
  };

  const startEdit = (ref) => {
    setEditingId(ref.id);
    setOpenForm(true);
    setForm({
      full_name: ref.full_name || ref.title || ref.details?.full_name || '',
      company_name: ref.company_name || ref.details?.company_name || '',
      relationship: ref.relationship || ref.details?.relationship || '',
      phone: ref.phone || ref.details?.phone || '',
      email: ref.email || ref.details?.email || '',
    });
  };

  const saveReference = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        company_name: form.company_name.trim() || null,
        relationship: form.relationship.trim() || 'Professional reference',
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      };
      let res;
      if (editingId) {
        res = await adminTrustSafetyAPI.updateReference(editingId, payload);
      } else {
        res = await adminTrustSafetyAPI.createReference(userId, payload);
      }
      setToast({ type: 'success', message: res?.message || 'Reference saved.' });
      resetForm();
      onChanged(res?.trust_profile);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not save reference.' });
    } finally {
      setBusy(false);
    }
  };

  const removeReference = async (ref) => {
    const decided = ['approved', 'rejected'].includes(ref.status?.key || ref.status);
    const confirmMsg = decided
      ? `Remove verified/rejected reference "${ref.title}"? This requires confirmation.`
      : `Remove reference "${ref.title}"?`;
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await adminTrustSafetyAPI.destroyReference(ref.id, { confirm: decided });
      setToast({ type: 'success', message: res?.message || 'Reference removed.' });
      onChanged(res?.trust_profile);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not remove reference.' });
    } finally {
      setBusy(false);
    }
  };

  const saveContact = async (e) => {
    e.preventDefault();
    if (!contactFor || busy) return;
    setBusy(true);
    try {
      await adminTrustSafetyAPI.recordReferenceContactAttempt(contactFor.id, {
        outcome: contactDraft.outcome,
        method: contactDraft.method,
        note: contactDraft.note.trim() || undefined,
      });
      setToast({ type: 'success', message: 'Contact attempt recorded.' });
      setContactFor(null);
      onChanged();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not record contact.' });
    } finally {
      setBusy(false);
    }
  };

  const saveVerify = async (status) => {
    if (!verifyFor || busy) return;
    const needsOverride = status === 'approved' && verifyFor.status?.key === 'requested';
    if (status === 'rejected' && !verifyNote.trim()) {
      setToast({ type: 'error', message: 'A reason is required to reject a reference.' });
      return;
    }
    if (needsOverride && !verifyNote.trim()) {
      setToast({ type: 'error', message: 'Describe how you verified this reference before marking it verified.' });
      return;
    }
    setBusy(true);
    try {
      const res = await adminTrustSafetyAPI.reviewReference(verifyFor.id, {
        status,
        reason: verifyNote.trim() || undefined,
        override: needsOverride || undefined,
        expected_updated_at: verifyFor.updated_at,
      });
      setToast({ type: 'success', message: res?.message || `Reference ${status}.` });
      setVerifyFor(null);
      setVerifyNote('');
      onChanged();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not update verification status.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          Admin-added references stay unverified until you explicitly mark them verified after contact.
        </p>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY_REFERENCE);
            setOpenForm(true);
          }}
          className="inline-flex items-center gap-1.5 h-8 rounded-md bg-tf-blue px-3 text-xs font-semibold text-white hover:bg-tf-blue/90"
        >
          <FaPlus className="h-3 w-3" /> Add Reference
        </button>
      </div>

      {openForm && (
        <form onSubmit={saveReference} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-800">{editingId ? 'Edit reference' : 'New reference'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Reference name *">
              <input required className={inputClass()} value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </Field>
            <Field label="Company">
              <input className={inputClass()} value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
            </Field>
            <Field label="Job title / relationship">
              <input className={inputClass()} value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))} placeholder="Former supervisor" />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass()}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
              />
            </Field>
            <Field label="Email (optional)" className="sm:col-span-2">
              <input type="email" className={inputClass()} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add reference'}
            </button>
            <button type="button" onClick={resetForm} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">No professional references on file.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {items.map((ref) => {
            const phone = ref.phone || ref.details?.phone;
            const email = ref.email || ref.details?.email;
            const contact = ref.contact;
            return (
              <li key={ref.key || ref.id} className="p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{ref.title}</p>
                      <ItemStatusBadge status={ref.status} />
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{ref.subtitle || '—'}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      {phone && (
                        <a href={telHref(phone)} className="inline-flex items-center gap-1 text-tf-blue hover:underline">
                          <FaPhone className="h-2.5 w-2.5" /> {formatPhoneDisplay(phone) || phone}
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-tf-blue hover:underline">
                          <FaEnvelope className="h-2.5 w-2.5" /> {email}
                        </a>
                      )}
                      {contact?.last_contacted_at && (
                        <span title={formatDateTime(contact.last_contacted_at)}>
                          Last contacted {formatRelative(contact.last_contacted_at)}
                          {contact.last_outcome ? ` · ${String(contact.last_outcome).replace(/_/g, ' ')}` : ''}
                          {contact.last_contacted_by_name ? ` · by ${contact.last_contacted_by_name}` : ''}
                        </span>
                      )}
                      {ref.reviewer_decision?.reviewer?.name && (
                        <span>Verified by {ref.reviewer_decision.reviewer.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" disabled={busy} onClick={() => startEdit(ref)} className="h-7 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setContactFor(ref);
                        setContactDraft({ outcome: 'reached', method: 'phone', note: '' });
                      }}
                      className="h-7 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Log contact
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setVerifyFor(ref);
                        setVerifyNote('');
                      }}
                      className="h-7 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                    >
                      Verify / reject
                    </button>
                    <button type="button" disabled={busy} onClick={() => removeReference(ref)} className="h-7 rounded-md border border-red-200 px-2 text-[11px] font-medium text-red-700 hover:bg-red-50">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {contactFor && (
        <form onSubmit={saveContact} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-800">Contact attempt · {contactFor.title}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Outcome">
              <select className={inputClass()} value={contactDraft.outcome} onChange={(e) => setContactDraft((d) => ({ ...d, outcome: e.target.value }))}>
                {CONTACT_OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Method">
              <select className={inputClass()} value={contactDraft.method} onChange={(e) => setContactDraft((d) => ({ ...d, method: e.target.value }))}>
                <option value="phone">Phone</option>
                <option value="sms">Text message</option>
                <option value="email">Email</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                rows={2}
                className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm"
                value={contactDraft.note}
                onChange={(e) => setContactDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="Conversation notes, voicemail details, response…"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Save contact'}
            </button>
            <button type="button" onClick={() => setContactFor(null)} className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium">
              Cancel
            </button>
          </div>
        </form>
      )}

      {verifyFor && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-800">Verification decision · {verifyFor.title}</p>
          <p className="text-[11px] text-slate-500">
            Marking verified is an explicit admin action and is audited. Admin-added references are not auto-verified.
          </p>
          <Field label="Verification notes / reason">
            <textarea
              rows={2}
              className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm"
              value={verifyNote}
              onChange={(e) => setVerifyNote(e.target.value)}
              placeholder="How was this reference verified?"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => saveVerify('approved')} className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
              Mark verified
            </button>
            <button type="button" disabled={busy} onClick={() => saveVerify('rejected')} className="h-8 rounded-md bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
              Reject
            </button>
            <button type="button" onClick={() => setVerifyFor(null)} className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CredentialsManager({ userId, items, onChanged, setToast }) {
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState(EMPTY_CREDENTIAL);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reviewFor, setReviewFor] = useState(null);
  const [reviewNote, setReviewNote] = useState('');

  const resetForm = () => {
    setForm(EMPTY_CREDENTIAL);
    setEditingId(null);
    setOpenForm(false);
  };

  const startEdit = (doc) => {
    const details = doc.details || {};
    const meta = details.metadata || doc.metadata || {};
    setEditingId(doc.id);
    setOpenForm(true);
    setForm({
      doc_type: doc.doc_type || 'license',
      title: meta.title || meta.credential_name || details.title || doc.title || '',
      trade: meta.trade || '',
      issuer: details.issuer || doc.issuer || '',
      document_number: details.document_number || doc.document_number || '',
      state: meta.state || meta.issuing_state || '',
      issued_on: (details.issued_on || doc.issued_on) ? String(details.issued_on || doc.issued_on).slice(0, 10) : '',
      valid_until: details.valid_until ? String(details.valid_until).slice(0, 10) : (doc.expires_at ? String(doc.expires_at).slice(0, 10) : ''),
      verification_method: meta.verification_method || 'document_review',
      admin_notes: meta.admin_notes || '',
      file: null,
    });
  };

  const buildFormData = () => {
    const fd = new FormData();
    Object.entries({
      doc_type: form.doc_type,
      title: form.title,
      trade: form.trade,
      issuer: form.issuer,
      document_number: form.document_number,
      state: form.state,
      issued_on: form.issued_on,
      valid_until: form.valid_until,
      verification_method: form.verification_method,
      admin_notes: form.admin_notes,
    }).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') fd.append(key, String(value).trim());
    });
    if (form.file) fd.append('file', form.file);
    return fd;
  };

  const saveCredential = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const fd = buildFormData();
      let res;
      if (editingId) {
        res = await adminTrustSafetyAPI.updateCredential(editingId, fd);
      } else {
        res = await adminTrustSafetyAPI.createCredential(userId, fd);
      }
      setToast({ type: 'success', message: res?.message || 'Credential saved.' });
      resetForm();
      onChanged(res?.trust_profile);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not save credential.' });
    } finally {
      setBusy(false);
    }
  };

  const reviewCredential = async (status) => {
    if (!reviewFor || busy) return;
    if (status === 'rejected' && !reviewNote.trim()) {
      setToast({ type: 'error', message: 'A reason is required to reject a credential.' });
      return;
    }
    setBusy(true);
    try {
      const res = await adminTrustSafetyAPI.reviewDocument(reviewFor.id, {
        status,
        reason: reviewNote.trim() || undefined,
        expected_updated_at: reviewFor.updated_at,
      });
      setToast({ type: 'success', message: res?.message || `Credential ${status}.` });
      setReviewFor(null);
      setReviewNote('');
      onChanged();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not update credential.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          Manually entered credentials stay pending until you approve them. Document review is not the same as issuing-authority verification.
        </p>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY_CREDENTIAL);
            setOpenForm(true);
          }}
          className="inline-flex items-center gap-1.5 h-8 rounded-md bg-tf-blue px-3 text-xs font-semibold text-white hover:bg-tf-blue/90"
        >
          <FaPlus className="h-3 w-3" /> Add Credential
        </button>
      </div>

      {openForm && (
        <form onSubmit={saveCredential} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-800">{editingId ? 'Edit credential' : 'New credential'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Credential type">
              <select className={inputClass()} value={form.doc_type} onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))}>
                <option value="license">Trade license</option>
                <option value="certificate">Certification</option>
              </select>
            </Field>
            <Field label="Credential name">
              <input className={inputClass()} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="TDLR Electrical License" />
            </Field>
            <Field label="Trade">
              <input className={inputClass()} value={form.trade} onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))} placeholder="Electrician" />
            </Field>
            <Field label="Issuing organization">
              <input className={inputClass()} value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} placeholder="Texas TDLR" />
            </Field>
            <Field label="License / certificate number">
              <input className={inputClass()} value={form.document_number} onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))} />
            </Field>
            <Field label="State / jurisdiction">
              <input className={inputClass()} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="TX" />
            </Field>
            <Field label="Issue date">
              <input type="date" className={inputClass()} value={form.issued_on} onChange={(e) => setForm((f) => ({ ...f, issued_on: e.target.value }))} />
            </Field>
            <Field label="Expiration date">
              <input type="date" className={inputClass()} value={form.valid_until} onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))} />
            </Field>
            <Field label="Verification approach">
              <select className={inputClass()} value={form.verification_method} onChange={(e) => setForm((f) => ({ ...f, verification_method: e.target.value }))}>
                <option value="document_review">Document review</option>
                <option value="issuing_authority">Verified with issuing authority</option>
              </select>
            </Field>
            <Field label="File upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                className="block w-full text-xs text-slate-600"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              />
            </Field>
            <Field label="Admin notes" className="sm:col-span-2">
              <textarea
                rows={2}
                className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm"
                value={form.admin_notes}
                onChange={(e) => setForm((f) => ({ ...f, admin_notes: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add credential'}
            </button>
            <button type="button" onClick={resetForm} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">No trade licenses or certifications on file.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {items.map((doc) => (
            <li key={doc.key || doc.id} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{doc.title}</p>
                    <ItemStatusBadge status={doc.status} />
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {doc.review_type_label}
                    {doc.subtitle ? ` · ${doc.subtitle}` : ''}
                    {!doc.has_file ? ' · no file' : ''}
                  </p>
                  {doc.details?.metadata?.verification_method && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Approach: {String(doc.details.metadata.verification_method).replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" disabled={busy} onClick={() => startEdit(doc)} className="h-7 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                    Edit
                  </button>
                  <Link to={workspaceLink(userId, doc.key)} className="inline-flex items-center h-7 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                    View file
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setReviewFor(doc);
                      setReviewNote('');
                    }}
                    className="h-7 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Approve / reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {reviewFor && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-800">Review credential · {reviewFor.title}</p>
          <Field label="Notes / rejection reason">
            <textarea
              rows={2}
              className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => reviewCredential('approved')} className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
              Approve document
            </button>
            <button type="button" disabled={busy} onClick={() => reviewCredential('rejected')} className="h-8 rounded-md bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
              Reject
            </button>
            <button type="button" onClick={() => setReviewFor(null)} className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BackgroundPanel({ checks, userId }) {
  const latest = checks?.[0];
  if (!latest) {
    return (
      <p className="text-xs text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">
        No Checkr background check has been initiated. The technician starts Checkr from their profile; Checkr consent and FCRA steps are preserved.
      </p>
    );
  }
  const checkr = latest.checkr || latest.checkr_summary || {};
  const lifecycle = latest.lifecycle || latest.lifecycle_summary || {};
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ItemStatusBadge status={latest.status} />
        <span className="text-sm font-semibold text-slate-900">{latest.title}</span>
      </div>
      <div className="text-xs text-slate-600 space-y-1">
        {latest.provider_status?.label && <p>Provider: {latest.provider_status.label}</p>}
        {latest.updated_at && <p title={formatDateTime(latest.updated_at)}>Updated {formatRelative(latest.updated_at)}</p>}
        {lifecycle.started_at && <p>Initiated {formatDateTime(lifecycle.started_at)}</p>}
        {lifecycle.completed_at && <p>Completed {formatDateTime(lifecycle.completed_at)}</p>}
        {checkr.adjudication && <p>Adjudication: {checkr.adjudication}</p>}
        {latest.reviewer_decision?.override_status && (
          <p className="font-medium">Override: {String(latest.reviewer_decision.override_status).replace(/_/g, ' ')}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          to={workspaceLink(userId, latest.key)}
          className="inline-flex items-center gap-1 h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Open Checkr review <FaExternalLinkAlt className="h-2.5 w-2.5" />
        </Link>
        {checkr.dashboard_url && (
          <a
            href={checkr.dashboard_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Checkr dashboard <FaExternalLinkAlt className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function ContactPanel({ technician }) {
  const email = technician?.email;
  const phone = technician?.phone;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 text-sm">
      {email ? (
        <a href={`mailto:${email}`} className="flex items-center gap-2 text-tf-blue hover:underline">
          <FaEnvelope className="h-3.5 w-3.5" /> {email}
        </a>
      ) : (
        <p className="text-xs text-slate-500">No email on file</p>
      )}
      {phone ? (
        <a href={telHref(phone)} className="flex items-center gap-2 text-tf-blue hover:underline">
          <FaPhone className="h-3.5 w-3.5" /> {formatPhoneDisplay(phone) || phone}
        </a>
      ) : (
        <p className="text-xs text-slate-500">No phone on file</p>
      )}
    </div>
  );
}

function ChecklistSection({ row, userId, profile, open, onToggle, onChanged, setToast }) {
  const refs = useMemo(() => {
    const list = profile?.items?.references || [];
    // Ensure detail fields when possible — list payload may omit details; merge contact from list items.
    return list;
  }, [profile]);

  const credentials = useMemo(() => {
    return profile?.items?.credentials || profile?.items?.documents?.filter((d) => d.document_category === 'credential') || row.documents || [];
  }, [profile, row.documents]);

  const checks = profile?.items?.background_checks || [];

  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50/80"
        aria-expanded={open}
      >
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[row.status] || 'bg-slate-300'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{row.label}</p>
            <StatusBadge variant={toneToBadgeVariant(row.tone)}>{row.status_label}</StatusBadge>
          </div>
          {row.detail && <p className="mt-0.5 text-xs text-slate-600">{row.detail}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            {row.updated_at && <span title={formatDateTime(row.updated_at)}>Updated {formatRelative(row.updated_at)}</span>}
            {row.next_action && (
              <span>
                <span className="font-semibold text-slate-500">Next:</span> {row.next_action}
              </span>
            )}
            {row.counts && (
              <span>
                {row.counts.approved} verified · {row.counts.responded} awaiting review · {row.counts.requested} awaiting response
              </span>
            )}
          </div>
        </div>
        {open ? <FaChevronDown className="h-3.5 w-3.5 text-slate-400 mt-1" /> : <FaChevronRight className="h-3.5 w-3.5 text-slate-400 mt-1" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {row.key === 'references' && (
            <ReferencesManager userId={userId} items={refs} onChanged={onChanged} setToast={setToast} />
          )}
          {row.key === 'trade_license' && (
            <CredentialsManager userId={userId} items={credentials} onChanged={onChanged} setToast={setToast} />
          )}
          {row.key === 'background_check' && <BackgroundPanel checks={checks} userId={userId} />}
          {row.key === 'contact' && <ContactPanel technician={profile?.technician} />}
        </div>
      )}
    </li>
  );
}

/**
 * Admin verification workspace embedded on the technician profile.
 * Statuses come from TrustSafety::TrustProfile; create/edit actions hit admin APIs.
 */
export default function VerificationWorkspace({ userId, isTechnician = true }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [openKey, setOpenKey] = useState('references');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const res = await adminTrustSafetyAPI.technician(userId);
      setProfile(res?.trust_profile || null);
    } catch (e) {
      if (e?.status === 422) {
        setProfile(null);
      } else {
        setError(e?.message || 'Could not load verification profile.');
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const onChanged = useCallback(
    async (trustProfile) => {
      if (trustProfile) {
        setProfile(trustProfile);
        return;
      }
      await load();
    },
    [load]
  );

  if (!isTechnician) {
    return <p className="text-sm text-slate-500">Verification checks apply to technician accounts only.</p>;
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (loading && !profile) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!profile) {
    return <p className="text-sm text-slate-500">This account has no technician profile, so there is nothing to verify.</p>;
  }

  const s = profile.summary || {};
  return (
    <div className="space-y-4">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <FaShieldAlt className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Verification</p>
              <p className="text-[11px] text-slate-500">
                {s.verified_count}/{s.total} checks complete
                {s.complete ? ' · all required checks satisfied' : ''}
                {s.needs_review_count > 0 ? ` · ${s.needs_review_count} need review` : ''}
                {' · '}
                Background-verified flag:{' '}
                <span className={s.background_verified ? 'text-emerald-700 font-semibold' : 'text-slate-600 font-semibold'}>
                  {s.background_verified ? 'on' : 'off'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(profile.badges || []).map((b) => (
              <StatusBadge key={b.badge_type} variant={b.status === 'active' ? 'success' : 'neutral'}>
                {String(b.badge_type).replace(/_/g, ' ')} · {b.status}
              </StatusBadge>
            ))}
            <Link
              to={workspaceLink(userId, null)}
              className="inline-flex items-center gap-1 h-8 rounded-md bg-tf-blue px-3 text-xs font-semibold text-white hover:bg-tf-blue/90"
            >
              Open Verification Workspace <FaExternalLinkAlt className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
        <ul>
          {(profile.checklist || []).map((row) => (
            <ChecklistSection
              key={row.key}
              row={row}
              userId={userId}
              profile={profile}
              open={openKey === row.key}
              onToggle={() => setOpenKey((k) => (k === row.key ? null : row.key))}
              onChanged={onChanged}
              setToast={setToast}
            />
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-slate-400">
        A clear background check does not verify credentials or references. Approving an uploaded document is a document review, not an issuing-authority confirmation, unless you record that approach.
      </p>
    </div>
  );
}

// Backwards-compatible export used by existing imports.
export { VerificationWorkspace as TrustProfileChecklist };
