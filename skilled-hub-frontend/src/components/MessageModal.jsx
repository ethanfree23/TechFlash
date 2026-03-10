import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import { conversationsAPI, messagesAPI } from '../api/api';

const MessageModal = ({ isOpen, onClose, conversationId, jobTitle, currentUserRole }) => {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !conversationId) return;
    setLoading(true);
    Promise.all([
      conversationsAPI.getById(conversationId),
      messagesAPI.getByConversation(conversationId),
    ])
      .then(([conv, msgs]) => {
        setConversation(conv);
        setMessages(Array.isArray(msgs) ? msgs : (msgs.messages || []));
      })
      .catch(() => {
        setConversation(null);
        setMessages([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const msg = await messagesAPI.create(conversationId, content);
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
    } catch (err) {
      alert(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const otherPartyName = () => {
    if (!conversation) return '...';
    if (currentUserRole === 'technician') {
      return conversation.company_profile?.company_name || 'Company';
    }
    return conversation.technician_profile?.user?.email || conversation.technician_profile?.trade_type || 'Technician';
  };

  const isFromMe = (msg) => {
    if (!conversation) return false;
    if (currentUserRole === 'technician') {
      return msg.sender_type === 'TechnicianProfile' && String(msg.sender_id) === String(conversation.technician_profile_id);
    }
    return msg.sender_type === 'CompanyProfile' && String(msg.sender_id) === String(conversation.company_profile_id);
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      ariaHideApp={false}
      className="fixed inset-0 flex items-center justify-center z-50"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Messages: {jobTitle || 'Job'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <p className="px-4 py-1 text-sm text-gray-500">
          Chat with {otherPartyName()}
        </p>
        <div className="flex-1 overflow-y-auto p-4 min-h-[200px] max-h-[400px] bg-gray-50">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No messages yet. Start the conversation!</div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${isFromMe(msg) ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      isFromMe(msg)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${isFromMe(msg) ? 'text-blue-100' : 'text-gray-400'}`}>
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        <form onSubmit={handleSend} className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm resize-none"
              rows={2}
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default MessageModal;
