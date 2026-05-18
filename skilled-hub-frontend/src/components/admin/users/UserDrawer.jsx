import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FaTimes, FaEnvelope, FaExternalLinkAlt } from 'react-icons/fa';
import { adminUsersAPI } from '../../../api/api';
import UserTypeBadge from './UserTypeBadge';
import UserStatusBadge from './UserStatusBadge';
import UserVerificationBadge from './UserVerificationBadge';
import UserRowActionsMenu from './UserRowActionsMenu';
import { DrawerSkeleton } from './UsersSkeleton';
import {
  enrichUserRow,
  buildActivityTimeline,
  computeProfileCompleteness,
  formatRelativeTime,
  displayOrFallback,
} from '../../../utils/adminUsersDisplayAdapter';

const NOTES_KEY_PREFIX = 'admin_user_notes_';

function loadNotes(userId) {
  try {
    return JSON.parse(localStorage.getItem(`${NOTES_KEY_PREFIX}${userId}`) || '[]');
  } catch {
    return [];
  }
}

function saveNotes(userId, notes) {
  localStorage.setItem(`${NOTES_KEY_PREFIX}${userId}`, JSON.stringify(notes));
}

function StatCard({ label, value, muted }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 tabular-nums ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function OverviewCards({ detail, row }) {
  const role = detail?.role_key || row?.role;
  if (role === 'technician') {
    const jobs = detail?.jobs || {};
    const payments = detail?.payments || {};
    const ratings = detail?.ratings?.received;
    const ratingVal = ratings?.average
      ? `${Number(ratings.average).toFixed(1)} (${ratings.count || 0})`
      : 'Not provided';
    return (
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Accepted" value={jobs.accepted_total ?? '—'} />
        <StatCard label="Completed" value={jobs.completed_total ?? '—'} />
        <StatCard label="Canceled" value={jobs.canceled_total ?? '—'} muted={jobs.canceled_total == null} />
        <StatCard label="Rating" value={ratingVal} muted={!ratings?.average} />
        <StatCard
          label="Earnings"
          value={payments.total_cents != null ? `$${(payments.total_cents / 100).toFixed(0)}` : 'Not provided'}
          muted={payments.total_cents == null}
        />
        <StatCard label="Verification" value={displayOrFallback(row?.verificationStatus, 'Not verified')} />
      </div>
    );
  }
  if (role === 'company') {
    const jobs = detail?.jobs || {};
    const payments = detail?.payments || {};
    const profile = detail?.user?.profile;
    return (
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Posted" value={jobs.total ?? '—'} />
        <StatCard label="Filled" value={jobs.by_status?.filled ?? jobs.by_status?.completed ?? '—'} />
        <StatCard label="Active" value={jobs.by_status?.open ?? jobs.in_period ?? '—'} />
        <StatCard
          label="Spend"
          value={payments.total_cents != null ? `$${(payments.total_cents / 100).toFixed(0)}` : 'Not provided'}
          muted={payments.total_cents == null}
        />
        <StatCard label="Plan" value={displayOrFallback(profile?.membership_level, 'Free')} />
        <StatCard label="Invoices" value="Not provided" muted />
      </div>
    );
  }
  return null;
}

function DrawerSection({ title, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-200/80 bg-white p-3 ${className}`}>
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</h4>
      {children}
    </section>
  );
}

export default function UserDrawer({
  userId,
  listRow,
  onClose,
  onSendEmail,
  onMasquerade,
  onResetPassword,
  onDelete,
  onPlaceholderAction,
  masqueradeBusyId,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');

  const loadDetail = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await adminUsersAPI.get(userId, '30d');
      setDetail(res);
    } catch {
      setDetail(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      setNotes(loadNotes(userId));
      loadDetail();
    }
  }, [userId, loadDetail]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!userId) return null;

  const row = listRow
    ? enrichUserRow(listRow, detail)
    : detail?.user
      ? enrichUserRow({ ...detail.user, logins_last_30_days: detail.logins?.total_in_period }, detail)
      : null;

  const completeness = row ? computeProfileCompleteness(row, detail) : null;
  const timeline = detail ? buildActivityTimeline(detail) : [];
  const lastEmail = detail?.email_deliveries?.recent?.[0];

  const addNote = () => {
    if (!noteText.trim()) return;
    // TODO(admin-users): persist admin notes via backend API
    const note = { id: Date.now(), body: noteText.trim(), at: new Date().toISOString(), admin: 'Admin' };
    const next = [note, ...notes];
    setNotes(next);
    saveNotes(userId, next);
    setNoteText('');
  };

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <aside
        className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-50 w-full sm:max-w-md bg-white sm:border-l border-slate-200 shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="User snapshot"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 shrink-0 bg-white">
          <span className="text-xs font-medium text-slate-500">User snapshot</span>
          <button type="button" onClick={onClose} className="p-1.5 -mr-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <FaTimes className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <DrawerSkeleton />
          ) : loadError || !row ? (
            <div className="p-6 text-center">
              <p className="text-sm font-medium text-slate-900">Could not load user</p>
              <p className="text-xs text-slate-500 mt-1">Try again or open the full profile page.</p>
              <button type="button" onClick={loadDetail} className="mt-3 text-xs font-semibold text-tf-blue hover:underline">
                Retry
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {/* Identity header */}
              <div className="pb-3 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                    {row.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-slate-900 leading-tight truncate">{row.displayName}</h3>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{row.email}</p>
                    {row.phone && <p className="text-xs text-slate-400 mt-0.5">{row.phone}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      <UserTypeBadge role={row.role} />
                      <UserStatusBadge status={row.accountStatus} />
                      <UserVerificationBadge status={row.verificationStatus} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 tabular-nums">
                      ID #{row.id}
                      {row.created_at && (
                        <> · Joined {new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
                      )}
                      {detail?.logins?.last_login_at && (
                        <> · Last login {formatRelativeTime(detail.logins.last_login_at)}</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Link
                    to={`/admin/users/${row.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-tf-blue text-white text-xs font-semibold hover:bg-tf-blue-dark"
                  >
                    Full profile
                    <FaExternalLinkAlt className="w-2.5 h-2.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => onSendEmail?.(row)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <FaEnvelope className="w-3 h-3" />
                    Email
                  </button>
                  <UserRowActionsMenu
                    user={row}
                    onMasquerade={onMasquerade}
                    onSendEmail={onSendEmail}
                    onResetPassword={onResetPassword}
                    onDelete={onDelete}
                    onPlaceholderAction={onPlaceholderAction}
                    masqueradeBusy={masqueradeBusyId === row.id}
                    compact
                  />
                </div>
              </div>

              <DrawerSection title="Quick stats">
                <OverviewCards detail={detail} row={row} />
              </DrawerSection>

              {completeness && (
                <DrawerSection title="Profile completeness">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-600">{completeness.percent}% complete</span>
                    <span className="text-[10px] text-slate-400">{completeness.missing.length} missing</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${completeness.percent}%` }}
                    />
                  </div>
                  {completeness.missing.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {completeness.missing.slice(0, 6).map((m) => (
                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </DrawerSection>
              )}

              <DrawerSection title="Admin notes">
                <p className="text-[10px] text-slate-400 mb-2">Local only until backend notes API exists.</p>
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add internal note..."
                    className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
                    onKeyDown={(e) => e.key === 'Enter' && addNote()}
                  />
                  <button type="button" onClick={addNote} className="px-2.5 py-1.5 rounded-md bg-slate-800 text-white text-xs font-medium hover:bg-slate-700 shrink-0">
                    Add
                  </button>
                </div>
                <ul className="space-y-1.5 max-h-28 overflow-y-auto">
                  {notes.length === 0 ? (
                    <li className="text-[11px] text-slate-400 italic">No notes yet.</li>
                  ) : (
                    notes.map((n) => (
                      <li key={n.id} className="text-[11px] pl-2 border-l-2 border-slate-200">
                        <p className="text-slate-700">{n.body}</p>
                        <p className="text-slate-400 mt-0.5">{new Date(n.at).toLocaleString()}</p>
                      </li>
                    ))
                  )}
                </ul>
              </DrawerSection>

              <DrawerSection title="Recent activity">
                {timeline.length === 0 ? (
                  <p className="text-[11px] text-slate-400">No activity yet in the last 30 days.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {timeline.map((ev, i) => (
                      <li key={i} className="flex gap-2 text-[11px] leading-snug">
                        <span className="text-slate-400 shrink-0 w-12 tabular-nums">{formatRelativeTime(ev.iso) || '—'}</span>
                        <span className="text-slate-700">{ev.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </DrawerSection>

              <DrawerSection title="Communication">
                <dl className="text-[11px] space-y-1">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Last email</dt>
                    <dd className="text-slate-700 tabular-nums">
                      {lastEmail ? formatRelativeTime(lastEmail.sent_at || lastEmail.at) : 'None yet'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Last SMS</dt>
                    <dd className="text-slate-400">Not available</dd>
                  </div>
                </dl>
                <div className="mt-2 flex gap-3 text-[11px]">
                  <button type="button" onClick={() => onSendEmail?.(row)} className="font-semibold text-tf-blue hover:underline">
                    Send email
                  </button>
                  <button type="button" onClick={() => onPlaceholderAction?.('Send SMS')} className="font-semibold text-slate-500 hover:text-slate-700 hover:underline">
                    Send SMS
                  </button>
                  <Link to="/crm" className="font-semibold text-tf-blue hover:underline">CRM</Link>
                </div>
              </DrawerSection>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
