import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import FeedbackModal from './messages/FeedbackModal';
import { auth } from '../auth';

const FeedbackWidget = ({ user, onLocalSubmit }) => {
  const [open, setOpen] = useState(false);
  const currentUser = user || auth.getUser();
  const isLoggedIn = Boolean(currentUser && auth.isAuthenticated());
  const isAdmin = currentUser?.role === 'admin';

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[100]">
        {!isLoggedIn ? (
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white bg-tf-orange hover:bg-tf-orange-hover shadow-md transition-colors"
          >
            Feedback
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white bg-tf-orange hover:bg-tf-orange-hover shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-tf-orange"
            aria-label={isAdmin ? 'Test Feedback' : 'Feedback'}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            {isAdmin ? 'Test Feedback' : 'Feedback'}
          </button>
        )}
      </div>

      {isLoggedIn && (
        <FeedbackModal
          isOpen={open}
          onClose={() => setOpen(false)}
          user={currentUser}
          isAdmin={isAdmin}
          onLocalSubmit={onLocalSubmit}
        />
      )}
    </>
  );
};

export default FeedbackWidget;
