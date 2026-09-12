import React, { useEffect, useRef, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { adminUsersAPI } from '../../../api/api';
import { formatPhoneInput } from '../../../utils/phone';
import { getFullName } from '../../../utils/adminUsersDisplayAdapter';

function statusLabel(session) {
  if (!session?.status) return null;
  const map = {
    active: 'Active',
    waiting_for_reply: 'Active',
    paused: 'Paused',
    completed: 'Completed',
    needs_human: 'Needs human',
    opted_out: 'Opted out',
    failed: 'Failed',
  };
  return map[session.status] || session.status;
}

function TradeLicenseInventory({ trade }) {
  if (!trade) return null;
  const state = trade.state;
  const docs = trade.documents || [];
  const missing = trade.missing || [];
  const claimed = state === 'yes' || state === 'no' || docs.length > 0;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-800">Trade License</p>
      {state === 'yes' && <p className="text-[11px] text-emerald-700">✓ Complete</p>}
      {state === 'na' && <p className="text-[11px] text-slate-500">N/A — no credential</p>}
      {state === 'unknown' && <p className="text-[11px] text-amber-700">✕ Whether they hold a trade credential</p>}
      {state === 'no' && (
        <div className="text-[11px] text-slate-600 space-y-0.5">
          <p className={claimed ? 'text-emerald-700' : 'text-amber-700'}>
            {claimed ? '✓ Credential reported' : '✕ Credential not reported'}
          </p>
          {missing.map((item) => (
            <p key={item} className="text-amber-700">✕ {item.charAt(0).toUpperCase() + item.slice(1)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ReferencesInventory({ refs }) {
  if (!refs) return null;
  const count = refs.count || 0;
  const missing = refs.missing_count || 0;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-800">Professional References</p>
      <p className="text-[11px] text-slate-600">{refs.display_count || count} / 3</p>
      {missing > 0 ? (
        <p className="text-[11px] text-amber-700">
          ✕ {missing} {missing === 1 ? 'reference' : 'references'} still needed
        </p>
      ) : (
        <p className="text-[11px] text-emerald-700">✓ Complete</p>
      )}
    </div>
  );
}

function BackgroundInventory({ background }) {
  if (!background) return null;
  const complete = background.complete;
  const processing = background.color_bucket === 'processing' && !background.technician_actionable;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-800">Background Check</p>
      <p className={`text-[11px] ${complete ? 'text-emerald-700' : processing ? 'text-sky-700' : 'text-amber-700'}`}>
        {background.label || 'Incomplete'}
      </p>
    </div>
  );
}

export default function SendUserSmsModal({ isOpen, user, suggestedMessage = '', onClose, onSuccess, onError }) {
  const [mode, setMode] = useState('manual');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPayload, setAiPayload] = useState(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!isOpen) return undefined;
    setMessage(suggestedMessage || '');
    setMode('manual');
    setAiPayload(null);
    setSending(false);
    setAiLoading(false);
  }, [isOpen, suggestedMessage]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, sending, onClose]);

  useEffect(() => {
    if (!isOpen || !user?.id || mode !== 'ai') return undefined;
    let cancelled = false;
    setAiLoading(true);
    adminUsersAPI.getAiSmsSession(user.id)
      .then((payload) => {
        if (!cancelled) setAiPayload(payload);
      })
      .catch((e) => {
        if (!cancelled) onErrorRef.current?.(e.message || 'Failed to load verification inventory');
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    return () => {
      cancelled = true;
      setAiLoading(false);
    };
  }, [isOpen, user?.id, mode]);

  if (!isOpen || !user) return null;

  const name = getFullName(user);
  const phone = user.phone ? formatPhoneInput(user.phone) : 'No phone on file';
  const inventory = aiPayload?.inventory || user.verification;
  const session = aiPayload?.session || user.ai_sms_session;
  const live = session?.live || ['active', 'waiting_for_reply'].includes(session?.status);
  const sessionLabel = statusLabel(session);

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

  const runAi = async (fn, successMessage) => {
    if (sending || aiLoading) return;
    setSending(true);
    try {
      const result = await fn(user.id);
      setAiPayload(result);
      if (result?.success === false || result?.error) {
        onError?.(result.error || 'AI SMS action failed.');
        return;
      }
      onSuccess?.(successMessage(result));
    } catch (e) {
      onError?.(e.message || 'AI SMS action failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => !sending && onClose()} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Send SMS</h3>
          <button type="button" onClick={onClose} disabled={sending} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            <FaTimes />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {['manual', 'ai'].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                  mode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {value === 'manual' ? 'Manual SMS' : 'AI SMS'}
              </button>
            ))}
          </div>

          <div className="text-sm text-slate-700">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">To</p>
            <p className="font-medium">{name}</p>
            <p className="text-slate-500">{phone}</p>
          </div>

          {mode === 'manual' ? (
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
          ) : (
            <div className="space-y-3">
              {sessionLabel && (
                <div className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${
                  session?.status === 'needs_human'
                    ? 'bg-amber-50 text-amber-800'
                    : live
                      ? 'bg-sky-50 text-sky-800'
                      : 'bg-slate-50 text-slate-600'
                }`}
                >
                  AI SMS: {sessionLabel}
                </div>
              )}
              <div className="rounded-lg border border-slate-200 px-3 py-3 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Missing verification information</p>
                {aiLoading && !inventory ? (
                  <p className="text-[11px] text-slate-400">Loading inventory…</p>
                ) : (
                  <>
                    <TradeLicenseInventory trade={inventory?.trade_license} />
                    <ReferencesInventory refs={inventory?.professional_references} />
                    <BackgroundInventory background={inventory?.background_check} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {mode === 'manual' ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="rounded-md bg-tf-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-tf-blue-dark disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send SMS'}
            </button>
          ) : live ? (
            <>
              {session?.conversation_url && (
                <a
                  href={session.conversation_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Open Conversation
                </a>
              )}
              <button
                type="button"
                onClick={() => runAi(adminUsersAPI.pauseAiSms, () => 'AI SMS paused.')}
                disabled={sending}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Pause AI
              </button>
              <button
                type="button"
                onClick={() => runAi(adminUsersAPI.endAiSms, () => 'AI SMS ended.')}
                disabled={sending}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                End AI
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {session?.conversation_url && (
                <a
                  href={session.conversation_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Open Conversation
                </a>
              )}
              {(session?.status === 'paused' || session?.status === 'needs_human') && (
                <button
                  type="button"
                  onClick={() => runAi(adminUsersAPI.endAiSms, () => 'AI SMS ended.')}
                  disabled={sending}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  End AI
                </button>
              )}
              <button
                type="button"
                onClick={() => runAi(
                  adminUsersAPI.startAiSms,
                  (result) => (result?.resumed ? 'AI conversation already active.' : 'AI conversation started.')
                )}
                disabled={sending || aiLoading}
                className="rounded-md bg-tf-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-tf-blue-dark disabled:opacity-50"
              >
                {sending ? 'Starting…' : 'Start AI Conversation'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
