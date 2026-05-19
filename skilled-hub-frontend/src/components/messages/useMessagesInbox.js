import { useState, useEffect, useMemo, useCallback } from 'react';
import { conversationsAPI, messagesAPI, isProductionHost } from '../../api/api';
import { getSeedMessagesForRole } from './messagesSeedData';
import {
  conversationToInboxMessage,
  mergeMessages,
  filterMessages,
  sortMessages,
  getTabCounts,
  sendConversationReply,
  exportMessagesCsv,
  computeAvgResponseTime,
} from './messagesAdapter';
import { ADMIN_TABS, USER_TABS, TOAST } from './constants';

function mergeAdaptedInboxRow(existing, adapted) {
  return {
    ...existing,
    ...adapted,
    id: existing.id,
    thread: adapted.thread,
    preview: adapted.preview,
    body: adapted.body,
  };
}

export function useMessagesInbox(currentUser, { onNotify } = {}) {
  const role = currentUser?.role || 'technician';
  const isAdmin = role === 'admin';
  const tabs = isAdmin ? ADMIN_TABS : USER_TABS;

  const notify = useCallback(
    (message, variant = 'success') => {
      onNotify?.({ message, variant });
    },
    [onNotify],
  );

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [apiSyncFailed, setApiSyncFailed] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [composerText, setComposerText] = useState('');
  const [replyMode, setReplyMode] = useState('public');
  const [initialized, setInitialized] = useState(false);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const seeds = isProductionHost ? [] : getSeedMessagesForRole(role);

    try {
      const data = await conversationsAPI.getAll();
      const convs = Array.isArray(data) ? data : [];
      const adapted = convs.map((c) => conversationToInboxMessage(c, role));
      setMessages(mergeMessages(seeds, adapted));
      setApiSyncFailed(false);
    } catch {
      setMessages(seeds);
      setLoadError(true);
      setApiSyncFailed(true);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    setInitialized(false);
    setSelectedId(null);
    setViewMode('list');
    fetchInbox();
  }, [fetchInbox, currentUser?.id]);

  useEffect(() => {
    if (!loading && !initialized && messages.length > 0) {
      setSelectedId(messages[0].id);
      setInitialized(true);
    }
  }, [loading, initialized, messages]);

  const tabCounts = useMemo(() => getTabCounts(messages, tabs), [messages, tabs]);

  const filteredMessages = useMemo(() => {
    const filtered = filterMessages(messages, {
      tab: activeTab,
      tabs,
      search,
      statusFilter: statusFilter === 'all' ? null : statusFilter,
      priorityFilter: priorityFilter === 'all' ? null : priorityFilter,
      isAdmin,
    });
    return sortMessages(filtered, sortBy);
  }, [messages, activeTab, tabs, search, statusFilter, priorityFilter, sortBy, isAdmin]);

  const selectedMessage = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId],
  );

  const kpis = useMemo(() => {
    const isActive = (m) => m.status !== 'archived' && m.status !== 'resolved';
    const open = messages.filter((m) => m.status === 'open').length;
    const problems = messages.filter((m) => m.type === 'problem' && isActive(m)).length;
    const suggestions = messages.filter((m) => m.type === 'suggestion' && isActive(m)).length;
    return {
      openMessages: open,
      problems,
      suggestions,
      avgResponseTime: computeAvgResponseTime(messages),
    };
  }, [messages]);

  const clearFilters = useCallback(() => {
    setActiveTab('all');
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setSortBy('newest');
  }, []);

  const applyConversationPatch = useCallback(
    async (msg, payload, { optimistic } = {}) => {
      if (!msg?.sourceConversationId) return false;
      const snapshot = { ...msg };
      if (optimistic) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msg.id) return m;
            const next = { ...m };
            if (payload.inbox_status != null) next.status = payload.inbox_status;
            if (payload.priority != null) next.priority = payload.priority;
            if (Object.prototype.hasOwnProperty.call(payload, 'assigned_to_id')) {
              next.assignedToId = payload.assigned_to_id;
              if (payload.assigned_to_id == null) next.assignedTo = null;
            }
            if (payload.mark_read) next.isUnread = false;
            return next;
          }),
        );
      }
      try {
        const conv = await conversationsAPI.update(msg.sourceConversationId, payload);
        const adapted = conversationToInboxMessage(conv, role);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? mergeAdaptedInboxRow(m, adapted) : m)),
        );
        return true;
      } catch {
        if (optimistic) {
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? snapshot : m)));
        }
        notify(TOAST.syncFailed, 'error');
        return false;
      }
    },
    [role, notify],
  );

  const refreshThreadFromApi = useCallback(
    async (msg) => {
      if (!msg?.sourceConversationId) return;
      setDetailLoading(true);
      try {
        const [conv, msgsRaw] = await Promise.all([
          conversationsAPI.getById(msg.sourceConversationId),
          messagesAPI.getByConversation(msg.sourceConversationId),
        ]);
        const msgs = Array.isArray(msgsRaw) ? msgsRaw : msgsRaw?.messages || conv?.messages || [];
        const updated = conversationToInboxMessage({ ...conv, messages: msgs }, role);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? mergeAdaptedInboxRow(m, updated) : m)),
        );
      } catch {
        notify(TOAST.threadSyncFailed, 'error');
      } finally {
        setDetailLoading(false);
      }
    },
    [role, notify],
  );

  const selectMessage = useCallback(
    (id) => {
      setSelectedId(id);
      setViewMode('detail');
      setComposerText('');
      const msg = messages.find((m) => m.id === id);
      if (msg?.isFeedbackThread && msg?.isUnread && msg?.sourceConversationId) {
        conversationsAPI
          .markRead(msg.sourceConversationId)
          .then((conv) => {
            const adapted = conversationToInboxMessage(conv, role);
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? mergeAdaptedInboxRow(m, adapted) : m)),
            );
          })
          .catch(() => {
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, isUnread: false } : m)),
            );
          });
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isUnread: false } : m)),
        );
      }
      if (msg?.sourceConversationId) {
        refreshThreadFromApi(msg);
      }
    },
    [messages, role, refreshThreadFromApi],
  );

  const backToList = useCallback(() => {
    setViewMode('list');
  }, []);

  const updateMessage = useCallback((id, updater) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updater(m) } : m)),
    );
  }, []);

  const sendReply = useCallback(
    async (text, options = {}) => {
      if (!selectedId || !text?.trim()) return false;
      const msg = messages.find((m) => m.id === selectedId);
      if (!msg) return false;

      const isInternal = options.internal || replyMode === 'internal';

      if (msg.sourceConversationId && (msg.isFeedbackThread || !isInternal)) {
        try {
          await sendConversationReply(msg.sourceConversationId, text.trim(), { internal: isInternal });
          await refreshThreadFromApi(msg);
          setComposerText('');
          notify(isInternal ? TOAST.noteAdded : TOAST.replySent, 'success');
          return true;
        } catch {
          notify(TOAST.replyFailed, 'error');
          return false;
        }
      }

      if (!isInternal && msg.sourceConversationId && !msg.isFeedbackThread) {
        try {
          await sendConversationReply(msg.sourceConversationId, text.trim());
        } catch {
          notify(TOAST.replyFailed, 'error');
          return false;
        }
      }

      const senderName = currentUser?.email?.split('@')[0] || 'You';
      const threadItem = {
        id: `local-${Date.now()}`,
        senderName,
        senderRole: role,
        body: text.trim(),
        isInternalNote: isInternal,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === selectedId
            ? {
                ...m,
                thread: [...(m.thread || []), threadItem],
                preview: threadItem.body.slice(0, 120),
                updatedAt: threadItem.createdAt,
                isUnread: false,
              }
            : m,
        ),
      );
      setComposerText('');
      notify(isInternal ? TOAST.noteAdded : TOAST.replySent, 'success');
      return true;
    },
    [selectedId, messages, replyMode, role, currentUser, refreshThreadFromApi, notify],
  );

  const patchSelectedInbox = useCallback(
    (payload) => {
      const msg = messages.find((m) => m.id === selectedId);
      if (!msg) return Promise.resolve(false);
      return applyConversationPatch(msg, payload, { optimistic: true });
    },
    [messages, selectedId, applyConversationPatch],
  );

  const markResolved = useCallback(() => {
    if (!selectedId) return;
    patchSelectedInbox({ inbox_status: 'resolved' }).then((ok) => {
      if (ok) notify(TOAST.markedResolved, 'success');
    });
  }, [selectedId, patchSelectedInbox, notify]);

  const archiveMessage = useCallback(() => {
    if (!selectedId) return;
    patchSelectedInbox({ inbox_status: 'archived' }).then((ok) => {
      if (ok) notify(TOAST.archived, 'success');
    });
  }, [selectedId, patchSelectedInbox, notify]);

  const setPriority = useCallback(
    (priority) => {
      if (!selectedId) return;
      patchSelectedInbox({ priority }).then((ok) => {
        if (ok) notify(TOAST.priorityUpdated, 'info');
      });
    },
    [selectedId, patchSelectedInbox, notify],
  );

  const setStatus = useCallback(
    (status) => {
      if (!selectedId) return;
      patchSelectedInbox({ inbox_status: status }).then((ok) => {
        if (ok) notify(TOAST.statusUpdated, 'info');
      });
    },
    [selectedId, patchSelectedInbox, notify],
  );

  const assignTo = useCallback(
    (assignee) => {
      if (!selectedId) return;
      const msg = messages.find((m) => m.id === selectedId);
      if (!msg) return;
      const assigned_to_id = assignee === 'Admin' ? currentUser?.id ?? null : null;
      applyConversationPatch(msg, { assigned_to_id }, { optimistic: true }).then((ok) => {
        if (ok) notify(assignee ? TOAST.assigned : TOAST.unassigned, 'info');
      });
    },
    [selectedId, messages, currentUser?.id, applyConversationPatch, notify],
  );

  const deleteMessage = useCallback(() => {
    if (!selectedId) return;
    const remaining = messages.filter((m) => m.id !== selectedId);
    setMessages(remaining);
    const nextId = remaining[0]?.id ?? null;
    setSelectedId(nextId);
    if (!nextId) setViewMode('list');
    notify(TOAST.deleted, 'success');
  }, [selectedId, messages, notify]);

  const addMessage = useCallback(
    (newMsg) => {
      const id = newMsg.id || `local-${Date.now()}`;
      const item = {
        ...newMsg,
        id,
        createdAt: newMsg.createdAt || new Date().toISOString(),
        updatedAt: newMsg.updatedAt || new Date().toISOString(),
        thread: newMsg.thread || [
          {
            id: `t-${Date.now()}`,
            senderName: newMsg.senderName || 'You',
            senderRole: newMsg.senderRole || role,
            body: newMsg.body || newMsg.preview,
            isInternalNote: false,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      setMessages((prev) => [item, ...prev]);
      setSelectedId(id);
      setViewMode('detail');
      notify(TOAST.messageSent, 'success');
    },
    [role, notify],
  );

  const exportCsv = useCallback(() => {
    const csv = exportMessagesCsv(filteredMessages);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `techflash-messages-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(TOAST.exported, 'success');
  }, [filteredMessages, notify]);

  return {
    role,
    isAdmin,
    tabs,
    messages,
    loading,
    detailLoading,
    loadError,
    apiSyncFailed,
    reload: fetchInbox,
    selectedId,
    selectedMessage,
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab,
    tabCounts,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    sortBy,
    setSortBy,
    filteredMessages,
    kpis,
    selectMessage,
    backToList,
    clearFilters,
    composerText,
    setComposerText,
    replyMode,
    setReplyMode,
    sendReply,
    markResolved,
    archiveMessage,
    setPriority,
    setStatus,
    assignTo,
    deleteMessage,
    addMessage,
    exportCsv,
  };
}
