import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEllipsisH } from 'react-icons/fa';

const PLACEHOLDER_ACTIONS = new Set([
  'Send SMS',
  'Verify account',
  'Suspend account',
  'Deactivate account',
]);

export default function UserRowActionsMenu({
  user,
  onMasquerade,
  onSendEmail,
  onResetPassword,
  onDelete,
  onPlaceholderAction,
  masqueradeBusy,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const run = (fn) => {
    setOpen(false);
    fn?.();
  };

  const canMasquerade = user?.role === 'company' || user?.role === 'technician';

  const menuItem = (label, onClick, opts = {}) => (
    <button
      key={label}
      type="button"
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
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ${
          compact ? 'p-1' : 'p-1.5 border border-transparent hover:border-slate-200'
        }`}
        aria-label="More actions"
      >
        <FaEllipsisH className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-0.5 z-50 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1 ring-1 ring-black/5">
          {menuItem('View profile', () => navigate(`/admin/users/${user.id}`))}
          {canMasquerade && menuItem('Impersonate', () => onMasquerade?.(user.id))}
          <div className="my-1 border-t border-slate-100" />
          {menuItem('Send email', () => onSendEmail?.(user))}
          {menuItem('Send SMS', () => {})}
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
        </div>
      )}
    </div>
  );
}
