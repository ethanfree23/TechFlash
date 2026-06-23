import React from 'react';
import { FaTimes } from 'react-icons/fa';
import { CRM_REMINDER_QUEUE_WHEN_FILTERS, CRM_STATUSES } from '../../utils/crmConstants';

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function reminderTel(phone, companyPhone) {
  const raw = String(phone || companyPhone || '').replace(/\D/g, '');
  return raw.length >= 10 ? raw : '';
}

export default function CrmReminderQueueModal({
  isOpen,
  loading,
  reminders,
  whenFilter,
  statusFilter,
  onWhenFilterChange,
  onStatusFilterChange,
  onClose,
  onOpenCompany,
  onConvertReminder,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crm-reminder-queue-title"
    >
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 id="crm-reminder-queue-title" className="text-lg font-semibold text-gray-900">
            Reminder queue
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-3 shrink-0">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-gray-500 uppercase">Due</span>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[10rem]"
              value={whenFilter}
              onChange={(e) => onWhenFilterChange(e.target.value)}
            >
              {CRM_REMINDER_QUEUE_WHEN_FILTERS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-gray-500 uppercase">Lead status</span>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[10rem] capitalize"
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
            >
              <option value="all">All statuses</option>
              {CRM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1">
          {loading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Loading reminders…</p>
          ) : reminders.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No reminders match these filters.</p>
          ) : (
            <ul className="space-y-3">
              {reminders.map((note) => {
                const tel = reminderTel(note.phone, note.company_phone);
                const summary = note.title || note.body || 'Reminder';
                return (
                  <li
                    key={`queue-${note.id}-${note.crm_lead_id}`}
                    className="rounded-xl border border-amber-100 bg-amber-50/40 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className="rounded bg-white px-2 py-0.5 font-semibold text-slate-800">
                        {formatDateTime(note.remind_at)}
                      </span>
                      <span className="font-semibold text-gray-900">{note.company_name || 'Company'}</span>
                      {note.lead_status ? (
                        <span className="capitalize rounded bg-white px-2 py-0.5 text-gray-700">
                          {String(note.lead_status).replace(/_/g, ' ')}
                        </span>
                      ) : null}
                      <span className="capitalize text-gray-500">
                        {(note.contact_method || 'note').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-800 line-clamp-2">{summary}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                      <button
                        type="button"
                        className="text-blue-700 hover:underline"
                        onClick={() => onOpenCompany(note.crm_lead_id)}
                      >
                        Open company
                      </button>
                      <button
                        type="button"
                        className="text-blue-700 hover:underline"
                        onClick={() => onConvertReminder(note)}
                      >
                        Log activity
                      </button>
                      {tel ? (
                        <a href={`tel:${tel}`} className="text-blue-700 hover:underline">
                          Call
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
