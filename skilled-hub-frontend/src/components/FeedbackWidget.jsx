import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { feedbackAPI } from '../api/api';
import AlertModal from './AlertModal';
import { auth } from '../auth';

const FeedbackWidget = ({ user }) => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('problem');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'success',
  });

  const currentUser = user || auth.getUser();
  const isLoggedIn = Boolean(currentUser && auth.isAuthenticated());

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await feedbackAPI.create({
        kind,
        body: text,
        page_path: `${location.pathname}${location.search || ''}`,
      });
      setBody('');
      setOpen(false);
      setAlertModal({
        isOpen: true,
        title: 'Sent',
        message: 'Thanks — your feedback was sent to the team.',
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
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2">
        {open && (
          <div
            className="w-[min(100vw-2rem,22rem)] rounded-2xl border-2 border-orange-100 shadow-2xl shadow-orange-100/40 overflow-hidden backdrop-blur-md"
            style={{
              background: 'linear-gradient(180deg, rgba(247, 247, 247, 0.95) 0%, rgba(254, 103, 17, 0.08) 100%)',
            }}
          >
            <div className="p-4 border-b border-orange-100/80 flex justify-between items-start gap-2">
              <div>
                <h2 className="text-base font-bold text-gray-800">Feedback</h2>
                <p className="text-xs text-gray-600 mt-0.5">Report a problem or share an idea.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-gray-500 hover:bg-white/80 hover:text-gray-800"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!isLoggedIn ? (
              <div className="p-4 text-sm text-gray-700">
                <p className="mb-3">Log in to send feedback so we can follow up if needed.</p>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#FE6711] hover:bg-[#e55a0a] shadow-md shadow-orange-200/50"
                  onClick={() => setOpen(false)}
                >
                  Log in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-4 space-y-3">
                <div className="flex rounded-xl bg-white/70 p-1 border border-orange-100/80">
                  <button
                    type="button"
                    onClick={() => setKind('problem')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                      kind === 'problem'
                        ? 'bg-[#FE6711] text-white shadow'
                        : 'text-gray-600 hover:bg-white/80'
                    }`}
                  >
                    Problem
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind('suggestion')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                      kind === 'suggestion'
                        ? 'bg-[#FE6711] text-white shadow'
                        : 'text-gray-600 hover:bg-white/80'
                    }`}
                  >
                    Suggestion
                  </button>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  maxLength={10000}
                  required
                  placeholder="Describe what happened or what you’d like to see…"
                  className="w-full rounded-xl border border-orange-100/80 bg-white/90 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FE6711]/40 resize-y min-h-[100px]"
                />
                <button
                  type="submit"
                  disabled={sending || !body.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#FE6711] hover:bg-[#e55a0a] disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-orange-200/50"
                >
                  {sending ? 'Sending…' : 'Send to admin'}
                </button>
              </form>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-4 pr-5 py-3 rounded-full text-sm font-semibold text-white bg-[#FE6711] hover:bg-[#e55a0a] shadow-lg shadow-orange-300/40 hover:shadow-orange-400/50 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FE6711]"
          aria-expanded={open}
          aria-label={open ? 'Close feedback' : 'Open feedback'}
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          Feedback
        </button>
      </div>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((a) => ({ ...a, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </>
  );
};

export default FeedbackWidget;
