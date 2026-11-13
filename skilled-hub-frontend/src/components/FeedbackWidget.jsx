import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import FeedbackModal from './messages/FeedbackModal';
import { auth } from '../auth';

const DRAG_THRESHOLD_PX = 5;
const EDGE_PADDING_PX = 8;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const FeedbackWidget = ({ user, onLocalSubmit }) => {
  const [open, setOpen] = useState(false);
  // In-memory only: dismissed state clears on full page refresh so the button returns.
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const currentUser = user || auth.getUser();
  const isLoggedIn = Boolean(currentUser && auth.isAuthenticated());
  const isAdmin = currentUser?.role === 'admin';

  const endDrag = useCallback((target, pointerId) => {
    const drag = dragRef.current;
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (target && pointerId != null) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    return drag;
  }, []);

  useEffect(() => {
    if (!position) return undefined;

    const keepInViewport = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const maxX = Math.max(EDGE_PADDING_PX, window.innerWidth - rect.width - EDGE_PADDING_PX);
      const maxY = Math.max(EDGE_PADDING_PX, window.innerHeight - rect.height - EDGE_PADDING_PX);
      setPosition((prev) => {
        if (!prev) return prev;
        const nextX = clamp(prev.x, EDGE_PADDING_PX, maxX);
        const nextY = clamp(prev.y, EDGE_PADDING_PX, maxY);
        if (nextX === prev.x && nextY === prev.y) return prev;
        return { x: nextX, y: nextY };
      });
    };

    window.addEventListener('resize', keepInViewport);
    return () => window.removeEventListener('resize', keepInViewport);
  }, [position]);

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('[data-feedback-dismiss]')) return;

    const el = rootRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

    drag.moved = true;
    const maxX = Math.max(EDGE_PADDING_PX, window.innerWidth - drag.width - EDGE_PADDING_PX);
    const maxY = Math.max(EDGE_PADDING_PX, window.innerHeight - drag.height - EDGE_PADDING_PX);
    setPosition({
      x: clamp(drag.originLeft + dx, EDGE_PADDING_PX, maxX),
      y: clamp(drag.originTop + dy, EDGE_PADDING_PX, maxY),
    });
  };

  const onPointerUp = (e) => {
    const drag = endDrag(e.currentTarget, e.pointerId);
    if (drag?.moved) {
      suppressClickRef.current = true;
    }
  };

  const onPointerCancel = (e) => {
    const drag = endDrag(e.currentTarget, e.pointerId);
    if (drag?.moved) {
      suppressClickRef.current = true;
    }
  };

  const consumeSuppressedClick = () => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  };

  const handleDismiss = (e) => {
    e.preventDefault();
    e.stopPropagation();
    endDrag(null, null);
    setOpen(false);
    setDismissed(true);
  };

  if (dismissed) return null;

  const positionStyle = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : undefined;

  const pillClassName =
    'inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-xs font-semibold text-white bg-tf-orange hover:bg-tf-orange-hover shadow-md transition-colors focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-tf-orange cursor-grab active:cursor-grabbing touch-none select-none';

  return (
    <>
      <div
        ref={rootRef}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-[100]"
        style={positionStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className={pillClassName} role="group" aria-label={isAdmin ? 'Test Feedback' : 'Feedback'}>
          {!isLoggedIn ? (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 py-0.5"
              onClick={(e) => {
                if (consumeSuppressedClick()) e.preventDefault();
              }}
            >
              Feedback
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (consumeSuppressedClick()) return;
                setOpen(true);
              }}
              className="inline-flex items-center gap-1.5 py-0.5 focus:outline-none"
              aria-label={isAdmin ? 'Test Feedback' : 'Feedback'}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
          <button
            type="button"
            data-feedback-dismiss
            onClick={handleDismiss}
            onPointerDown={(e) => e.stopPropagation()}
            className="ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-black/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Dismiss feedback button"
            title="Dismiss until page refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
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
