import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaEnvelope, FaPaperPlane, FaTimes } from 'react-icons/fa';
import { crmAPI } from '../../api/api';
import ConfirmModal from '../ConfirmModal';
import {
  CRM_EMAIL_TEMPLATES,
  CRM_EMAIL_VARIABLES,
  buildDraftForTemplate,
  getRecipientOptions,
  getTemplateByKey,
  isRecipientOnRecord,
  isValidEmail,
} from '../../utils/crmEmailTemplates';

function PreviewPanel({ loading, preview, draft }) {
  if (loading) {
    return <p className="text-sm text-slate-500 py-8 text-center">Loading preview…</p>;
  }
  if (!preview?.html_body) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">
        Preview shows the branded layout delivered via Mailtrap when configured on the API.
      </p>
    );
  }
  return (
    <PreviewInner preview={preview} draft={draft} />
  );
}

function PreviewInner({ preview, draft }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 max-h-[60vh] overflow-y-auto">
      <div className="text-xs text-slate-600 space-y-1">
        <p>
          <span className="font-medium">To:</span> {preview.to || draft.to}
        </p>
        <p>
          <span className="font-medium">Subject:</span> {preview.subject || draft.subject}
        </p>
        {preview.from ? (
          <p>
            <span className="font-medium">From:</span> {preview.from}
            {preview.reply_to ? ` · Reply-To: ${preview.reply_to}` : ''}
          </p>
        ) : null}
      </div>
      <HtmlPreview html={preview.html_body} />
    </div>
  );
}

