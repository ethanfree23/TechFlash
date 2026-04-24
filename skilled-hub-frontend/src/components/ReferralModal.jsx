import React, { useState } from 'react';
import AlertModal from './AlertModal';
import { referralsAPI } from '../api/api';

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  cell_phone: '',
  referred_type: 'tech',
  email: '',
  location: '',
  extra_info: '',
};

export default function ReferralModal({ isOpen, onClose, prefill = {}, triggerLabel = 'Send Referral' }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...prefill });
  const [submitting, setSubmitting] = useState(false);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'error' });

  if (!isOpen) return null;

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email?.trim()) {
      setAlertModal({ isOpen: true, title: 'Email required', message: 'Please add an email address.', variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await referralsAPI.create(form);
      setAlertModal({
        isOpen: true,
        title: 'Referral sent',
        message: 'Thanks! We tagged it as a referral and added it to CRM.',
        variant: 'success',
      });
      setForm(EMPTY_FORM);
      onClose?.();
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Could not submit referral', message: err.message || 'Please try again.', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !submitting && onClose?.()}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">{triggerLabel}</h2>
            <p className="text-sm text-gray-500 mt-1">We will tag this as a referral message and add it to CRM.</p>
          </div>
          <form onSubmit={submit} className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase">First name *</span>
              <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.first_name} onChange={(e) => update('first_name', e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase">Last name *</span>
              <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.last_name} onChange={(e) => update('last_name', e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase">Cell phone</span>
              <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.cell_phone} onChange={(e) => update('cell_phone', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase">Type *</span>
              <select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.referred_type} onChange={(e) => update('referred_type', e.target.value)}>
                <option value="tech">Tech</option>
                <option value="biz">Biz</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Email *</span>
              <input type="email" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.email} onChange={(e) => update('email', e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase">Location</span>
              <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.location} onChange={(e) => update('location', e.target.value)} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Other info</span>
              <textarea className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[90px]" value={form.extra_info} onChange={(e) => update('extra_info', e.target.value)} />
            </label>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'Sending...' : 'Submit referral'}
              </button>
              <button type="button" onClick={() => onClose?.()} disabled={submitting} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </>
  );
}
