import React from 'react';
import MessageListCard from './MessageListCard';
import MessagesEmptyState from './MessagesEmptyState';
import MessagesLoadingSkeleton from './MessagesLoadingSkeleton';
import MessagesErrorState from './MessagesErrorState';
import MessagesFilteredEmpty from './MessagesFilteredEmpty';
import { SORT_OPTIONS, STATUS_FILTER_OPTIONS, PRIORITY_FILTER_OPTIONS } from './constants';
import { CARD_CLASS, PANEL_HEIGHT, INPUT_CLASS, SELECT_CLASS } from './messagesUi';

export default function InboxPanel({
  tabs,
  activeTab,
  onTabChange,
  tabCounts,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  sortBy,
  onSortChange,
  messages,
  loading,
  loadError,
  onRetry,
  selectedId,
  onSelectMessage,
  isAdmin,
  onCreateTest,
  onContactSupport,
  onClearFilters,
  showEmptyGlobal,
}) {
  return (
    <section
      className={`flex flex-col ${CARD_CLASS} ${PANEL_HEIGHT}`}
      aria-label="Message inbox"
    >
      <div className="p-4 border-b border-gray-100 space-y-3 shrink-0">
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide"
          role="tablist"
          aria-label="Inbox categories"
        >
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onTabChange(tab.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                  selected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
                <span
                  className={`min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                    selected ? 'bg-white/25 text-white' : 'bg-white text-gray-600'
                  }`}
                >
                  {tabCounts[tab.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <label htmlFor="messages-search" className="sr-only">
            Search inbox
          </label>
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="messages-search"
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by subject, sender, or job…"
            className={`${INPUT_CLASS} pl-9 bg-gray-50 focus:bg-white`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className={SELECT_CLASS}
            aria-label="Filter by status"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => onPriorityFilterChange(e.target.value)}
            className={SELECT_CLASS}
            aria-label="Filter by priority"
          >
            {PRIORITY_FILTER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className={SELECT_CLASS}
            aria-label="Sort inbox"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <MessagesLoadingSkeleton />
        ) : loadError && showEmptyGlobal ? (
          <MessagesErrorState onRetry={onRetry} />
        ) : showEmptyGlobal ? (
          <MessagesEmptyState
            isAdmin={isAdmin}
            onCreateTest={onCreateTest}
            onContactSupport={onContactSupport}
          />
        ) : messages.length === 0 ? (
          <MessagesFilteredEmpty onClearFilters={onClearFilters} />
        ) : (
          <ul className="divide-y divide-gray-100" role="listbox" aria-label="Messages">
            {messages.map((msg) => (
              <li key={msg.id} role="option" aria-selected={selectedId === msg.id}>
                <MessageListCard
                  message={msg}
                  isSelected={selectedId === msg.id}
                  onClick={() => onSelectMessage(msg.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
