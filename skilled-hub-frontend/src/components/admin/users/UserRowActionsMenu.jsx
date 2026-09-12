import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FaChevronRight, FaEllipsisH } from 'react-icons/fa';

const PLACEHOLDER_ACTIONS = new Set([
  'Verify account',
  'Suspend account',
  'Deactivate account',
]);

const MENU_WIDTH = 208;
const SMS_MENU_WIDTH = 160;
const CLOSE_DELAY_MS = 160;

function SectionDivider() {
  return <div className="my-1.5 border-t border-slate-200" role="separator" />;
}

export default function UserRowActionsMenu({
  user,
  onMasquerade: _onMasquerade,
  onSendEmail,
  onSendSms,
  onResetPassword,
  onDelete,
  onPlaceholderAction,
  masqueradeBusy: _masqueradeBusy,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [smsCoords, setSmsCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const smsItemRef = useRef(null);
  const smsMenuRef = useRef(null);
  const smsCloseTimer = useRef(null);
  const navigate = useNavigate();

  const closeAll = useCallback(() => {
    setOpen(false);
    setSmsOpen(false);
  }, []);

  const cancelSmsClose = useCallback(() => {
    if (smsCloseTimer.current) {
      clearTimeout(smsCloseTimer.current);
      smsCloseTimer.current = null;
    }
  }, []);

  const openSmsMenu = useCallback(() => {
    cancelSmsClose();
    setSmsOpen(true);
  }, [cancelSmsClose]);

  const scheduleSmsClose = useCallback(() => {
    cancelSmsClose();
    smsCloseTimer.current = setTimeout(() => setSmsOpen(false), CLOSE_DELAY_MS);
  }, [cancelSmsClose]);

  const placeMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight || 288;
    const menuWidth = menuRef.current?.offsetWidth || MENU_WIDTH;
    let left = rect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight - 8 && rect.top > menuHeight + 12) {
      top = rect.top - menuHeight - 4;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));
    setCoords({ top, left });
  }, []);

  const placeSmsMenu = useCallback(() => {
    const el = smsItemRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = smsMenuRef.current?.offsetWidth || SMS_MENU_WIDTH;
    const height = smsMenuRef.current?.offsetHeight || 72;
    let left = rect.right + 4;
    if (left + width > window.innerWidth - 8) left = rect.left - width - 4;
    left = Math.max(8, left);
    let top = rect.top;
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    setSmsCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open, placeMenu]);

  useLayoutEffect(() => {
    if (!open || !smsOpen) return undefined;
    placeSmsMenu();
    window.addEventListener('resize', placeSmsMenu);
    window.addEventListener('scroll', placeSmsMenu, true);
    return () => {
      window.removeEventListener('resize', placeSmsMenu);
      window.removeEventListener('scroll', placeSmsMenu, true);
    };
  }, [open, smsOpen, placeSmsMenu]);

  useEffect(() => () => cancelSmsClose(), [cancelSmsClose]);

  useEffect(() => {
    if (!open) {
      setSmsOpen(false);
      return undefined;
    }
    const onClick = (e) => {
      if (
        buttonRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target) ||
        smsMenuRef.current?.contains(e.target)
      ) {
        return;
      }
      closeAll();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (smsOpen) setSmsOpen(false);
      else closeAll();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, smsOpen, closeAll]);

  const run = (fn) => {
    closeAll();
    fn?.();
  };

  const sendSms = (mode) => {
    run(() => onSendSms?.(user, user.verification?.suggested_sms?.next_gap || '', mode));
  };

  const itemClass = (opts = {}) =>
    `w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-xs ${
      opts.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
    } ${opts.active ? 'bg-slate-50' : ''}`;

  const menuItem = (label, onClick, opts = {}) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      onClick={() => {
        if (PLACEHOLDER_ACTIONS.has(label)) {
          run(() => onPlaceholderAction?.(label));
        } else {
          run(onClick);
        }
      }}
      className={itemClass(opts)}
    >
      {label}
    </button>
  );

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) closeAll();
          else setOpen(true);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ${
          compact ? 'p-1' : 'p-1.5 border border-transparent hover:border-slate-200'
        }`}
        aria-label="More actions"
      >
        <FaEllipsisH className="w-3.5 h-3.5" />
      </button>
      {open &&
        createPortal(
          <>
            <div
              ref={menuRef}
              role="menu"
              style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
              className="fixed z-[80] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
            >
              <button
                ref={smsItemRef}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={smsOpen}
                onMouseEnter={openSmsMenu}
                onMouseLeave={scheduleSmsClose}
                onClick={openSmsMenu}
                className={itemClass({ active: smsOpen })}
              >
                Send SMS
                <FaChevronRight className="w-2.5 h-2.5 text-slate-400 shrink-0" aria-hidden />
              </button>
              {menuItem('Send email', () => onSendEmail?.(user))}
              <SectionDivider />
              {menuItem('Verify account', () => {})}
              {menuItem('Suspend account', () => {})}
              {menuItem('Deactivate account', () => {})}
              {menuItem('Reset password', () => onResetPassword?.(user))}
              <SectionDivider />
              {menuItem('Create CRM contact', () => {
                const params = new URLSearchParams({
                  prefill_email: user.email || '',
                  prefill_name: user.displayName || '',
                });
                navigate(`/crm?${params.toString()}`);
              })}
              {menuItem('Delete user', () => onDelete?.(user), { danger: true })}
            </div>
            {smsOpen && (
              <div
                ref={smsMenuRef}
                role="menu"
                style={{ top: smsCoords.top, left: smsCoords.left, width: SMS_MENU_WIDTH }}
                className="fixed z-[81] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
                onMouseEnter={openSmsMenu}
                onMouseLeave={scheduleSmsClose}
              >
                <button type="button" role="menuitem" onClick={() => sendSms('manual')} className={itemClass()}>
                  Manual SMS
                </button>
                <button type="button" role="menuitem" onClick={() => sendSms('ai')} className={itemClass()}>
                  AI SMS
                </button>
              </div>
            )}
          </>,
          document.body
        )}
    </div>
  );
}
