import React from 'react';
import InboxPanel from './InboxPanel';
import MessageDetailPanel from './MessageDetailPanel';

export default function MessagesInboxLayout({
  inbox,
  detail,
  viewMode,
  onComposeMobile,
}) {
  const showList = viewMode === 'list';
  const showDetail = viewMode === 'detail';

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-stretch">
        <div className={`lg:col-span-5 flex flex-col ${showDetail ? 'hidden lg:flex' : 'flex'}`}>
          <InboxPanel {...inbox} />
        </div>
        <div className={`lg:col-span-7 flex flex-col ${showList ? 'hidden lg:flex' : 'flex'}`}>
          <MessageDetailPanel {...detail} showBack={showDetail} />
        </div>
      </div>

      <button
        type="button"
        onClick={onComposeMobile}
        className="lg:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-tf-orange text-white shadow-lg hover:bg-tf-orange-hover active:scale-95 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-tf-orange transition-transform"
        aria-label="Compose new message"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </>
  );
}
