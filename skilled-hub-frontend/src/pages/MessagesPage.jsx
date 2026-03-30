import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { conversationsAPI } from '../api/api';
import MessageModal from '../components/MessageModal';
import { auth } from '../auth';

// Admin inbox types (extend when adding e.g. system announcements)
const ADMIN_INBOX_CATEGORIES = [{ id: 'feedback', label: 'Feedback' }];

const MessagesPage = ({ user, onLogout }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [adminCategory, setAdminCategory] = useState('feedback');

  const currentUser = user || auth.getUser();
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    setLoading(true);
    conversationsAPI
      .getAll()
      .then((data) => setConversations(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Failed to load conversations', err);
        setConversations([]);
      })
      .finally(() => setLoading(false));
  }, [currentUser?.id, currentUser?.role]);

  const openConversation = (conv) => {
    setSelectedConversation(conv);
    setShowModal(true);
  };

  const adminFilteredConversations = isAdmin
    ? conversations.filter((c) => (c.inbox_category || (c.conversation_type === 'feedback' ? 'feedback' : 'job')) === adminCategory)
    : conversations;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{currentUser?.email}</span>
              <button
                onClick={onLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading conversations...</div>
        ) : conversations.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-600 mb-4">You have no messages yet.</p>
            <p className="text-sm text-gray-500">
              {isAdmin
                ? 'User feedback from the Feedback button will appear here when received.'
                : 'Message a company from a job posting, or start chatting after claiming a job.'}
            </p>
            {!isAdmin && (
              <Link to="/jobs" className="inline-block mt-4 text-blue-600 hover:text-blue-800 font-medium">
                Browse Jobs →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {isAdmin && (
              <div className="mb-4 flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-gray-600 mr-2">Inbox type</span>
                {ADMIN_INBOX_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setAdminCategory(cat.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      adminCategory === cat.id
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}
            {isAdmin && adminFilteredConversations.length === 0 && conversations.length > 0 ? (
              <div className="bg-white rounded-lg border border-dashed border-gray-200 p-8 text-center text-gray-500 text-sm">
                No items in this category yet.
              </div>
            ) : null}
            {(isAdmin ? adminFilteredConversations : conversations).map((conv) => {
              const job = conv.job;
              const isFeedback = conv.conversation_type === 'feedback';
              const otherParty = currentUser?.role === 'admin'
                ? (conv.technician_profile?.user?.email || conv.company_profile?.company_name || conv.submitter_email || 'User')
                : currentUser?.role === 'technician'
                  ? (conv.company_profile?.company_name || 'Company')
                  : (conv.technician_profile?.user?.email || conv.technician_profile?.trade_type || 'Technician');
              const lastMsg = conv.messages?.length ? conv.messages[conv.messages.length - 1] : null;
              const title = isFeedback
                ? (conv.feedback_kind ? `${conv.feedback_kind.charAt(0).toUpperCase()}${conv.feedback_kind.slice(1)}` : 'Feedback')
                : (job?.title || 'Job');
              return (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      {isFeedback && currentUser?.role === 'admin' && (
                        <span className="inline-block mb-1 px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-800">
                          Feedback
                        </span>
                      )}
                      <h3 className="font-semibold text-gray-900">{title}</h3>
                      <p className="text-sm text-gray-500">{isFeedback ? `From ${otherParty}` : `with ${otherParty}`}</p>
                      {lastMsg && (
                        <p className="text-sm text-gray-600 mt-1 truncate max-w-md">
                          {lastMsg.content}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {lastMsg ? new Date(lastMsg.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {selectedConversation && (
        <MessageModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setSelectedConversation(null); }}
          conversationId={selectedConversation.id}
          jobTitle={
            selectedConversation.conversation_type === 'feedback'
              ? `Feedback (${selectedConversation.feedback_kind || '—'})`
              : selectedConversation.job?.title
          }
          currentUserRole={currentUser?.role}
          isFeedbackThread={selectedConversation.conversation_type === 'feedback'}
        />
      )}
    </div>
  );
};

export default MessagesPage;
