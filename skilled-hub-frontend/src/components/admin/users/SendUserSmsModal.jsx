import React, { useEffect, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { adminUsersAPI } from '../../../api/api';
import { formatPhoneInput } from '../../../utils/phone';
import { getFullName } from '../../../utils/adminUsersDisplayAdapter';

export default function SendUserSmsModal({ isOpen, user, suggestedMessage = '', onClose, onSuccess, onError }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setMessage(suggestedMessage || '');
    const onKey = (e) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, suggestedMessage, sending, onClose]);

  if (!isOpen || !user) return null;

  const name = getFullName(user);
  const phone = user.phone ? formatPhoneInput(user.phone) : 'No phone on file';

  const handleSend = async () => {
    if (sending) return;
    const body = message.trim();
    if (!body) {
      onError?.('Message is required.');
      return;
    }
    setSending(true);
    try {
      const result = await adminUsersAPI.sendSms(user.id, {
        message: body,
        context: 'admin_verification',
      });
      if (result?.success) {
        onSuccess?.(result.status === 'skipped' ? 'SMS skipped in demo mode.' : 'SMS sent.');
        onClose();
      } else {
        onError?.(result?.error || `SMS ${result?.status || 'failed'}.`);
      }
    } catch (e) {
      onError?.(e.message || 'Failed to send SMS');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => !sending && onClose()} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Send SMS</h3>
          <button type="button" onClick={onClose} disabled={sending} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <FaTimes />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-sm text-slate-700">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">To</p>
            <p className="font-medium">{name}</p>
            <p className="text-slate-500">{phone}</p>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={1600}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
            />
            <span className="mt-1 block text-[10px] text-slate-400 tabular-nums">{message.length}/1600</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="rounded-md bg-tf-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-tf-blue-dark disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send SMS'}
          </button>
        </div>
      </div>
    </div>
  );
}
