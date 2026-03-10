import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { conversationsAPI } from '../api/api';
import MessageModal from '../components/MessageModal';
import { auth } from '../auth';

const MessagesPage = ({ user, onLogout }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    conversationsAPI.getAll()
      .then((data) => setConversations(Array.isArray(data) ? data : []))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, []);

  const openConversation = (conv) => {
    setSelectedConversation(conv);
    setShowModal(true);
  };

  const currentUser = user || auth.getUser();

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
              Message a company from a job posting, or start chatting after claiming a job.
            </p>
            <Link to="/jobs" className="inline-block mt-4 text-blue-600 hover:text-blue-800 font-medium">
              Browse Jobs →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => {
              const job = conv.job;
              const otherParty = currentUser?.role === 'technician'
                ? (conv.company_profile?.company_name || 'Company')
                : (conv.technician_profile?.user?.email || conv.technician_profile?.trade_type || 'Technician');
              const lastMsg = conv.messages?.length ? conv.messages[conv.messages.length - 1] : null;
              return (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{job?.title || 'Job'}</h3>
                      <p className="text-sm text-gray-500">with {otherParty}</p>
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
          jobTitle={selectedConversation.job?.title}
          currentUserRole={currentUser?.role}
        />
      )}
    </div>
  );
};

export default MessagesPage;
