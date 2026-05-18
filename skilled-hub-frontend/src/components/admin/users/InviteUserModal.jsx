import React, { useState, useEffect } from 'react';
import { FaTimes, FaPaperPlane } from 'react-icons/fa';
import { adminUsersAPI } from '../../../api/api';

export default function InviteUserModal({ isOpen, onClose, onSuccess, onError }) {
  const [email, setEmail] = useState('');
  const [emails, setEmails] = useState('');
  const [userType, setUserType] = useState('company');
  const [company, setCompany] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [message, setMessage] = useState('');
  const [multiMode, setMultiMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, sending, onClose]);

  const reset = () => {
    setEmail('');
    setEmails('');
    setCompany('');
    setRoleTitle('');
    setMessage('');
    setProgress(null);
  };

  const handleClose = () => {
    if (sending) return;
    reset();
    onClose();
  };

  if (!isOpen) return null;

  const parseEmails = () => {
    if (multiMode) {
      return emails
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return email.trim() ? [email.trim()] : [];
  };

  const handleSend = async () => {
    const list = parseEmails();
    if (list.length === 0) {
      onError?.('Enter at least one email address.');
      return;
    }
    setSending(true);
    setProgress({ done: 0, total: list.length });
    let succeeded = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const addr = list[i];
        const payload = {
          role: userType,
          email: addr,
          first_name: roleTitle.split(' ')[0] || 'Invited',
          last_name: roleTitle.split(' ').slice(1).join(' ') || 'User',
        };
        if (userType === 'technician') {
          payload.trade_type = company || 'General';
        } else if (company.trim()) {
          payload.company_name = company.trim();
        }
        const res = await adminUsersAPI.create(payload);
        const userId = res?.user?.id;
        if (userId) {
          await adminUsersAPI.sendPasswordSetup(userId, { sendEmail: true });
        }
        succeeded++;
        setProgress({ done: i + 1, total: list.length });
      }
      onSuccess?.(`Invited ${succeeded} user(s). They will receive a setup email.`);
      reset();
      onClose();
    } catch (e) {
      onError?.(e.message || `Failed after ${succeeded} invite(s).`);
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Invite user</h3>
          <button type="button" onClick={handleClose} disabled={sending} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <FaTimes />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">User type</span>
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="technician">Technician</option>
              <option value="company">Company user</option>
            </select>
          </label>

          {userType === 'company' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={multiMode} onChange={(e) => setMultiMode(e.target.checked)} />
              Invite multiple employees under same company
            </label>
          )}

          {multiMode ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Email addresses (one per line)</span>
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={4}
                placeholder="employee1@company.com&#10;employee2@company.com"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              {userType === 'company' ? 'Company name' : 'Trade / specialty'}
            </span>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Role / title (optional)</span>
            <input
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Personal message (optional)</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Included in invite when backend supports custom invite copy"
            />
          </label>

          {progress && (
            <p className="text-xs text-slate-500">
              Sending {progress.done} of {progress.total}…
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={handleClose} disabled={sending} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-tf-orange text-white text-sm font-semibold hover:bg-tf-orange-hover disabled:opacity-50"
          >
            <FaPaperPlane className="w-3.5 h-3.5" />
            {sending ? 'Sending…' : 'Send invite now'}
          </button>
        </div>
      </div>
    </div>
  );
}