function HtmlPreview({ html }) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 text-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ComposeFields({
  draft,
  setDraft,
  recipientOptions,
  manualTo,
  setManualTo,
  bodyRef,
  insertVariable,
  applyTemplate,
  resetToDefault,
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Template</span>
        <select
          value={draft.templateKey}
          onChange={(e) => applyTemplate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {CRM_EMAIL_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key} disabled={!t.enabled}>
              {t.label}
              {!t.enabled ? ' (coming soon)' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">To</span>
        {!manualTo && recipientOptions.length > 0 ? (
          <select
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {recipientOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="email"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value.trim() }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="name@company.com"
          />
        )}
        <button
          type="button"
          onClick={() => setManualTo((m) => !m)}
          className="mt-1 text-xs text-blue-600 hover:underline"
        >
          {manualTo ? 'Choose from CRM contacts' : 'Enter email manually'}
        </button>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">CC (optional)</span>
        <input
          type="text"
          value={draft.cc}
          onChange={(e) => setDraft((d) => ({ ...d, cc: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="comma-separated"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">BCC (optional)</span>
        <input
          type="text"
          value={draft.bcc}
          onChange={(e) => setDraft((d) => ({ ...d, bcc: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="comma-separated"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">Subject</span>
        <input
          type="text"
          value={draft.subject}
          onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">Body</span>
          <div className="flex gap-2">
            <button type="button" onClick={resetToDefault} className="text-xs text-slate-600 hover:underline">
              Reset to default
            </button>
            <button
              type="button"
              onClick={() => applyTemplate('short_follow_up')}
              className="text-xs text-orange-600 hover:underline"
            >
              Use shorter version
            </button>
          </div>
        </div>
        <textarea
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          rows={14}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-[10px] text-slate-500 w-full">Insert variable:</span>
          {CRM_EMAIL_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-mono text-slate-700 hover:bg-orange-50"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionBar({ sending, canSend, handleSend, onClose, userEmail }) {
  const canTest = isValidEmail(userEmail);
  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
      <button
        type="button"
        disabled={sending || !canSend}
        onClick={() => handleSend(false)}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
      >
        <FaPaperPlane className="h-3.5 w-3.5" />
        {sending ? 'Sending…' : 'Send email'}
      </button>
      <button
        type="button"
        disabled={sending || !canTest}
        onClick={() => handleSend(true)}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        title={canTest ? 'Sends to your admin email via Mailtrap' : 'Admin email required'}
      >
        Send test to myself
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  );
}

export default function CrmSendEmailModal({
  open,
  onClose,
  crmLeadId,
  form,
  user,
  initialTemplateKey = 'sales_call_follow_up',
  onSent,
  onError,
}) {
  const bodyRef = useRef(null);
  const [tab, setTab] = useState('compose');
  const [draft, setDraft] = useState(() => buildDraftForTemplate(initialTemplateKey, form, user));
  const [manualTo, setManualTo] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [serverPreview, setServerPreview] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmNonRecord, setConfirmNonRecord] = useState(false);
  const [pendingSend, setPendingSend] = useState(null);

  const recipientOptions = useMemo(() => getRecipientOptions(form), [form]);
  const template = getTemplateByKey(draft.templateKey);
  const missingRecipient = recipientOptions.length === 0 && !draft.to;

  const canSend = useMemo(() => {
    if (sending || !template.enabled) return false;
    if (!isValidEmail(draft.to)) return false;
    if (!String(draft.subject || '').trim()) return false;
    if (!String(draft.body || '').trim()) return false;
    const ccOk = !draft.cc || draft.cc.split(/[,;]+/).every((e) => !e.trim() || isValidEmail(e.trim()));
    const bccOk = !draft.bcc || draft.bcc.split(/[,;]+/).every((e) => !e.trim() || isValidEmail(e.trim()));
    return ccOk && bccOk;
  }, [draft, sending, template.enabled]);

  useEffect(() => {
    if (!open) return;
    setTab('compose');
    setSuccessMessage('');
    setServerPreview(null);
    setManualTo(false);
    setConfirmNonRecord(false);
    setDraft(buildDraftForTemplate(initialTemplateKey, form, user));
  }, [open, initialTemplateKey, form, user]);

  const payloadFromDraft = (d, sendTest, confirmFlag) => ({
    template_key: d.templateKey,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    body: d.body,
    send_test: sendTest,
    confirm_non_record_recipient: confirmFlag,
  });

  const loadServerPreview = useCallback(async () => {
    if (!crmLeadId) return;
    setPreviewLoading(true);
    try {
      const res = await crmAPI.previewEmail(crmLeadId, payloadFromDraft(draft, false, false));
      setServerPreview(res);
    } catch (err) {
      onError?.(err.message || 'Could not load preview.');
    } finally {
      setPreviewLoading(false);
    }
  }, [crmLeadId, draft, onError]);

  useEffect(() => {
    if (!open || !crmLeadId) return;
    const t = setTimeout(() => loadServerPreview(), 400);
    return () => clearTimeout(t);
  }, [open, crmLeadId, draft.templateKey, draft.subject, draft.body, draft.to, loadServerPreview]);

  const applyTemplate = (key) => {
    const next = buildDraftForTemplate(key, form, user);
    setDraft((d) => ({ ...next, cc: d.cc, bcc: d.bcc }));
    setServerPreview(null);
  };

  const resetToDefault = () => applyTemplate(draft.templateKey);

  const insertVariable = (varName) => {
    const token = `{{${varName}}}`;
    const el = bodyRef.current;
    if (!el) {
      setDraft((d) => ({ ...d, body: `${d.body}${d.body ? '\n' : ''}${token}` }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setDraft((d) => ({
      ...d,
      body: `${d.body.slice(0, start)}${token}${d.body.slice(end)}`,
    }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const executeSend = async (sendTest = false, forceConfirmNonRecord = false) => {
    setSending(true);
    setSuccessMessage('');
    try {
      const res = await crmAPI.sendEmail(
        crmLeadId,
        payloadFromDraft(
          draft,
          sendTest,
          forceConfirmNonRecord || confirmNonRecord || isRecipientOnRecord(form, draft.to),
        ),
      );
      if (res?.crm_notes) onSent?.(res.crm_notes);
      setSuccessMessage(res?.message || (sendTest ? 'Test email sent.' : 'Email sent.'));
      if (!sendTest) {
        setTimeout(() => onClose?.(), 1200);
      }
    } catch (err) {
      onError?.(err.message || 'Failed to send email.');
    } finally {
      setSending(false);
      setPendingSend(null);
    }
  };

  const handleSend = (sendTest = false) => {
    if (!sendTest && !canSend) return;
    if (sendTest && !isValidEmail(user?.email)) return;
    const needsConfirm = !sendTest && !isRecipientOnRecord(form, draft.to);
    if (needsConfirm && !confirmNonRecord) {
      setPendingSend({ sendTest });
      return;
    }
    executeSend(sendTest);
  };

  if (!open) return null;

  const title =
    draft.templateKey === 'custom_email' ? 'Send email' : 'Send sales follow-up email';

  return (
    <>
      <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
        <div
          className="relative z-10 flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-send-email-title"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 bg-gradient-to-r from-white to-orange-50/40">
            <h2 id="crm-send-email-title" className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FaEnvelope className="text-orange-500" aria-hidden />
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <FaTimes />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {successMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-emerald-900">
                <p className="font-semibold">{successMessage}</p>
                <p className="text-sm mt-1 text-emerald-800">
                  Delivered through the API mail provider (Mailtrap when configured).
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4 min-w-0">
                  {missingRecipient ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      This CRM record does not have a recipient email yet. Add a contact email or company email
                      before sending, or enter an address manually.
                    </p>
                  ) : null}

                  <div className="flex gap-2 border-b border-slate-200 lg:hidden">
                    {['compose', 'preview'].map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px capitalize ${
                          tab === id
                            ? 'border-orange-500 text-orange-600'
                            : 'border-transparent text-slate-500'
                        }`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>

                  <ComposeSection
                    tab={tab}
                    draft={draft}
                    setDraft={setDraft}
                    recipientOptions={recipientOptions}
                    manualTo={manualTo}
                    setManualTo={setManualTo}
                    bodyRef={bodyRef}
                    insertVariable={insertVariable}
                    applyTemplate={applyTemplate}
                    resetToDefault={resetToDefault}
                    previewLoading={previewLoading}
                    serverPreview={serverPreview}
                  />

                  <ActionBar
                    sending={sending}
                    canSend={canSend}
                    handleSend={handleSend}
                    onClose={onClose}
                    userEmail={user?.email}
                  />
                </div>

                <div className="hidden lg:block border-l border-slate-100 pl-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Live preview
                  </p>
                  <PreviewPanel loading={previewLoading} preview={serverPreview} draft={draft} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingSend)}
        onClose={() => setPendingSend(null)}
        title="Send to this address?"
        message="This recipient is not saved on the CRM record. Send anyway?"
        confirmLabel="Send email"
        onConfirm={() => {
          setConfirmNonRecord(true);
          executeSend(pendingSend?.sendTest, true);
        }}
      />
    </>
  );
}

function ComposeSection({
  tab,
  draft,
  setDraft,
  recipientOptions,
  manualTo,
  setManualTo,
  bodyRef,
  insertVariable,
  applyTemplate,
  resetToDefault,
  previewLoading,
  serverPreview,
}) {
  return (
    <>
      <div className={tab === 'preview' ? 'lg:hidden' : ''}>
        <ComposeFields
          draft={draft}
          setDraft={setDraft}
          recipientOptions={recipientOptions}
          manualTo={manualTo}
          setManualTo={setManualTo}
          bodyRef={bodyRef}
          insertVariable={insertVariable}
          applyTemplate={applyTemplate}
          resetToDefault={resetToDefault}
        />
      </div>
      <div className={`lg:hidden ${tab === 'compose' ? 'hidden' : ''}`}>
        <PreviewPanel loading={previewLoading} preview={serverPreview} draft={draft} />
      </div>
    </>
  );
}
