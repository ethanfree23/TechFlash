import React, { useState, useEffect } from 'react';
import { FaTimes, FaPaperPlane } from 'react-icons/fa';
import { adminUsersAPI } from '../../../api/api';

const TEMPLATES = [
  { key: 'welcome', label: 'Welcome email', wired: true },
  { key: 'verification', label: 'Verification reminder', wired: false },
  { key: 'incomplete', label: 'Incomplete profile reminder', wired: false },
  { key: 'sales', label: 'Sales call follow-up', wired: false },
  { key: 'subscription', label: 'Subscription reminder', wired: false },
  { key: 'job_posting', label: 'Job posting reminder', wired: false },
  { key: 'activation', label: 'Technician activation email', wired: true },
  { key: 'custom', label: 'Custom email', wired: false },
];

const PREVIEW_BODIES = {
  welcome: 'Welcome to TechFlash! Set up your password to get started.',
  verification: 'Please complete your verification documents to access paid jobs.',
  incomplete: 'Your profile is incomplete. Add missing details to unlock full platform access.',
  sales: 'Following up on our conversation about TechFlash for your team.',
  subscription: 'Your subscription requires attention. Please update billing details.',
  job_posting: 'Ready to post your first job? TechFlash connects you with verified technicians.',
  activation: 'Activate your technician account to start receiving job alerts.',
  custom: '',
};

export default function SendUserEmailModal({ isOpen, users, onClose, onSuccess, onError }) {
  const [templateKey, setTemplateKey] = useState('welcome');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const recipients = Array.isArray(users) ? users : users ? [users] : [];
  const template = TEMPLATES.find((t) => t.key === templateKey);

  useEffect(() => {
    if (!isOpen) return undefined;
    setBody(PREVIEW_BODIES[templateKey] || '');
    setSubject(TEMPLATES.find((t) => t.key === templateKey)?.label || '');
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, templateKey, sending, onClose]);

  if (!isOpen || recipients.length === 0) return null;

  const handleSend = async () => {
    if (!template?.wired) {
      onError?.('This template is not wired yet. Use Welcome or Activation for password setup emails.');
      return;
    }
    setSending(true);
    try {
      for (const u of recipients) {
        await adminUsersAPI.sendPasswordSetup(u.id, { sendEmail: true });
      }
      onSuccess?.(`Setup email sent to ${recipients.length} user(s).`);
      onClose();
    } catch (e) {
      onError?.(e.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Send email</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <FaTimes />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-slate-600">
            To: {recipients.map((u) => u.email || u.displayName).join(', ')}
          </p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Template</span>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}{!t.wired ? ' (preview only)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {!template?.wired && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {/* TODO(admin-users): wire arbitrary admin email to platform users — only password setup is available today */}
              Preview only. Custom and most templates require a backend admin email endpoint.
            </p>
          )}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Preview</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{body || '—'}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !template?.wired}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-tf-blue text-white text-sm font-semibold hover:bg-tf-blue-dark disabled:opacity-50"
          >
            <FaPaperPlane className="w-3.5 h-3.5" />
            {sending ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  );
}
