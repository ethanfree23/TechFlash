import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FaEllipsisH } from 'react-icons/fa';

const PLACEHOLDER_ACTIONS = new Set([
  'Verify account',
  'Suspend account',
  'Deactivate account',
]);

const MENU_WIDTH = 192;

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
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

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

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (buttonRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn) => {
    setOpen(false);
    fn?.();
  };

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
      className={`w-full text-left px-3 py-1.5 text-xs ${
        opts.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
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
          <div
            ref={menuRef}
            role="menu"
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-[80] w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1 ring-1 ring-black/5"
          >
            {menuItem('Send email', () => onSendEmail?.(user))}
            {menuItem('Send SMS', () => onSendSms?.(user, user.verification?.suggested_sms?.next_gap || ''))}
            {menuItem('Reset password', () => onResetPassword?.(user))}
            {menuItem('Verify account', () => {})}
            {menuItem('Suspend account', () => {})}
            {menuItem('Deactivate account', () => {})}
            <div className="my-1 border-t border-slate-100" />
            {menuItem('Create CRM contact', () => {
              const params = new URLSearchParams({
                prefill_email: user.email || '',
                prefill_name: user.displayName || '',
              });
              navigate(`/crm?${params.toString()}`);
            })}
            {menuItem('Delete user', () => onDelete?.(user), { danger: true })}
          </div>,
          document.body
        )}
    </div>
  );
}
