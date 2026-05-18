import { useState, useCallback } from 'react';
import { conversationsAPI } from '../../api/api';

export default function useJobMessaging({ onError }) {
  const [messageConversationId, setMessageConversationId] = useState(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messagingBusy, setMessagingBusy] = useState(false);

  const openConversation = useCallback(
    async (jobId, technicianProfileId = null) => {
      setMessagingBusy(true);
      try {
        const conv = await conversationsAPI.createForJob(jobId, technicianProfileId);
        setMessageConversationId(conv.id);
        setShowMessageModal(true);
      } catch (err) {
        onError?.(err.message || 'Failed to start conversation');
      } finally {
        setMessagingBusy(false);
      }
    },
    [onError]
  );

  const closeMessageModal = useCallback(() => {
    setShowMessageModal(false);
    setMessageConversationId(null);
  }, []);

  return {
    messageConversationId,
    showMessageModal,
    messagingBusy,
    openConversation,
    closeMessageModal,
  };
}
