import React, { useState } from 'react';
import Modal from 'react-modal';
import { useLocation } from 'react-router-dom';
import { feedbackAPI } from '../../api/api';
import { FEEDBACK_TYPE_OPTIONS } from './constants';
import { INPUT_CLASS, SELECT_CLASS, BTN_PRIMARY, BTN_SECONDARY } from './messagesUi';
import AlertModal from '../AlertModal';

export default function FeedbackModal({ isOpen, onClose, user, onLocalSubmit, isAdmin }) {
  const location = useLocation();
  const [messageType, setMessageType] = useState('problem');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = [subject.trim(), body.trim()].filter(Boolean).join('\n\n');
    if (!text || sending) return;

    setSending(true);
    try {
      if (messageType === 'problem' || messageType === 'suggestion') {
        await feedbackAPI.create({
          kind: messageType,
          body: text,
          page_path: `${location.pathname}${location.search || ''}`,
        });
      } else {
        // TODO: API support for general/feedback message types
        onLocalSubmit?.({
          type: messageType === 'general' ? 'general' : 'feedback',
          subject: subject.trim() || 'Feedback',
          preview: body.trim().slice(0, 120),
          body: body.trim(),
          senderName: user?.email?.split('@')[0] || 'You',
          senderEmail: user?.email || '',
          senderRole: user?.role || 'company',
          recipientName: 'TechFlash Admin',
          recipientRole: 'admin',
          status: 'open',
          priority: 'normal',
          isUnread: true,
        });
      }

      setSubject('');
      setBody('');
      onClose();
      setAlertModal({
        isOpen: true,
        title: 'Sent',
        message: 'Thanks — your message was submitted.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not send',
        message: err.message || 'Something went wrong. Try again later.',
        variant: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onRequestClose={onClose}
        contentLabel="Send feedback"
        ariaHideApp={false}
        className="fixed inset-0 z-[110] flex items-center justify-center p-4"
        overlayClassName="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110]"
        closeTimeoutMS={200}
      >
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[min(90vh,100dvh)] overflow-y-auto border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
            <h2 className="text-lg font-semibold text-gray-900">
              {isAdmin ? 'Submit test feedback' : 'Send feedback'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Tell us about a problem, share an idea, or send a general note to the team.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Message type</label>
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value)}
                className={SELECT_CLASS}
              >
                {FEEDBACK_TYPE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={4}
                placeholder="Describe the issue or share your feedback..."
                className={`${INPUT_CLASS} resize-none`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Screenshot / file (optional)
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700"
                onChange={() => {
                  // TODO: upload attachment when API supports it
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className={BTN_SECONDARY}>
                Cancel
              </button>
              <button type="submit" disabled={sending || !body.trim()} className={BTN_PRIMARY}>
                {sending ? 'Sending…' : 'Submit feedback'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((a) => ({ ...a, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </>
  );
}
