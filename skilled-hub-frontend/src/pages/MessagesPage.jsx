import React, { useState, useCallback } from 'react';
import AppHeader from '../components/AppHeader';
import ConfirmModal from '../components/ConfirmModal';
import { auth } from '../auth';
import { useMessagesInbox } from '../components/messages/useMessagesInbox';
import { useToast } from '../components/messages/useToast';
import MessagesHeader from '../components/messages/MessagesHeader';
import MessagesKpiRow from '../components/messages/MessagesKpiRow';
import MessagesInboxLayout from '../components/messages/MessagesInboxLayout';
import MessagesToast from '../components/messages/MessagesToast';
import ComposeModal from '../components/messages/ComposeModal';
import FeedbackModal from '../components/messages/FeedbackModal';

const MessagesPage = ({ user, onLogout }) => {
  const currentUser = user || auth.getUser();
  const { toasts, push, dismiss } = useToast();
  const handleNotify = useCallback(({ message, variant }) => push(message, variant), [push]);

  const inbox = useMessagesInbox(currentUser, { onNotify: handleNotify });
  const [composeOpen, setComposeOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const showEmptyGlobal = !inbox.loading && !inbox.loadError && inbox.messages.length === 0;

  const handleCreateTest = () => setComposeOpen(true);

  const handleContactSupport = () => {
    setFeedbackOpen(true);
  };

  const handleDeleteConfirm = () => {
    inbox.deleteMessage();
    setDeleteConfirmOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={currentUser} onLogout={onLogout} activePage="messages" emailVariant="welcome" />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 sm:pb-8">
        <MessagesHeader
          role={inbox.role}
          isAdmin={inbox.isAdmin}
          onCompose={() => setComposeOpen(true)}
          onExport={inbox.exportCsv}
        />

        {inbox.isAdmin && <MessagesKpiRow kpis={inbox.kpis} />}

        {inbox.apiSyncFailed && !inbox.loading && inbox.messages.length > 0 && (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            <span>Some conversations could not be synced. You may be viewing cached or sample data.</span>
            <button
              type="button"
              onClick={inbox.reload}
              className="font-semibold text-amber-900 underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
            >
              Retry sync
            </button>
          </div>
        )}

        <MessagesInboxLayout
          viewMode={inbox.viewMode}
          onComposeMobile={() => setComposeOpen(true)}
          inbox={{
            tabs: inbox.tabs,
            activeTab: inbox.activeTab,
            onTabChange: inbox.setActiveTab,
            tabCounts: inbox.tabCounts,
            search: inbox.search,
            onSearchChange: inbox.setSearch,
            statusFilter: inbox.statusFilter,
            onStatusFilterChange: inbox.setStatusFilter,
            priorityFilter: inbox.priorityFilter,
            onPriorityFilterChange: inbox.setPriorityFilter,
            sortBy: inbox.sortBy,
            onSortChange: inbox.setSortBy,
            messages: inbox.filteredMessages,
            loading: inbox.loading,
            loadError: inbox.loadError,
            onRetry: inbox.reload,
            selectedId: inbox.selectedId,
            onSelectMessage: inbox.selectMessage,
            isAdmin: inbox.isAdmin,
            onCreateTest: handleCreateTest,
            onContactSupport: handleContactSupport,
            onClearFilters: inbox.clearFilters,
            showEmptyGlobal,
          }}
          detail={{
            message: inbox.selectedMessage,
            isAdmin: inbox.isAdmin,
            detailLoading: inbox.detailLoading,
            onBack: inbox.backToList,
            composerText: inbox.composerText,
            onComposerChange: inbox.setComposerText,
            replyMode: inbox.replyMode,
            onReplyModeChange: inbox.setReplyMode,
            onSend: inbox.sendReply,
            onMarkResolved: inbox.markResolved,
            onArchive: inbox.archiveMessage,
            onCannedSelect: inbox.setComposerText,
            onAssign: inbox.assignTo,
            onPriorityChange: inbox.setPriority,
            onStatusChange: inbox.setStatus,
            onDeleteRequest: () => setDeleteConfirmOpen(true),
            onPlaceholderAction: (action) => push(`"${action}" will be available when connected to the backend.`, 'info'),
          }}
        />
      </main>

      <ComposeModal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        isAdmin={inbox.isAdmin}
        currentUser={currentUser}
        onSubmit={inbox.addMessage}
      />

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        user={currentUser}
        isAdmin={inbox.isAdmin}
        onLocalSubmit={inbox.addMessage}
      />

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete this message?"
        message="This removes the conversation from your inbox. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
      />

      <MessagesToast toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default MessagesPage;
