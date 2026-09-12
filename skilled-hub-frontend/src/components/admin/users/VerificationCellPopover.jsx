import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const CLOSE_DELAY_MS = 180;

export default function VerificationCellPopover({
  ariaLabel,
  trigger,
  children,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimer = useRef(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [pinned, cancelClose]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    const panel = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = panel?.offsetWidth || 320;
    const height = panel?.offsetHeight || 240;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8 && rect.top > height + 12) {
      top = rect.top - height - 6;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place, children]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setOpen(false);
      }
    };
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  if (disabled) return trigger;

  return (
    <div
      ref={triggerRef}
      className="relative min-w-0"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => {
        cancelClose();
        setOpen(true);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setPinned(true);
        setOpen(true);
      }}
    >
      <button
        type="button"
        className="block max-w-full text-left"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-[90] w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-lg ring-1 ring-black/5"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}
