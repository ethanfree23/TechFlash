import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import { MESSAGE_TYPES, MESSAGE_PRIORITIES } from './constants';
import { INPUT_CLASS, SELECT_CLASS, BTN_PRIMARY, BTN_SECONDARY } from './messagesUi';

const ADMIN_RECIPIENT_TYPES = [
  { id: 'technician', label: 'Technician' },
  { id: 'company', label: 'Company' },
  { id: 'all_technicians', label: 'All technicians' },
  { id: 'all_companies', label: 'All companies' },
  { id: 'everyone', label: 'Everyone' },
];

const USER_MESSAGE_TYPES = [
  { id: 'general', label: 'General' },
  { id: 'job', label: 'Job Message' },
  { id: 'support', label: 'Support' },
];

export default function ComposeModal({ isOpen, onClose, isAdmin, onSubmit, currentUser }) {
  const [recipientType, setRecipientType] = useState('technician');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [messageType, setMessageType] = useState(isAdmin ? 'general' : 'general');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [relatedJob, setRelatedJob] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;

    const payload = {
      type: messageType,
      subject: subject.trim(),
      preview: body.trim().slice(0, 120),
      body: body.trim(),
      senderName: currentUser?.email?.split('@')[0] || 'You',
      senderEmail: currentUser?.email || '',
      senderRole: currentUser?.role || 'company',
      recipientName: isAdmin ? recipientType : 'TechFlash Support',
      recipientRole: isAdmin ? recipientType : 'admin',
      status: 'open',
      priority,
      isUnread: false,
      relatedJobId: relatedJob || null,
      relatedCompanyId: null,
      relatedTechnicianId: null,
      assignedTo: null,
    };

    // TODO: POST /messages for broadcast compose
    onSubmit(payload);
    setSubject('');
    setBody('');
    setRelatedJob('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Compose message"
      ariaHideApp={false}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      overlayClassName="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
      closeTimeoutMS={200}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="compose-modal-title" className="text-lg font-semibold text-gray-900">New message</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isAdmin ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Recipient type</label>
                <select
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {ADMIN_RECIPIENT_TYPES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Recipient search</label>
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className={SELECT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Message type</label>
                <select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {Object.keys(MESSAGE_TYPES).map((t) => (
                    <option key={t} value={t}>
                      {MESSAGE_TYPES[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {Object.keys(MESSAGE_PRIORITIES).map((p) => (
                    <option key={p} value={p}>
                      {MESSAGE_PRIORITIES[p].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Related job (optional)</label>
                <input
                  type="text"
                  value={relatedJob}
                  onChange={(e) => setRelatedJob(e.target.value)}
                  placeholder="Job ID"
                  className={SELECT_CLASS}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Message type</label>
                <select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {USER_MESSAGE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {messageType === 'job' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Related job</label>
                  <input
                    type="text"
                    value={relatedJob}
                    onChange={(e) => setRelatedJob(e.target.value)}
                    placeholder="Select or enter job ID"
                    className={SELECT_CLASS}
                  />
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={5}
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button type="submit" className={BTN_PRIMARY}>
              Send message
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
