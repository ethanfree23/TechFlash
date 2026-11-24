import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { FaTimes, FaPhone, FaRegStar, FaStar } from 'react-icons/fa';
import { adminUsersAPI } from '../../../api/api';
import UserTypeBadge from './UserTypeBadge';
import UserStatusBadge from './UserStatusBadge';
import { TradeLicenseCell, ReferencesCell, BackgroundCheckCell } from './VerificationInventoryCells';
import UserRowActionsMenu from './UserRowActionsMenu';
import EditTechnicianProfileModal from './EditTechnicianProfileModal';
import LogCallPanel from './LogCallPanel';
import ActivationStatusControls from './ActivationStatusControls';
import OnboardingReadinessChecklist from './OnboardingReadinessChecklist';
import InteractionTimeline from './InteractionTimeline';
import { DrawerSkeleton } from './UsersSkeleton';
import { mediaUrlWithCacheBust } from '../../../utils/mediaUrl';
import {
  enrichUserRow,
  buildActivityTimeline,
  computeProfileCompleteness,
  formatRelativeTime,
  displayOrFallback,
} from '../../../utils/adminUsersDisplayAdapter';
import {
  clearLocalNotes,
  defaultFollowUpLocalValue,
  loadLocalNotes,
  localNotesAlreadyMigrated,
  newClientKey,
} from '../../../utils/technicianActivation';

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

function DrawerSection({ title, children, className = '', accent = false }) {
  return (
    <section className={`rounded-lg border p-3 ${accent ? 'border-tf-blue/30 bg-sky-50/40' : 'border-slate-200/80 bg-white'} ${className}`}>
      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      {children}
    </section>
  );
}

function AvatarLightbox({ src, name, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${name || 'User'} profile photo`}>
      <button type="button" className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" aria-label="Close photo" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col items-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Close photo"
        >
          <FaTimes className="h-5 w-5" />
        </button>
        <img
          src={src}
          alt={name ? `${name} profile photo` : 'Profile photo'}
          className="max-h-[82vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/20"
        />
        {name ? <p className="mt-3 text-sm font-medium text-white/90">{name}</p> : null}
      </div>
    </div>,
    document.body
  );
}

function mergeActivationIntoDetail(detail, activationPayload) {
  if (!detail?.user || !activationPayload) return detail;
  const existing = detail.user.activation || {};
  return {
    ...detail,
    user: {
      ...detail.user,
      activation: {
        ...existing,
        ...activationPayload,
        interactions: existing.interactions,
        follow_ups: activationPayload.follow_ups || existing.follow_ups,
      },
    },
  };
}

export default function UserDrawer({
  userId,
  listRow,
  onClose,
  onSendEmail,
  onSendSms,
  onViewDocument,
  onMasquerade,
  onResetPassword,
  onDelete,
  onPlaceholderAction,
  masqueradeBusyId,
  onProfileSaved,
  onToggleAdminStar,
  adminStarBusyId,
  onActivationUpdated,
  onOpenPrevious,
  onOpenNext,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [crmBusy, setCrmBusy] = useState(false);
  const [crmError, setCrmError] = useState(null);
  const [migrateNotice, setMigrateNotice] = useState(null);
  const [showLogCall, setShowLogCall] = useState(true);
  const [interactions, setInteractions] = useState([]);
  const [followUps, setFollowUps] = useState([]);

  const loadDetail = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(false);
    setCrmError(null);
    try {
      const res = await adminUsersAPI.get(userId, '30d');
      setDetail(res);
      const activation = res?.user?.activation;
      setInteractions(Array.isArray(activation?.interactions) ? activation.interactions : []);
      setFollowUps(Array.isArray(activation?.follow_ups) ? activation.follow_ups : []);
    } catch {
      setDetail(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      setAvatarOpen(false);
      setNoteText('');
      setFollowUpNote('');
      setFollowUpAt('');
      setShowLogCall(true);
      setMigrateNotice(null);
      loadDetail();
    }
  }, [userId, loadDetail]);

  useEffect(() => {
    if (!userId || loading || loadError) return;
    if (detail?.user?.role !== 'technician') return;
    if (localNotesAlreadyMigrated(userId)) return;
    const local = loadLocalNotes(userId);
    if (!local.length) {
      clearLocalNotes(userId);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await adminUsersAPI.importLocalNotes(
          userId,
          local.map((n) => ({
            id: n.id,
            local_id: n.id,
            body: n.body,
            at: n.at,
            admin: n.admin,
          }))
        );
        if (cancelled) return;
        clearLocalNotes(userId);
        setMigrateNotice(
          `Migrated ${res.imported_count || 0} local note${res.imported_count === 1 ? '' : 's'} to the server.`
        );
        if (res.activation) {
          setDetail((prev) => mergeActivationIntoDetail(prev, res.activation));
        }
        const list = await adminUsersAPI.listInteractions(userId, { perPage: 25 });
        if (!cancelled) setInteractions(list.interactions || []);
      } catch {
        if (!cancelled) {
          setMigrateNotice('Local notes are still on this device — server migration failed. They were not discarded.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, loading, loadError, detail?.user?.role]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (avatarOpen || editProfileOpen) return;
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, editProfileOpen, avatarOpen]);

  if (!userId) return null;

  const detailUser = detail?.user;
  const row = listRow
    ? enrichUserRow({
        ...listRow,
        ...(detailUser
          ? {
              first_name: detailUser.first_name,
              last_name: detailUser.last_name,
              email: detailUser.email,
              phone: detailUser.phone,
              label: detailUser.profile?.trade_type || listRow.label,
              activation: detailUser.activation || listRow.activation,
            }
          : {}),
      }, detail)
    : detailUser
      ? enrichUserRow({ ...detailUser, logins_last_30_days: detail.logins?.total_in_period }, detail)
      : null;

  const completeness = row ? computeProfileCompleteness(row, detail) : null;
  const timeline = detail ? buildActivityTimeline(detail) : [];
  const lastEmail = detail?.email_deliveries?.recent?.[0];
  const isTechnician = row?.role === 'technician';
  const activation = row?.activation || detailUser?.activation || null;
  const onboarding = activation?.onboarding || null;
  const phone = row?.phone || detailUser?.phone || detailUser?.profile?.phone;
  const nextOpenFollowUp = (followUps || []).find((fu) => fu.status === 'open');

  const applyCrmResult = (res) => {
    if (res?.activation) {
      setDetail((prev) => mergeActivationIntoDetail(prev, res.activation));
      onActivationUpdated?.(userId, res.activation);
    }
    if (res?.interaction) {
      setInteractions((prev) => [res.interaction, ...prev.filter((i) => i.id !== res.interaction.id)]);
    }
    if (res?.follow_up) {
      setFollowUps((prev) => [res.follow_up, ...prev.filter((f) => f.id !== res.follow_up.id)]);
    }
  };

  const handleLogCall = async (payload) => {
    setCrmBusy(true);
    setCrmError(null);
    try {
      const res = await adminUsersAPI.logCall(userId, payload);
      applyCrmResult(res);
    } catch (err) {
      setCrmError(err?.message || 'Could not log call');
      throw err;
    } finally {
      setCrmBusy(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || crmBusy) return;
    setCrmBusy(true);
    setCrmError(null);
    try {
      const res = await adminUsersAPI.createInteraction(userId, {
        interaction_type: 'note',
        body: noteText.trim(),
        client_key: newClientKey('note'),
      });
      applyCrmResult(res);
      setNoteText('');
    } catch (err) {
      setCrmError(err?.message || 'Could not save note');
    } finally {
      setCrmBusy(false);
    }
  };

  const handleScheduleFollowUp = async () => {
    if (!followUpAt || crmBusy) return;
    setCrmBusy(true);
    setCrmError(null);
    try {
      const res = await adminUsersAPI.createFollowUp(userId, {
        due_at: new Date(followUpAt).toISOString(),
        description: followUpNote.trim() || undefined,
      });
      applyCrmResult(res);
      setFollowUpAt('');
      setFollowUpNote('');
    } catch (err) {
      setCrmError(err?.message || 'Could not schedule follow-up');
    } finally {
      setCrmBusy(false);
    }
  };

  const handleStatusChange = async (status) => {
    setCrmBusy(true);
    setCrmError(null);
    try {
      const res = await adminUsersAPI.updateActivation(userId, { status });
      applyCrmResult(res);
      const list = await adminUsersAPI.listInteractions(userId, { perPage: 25 });
      setInteractions(list.interactions || []);
    } catch (err) {
      setCrmError(err?.message || 'Could not update status');
    } finally {
      setCrmBusy(false);
    }
  };

  const handleAvailabilityChange = async (current_availability) => {
    setCrmBusy(true);
    setCrmError(null);
    try {
      const res = await adminUsersAPI.updateActivation(userId, { current_availability });
      applyCrmResult(res);
    } catch (err) {
      setCrmError(err?.message || 'Could not update availability');
    } finally {
      setCrmBusy(false);
    }
  };

  const completeFollowUp = async (followUpId) => {
    setCrmBusy(true);
    try {
      const res = await adminUsersAPI.updateFollowUp(followUpId, { status: 'completed' });
      setFollowUps((prev) => prev.map((fu) => (fu.id === followUpId ? res.follow_up : fu)));
      if (res.follow_up) {
        onActivationUpdated?.(userId, {
          ...(activation || {}),
          next_follow_up_at: null,
        });
      }
    } catch (err) {
      setCrmError(err?.message || 'Could not complete follow-up');
    } finally {
      setCrmBusy(false);
    }
  };

  return (
    <>
      {avatarOpen && (() => {
        const avatarUrl = row?.avatarUrl || detail?.user?.profile?.avatar_url;
        const resolved = avatarUrl
          ? mediaUrlWithCacheBust(avatarUrl, row?.avatarUpdatedAt || detail?.user?.profile?.updated_at)
          : null;
        return resolved ? (
          <AvatarLightbox
            src={resolved}
            name={row?.displayName}
            onClose={() => setAvatarOpen(false)}
          />
        ) : null;
      })()}
      {editProfileOpen && isTechnician && (
        <EditTechnicianProfileModal
          isOpen={editProfileOpen}
          userId={userId}
          detail={detail}
          onClose={() => setEditProfileOpen(false)}
          onSaved={(res) => {
            setDetail(res);
            onProfileSaved?.(res);
          }}
        />
      )}
      <button type="button" className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <aside
        className="fixed inset-0 z-50 flex w-full flex-col border-slate-200 bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-md sm:border-l"
        role="dialog"
        aria-modal="true"
        aria-label="User snapshot"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-2.5">
          <span className="text-xs font-medium text-slate-500">User snapshot</span>
          <div className="flex items-center gap-1">
            {isTechnician && onOpenPrevious && (
              <button
                type="button"
                onClick={onOpenPrevious}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-tf-blue hover:bg-sky-50"
              >
                Prev tech
              </button>
            )}
            {isTechnician && onOpenNext && (
              <button
                type="button"
                onClick={onOpenNext}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-tf-blue hover:bg-sky-50"
              >
                Next tech
              </button>
            )}
            <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <FaTimes className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <DrawerSkeleton />
          ) : loadError || !row ? (
            <div className="p-6 text-center">
              <p className="text-sm font-medium text-slate-900">Could not load user</p>
              <p className="mt-1 text-xs text-slate-500">Try again or open the full profile page.</p>
              <button type="button" onClick={loadDetail} className="mt-3 text-xs font-semibold text-tf-blue hover:underline">
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {/* 1. Identity and phone/contact actions */}
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-start gap-3">
                  {(() => {
                    const avatarUrl = row.avatarUrl || detail?.user?.profile?.avatar_url;
                    const resolved = avatarUrl
                      ? mediaUrlWithCacheBust(avatarUrl, row.avatarUpdatedAt || detail?.user?.profile?.updated_at)
                      : null;
                    return resolved ? (
                      <button
                        type="button"
                        onClick={() => setAvatarOpen(true)}
                        className="h-11 w-11 shrink-0 cursor-zoom-in overflow-hidden rounded-full border border-slate-200 hover:ring-2 hover:ring-tf-blue/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-tf-blue/50"
                        aria-label={`View ${row.displayName || 'user'} profile photo`}
                      >
                        <img src={resolved} alt="" className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 text-sm font-bold text-slate-600">
                        {row.initials}
                      </div>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-slate-900">
                        {row.displayName}
                      </h3>
                      {isTechnician && (
                        <button
                          type="button"
                          onClick={() => onToggleAdminStar?.(row, !row.adminStarred)}
                          disabled={adminStarBusyId === row.id || !onToggleAdminStar}
                          title={row.adminStarred ? 'Remove from my focus' : 'Add to my focus'}
                          aria-pressed={!!row.adminStarred}
                          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                            row.adminStarred
                              ? 'border-amber-300 bg-amber-50 text-amber-500'
                              : 'border-slate-200 bg-white text-slate-400 hover:border-amber-300 hover:bg-amber-50'
                          }`}
                        >
                          {row.adminStarred ? <FaStar className="h-4 w-4" /> : <FaRegStar className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{row.email}</p>
                    {phone && (
                      <a href={`tel:${phone}`} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-tf-blue hover:underline">
                        <FaPhone className="h-2.5 w-2.5" />
                        {phone}
                      </a>
                    )}
                    {row.locationLabel && row.locationLabel !== 'Not provided' && (
                      <p className="mt-0.5 text-xs text-slate-400">{row.locationLabel}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <UserTypeBadge role={row.role} />
                      <UserStatusBadge status={row.accountStatus} />
                      {row.role === 'technician' && row.verification ? (
                        <>
                          <TradeLicenseCell
                            inventory={row.verification}
                            onSendSms={(message) => onSendSms?.(row, message)}
                            onViewDocument={onViewDocument}
                          />
                          <ReferencesCell
                            inventory={row.verification}
                            userId={row.id}
                            onSendSms={(message) => onSendSms?.(row, message)}
                          />
                          <BackgroundCheckCell
                            inventory={row.verification}
                            onSendSms={(message) => onSendSms?.(row, message)}
                          />
                        </>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[10px] tabular-nums text-slate-400">
                      ID #{row.id}
                      {row.created_at && (
                        <> · Joined {new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
                      )}
                      {(detail?.logins?.last_login_at || row.lastLoginAt) && (
                        <> · Last login {formatRelativeTime(detail?.logins?.last_login_at || row.lastLoginAt)}</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="inline-flex items-center gap-1 rounded-md bg-tf-blue px-2.5 py-1 text-xs font-semibold text-white hover:bg-tf-blue-dark"
                    >
                      <FaPhone className="h-3 w-3" />
                      Call
                    </a>
                  )}
                  <Link
                    to={`/admin/users/${row.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View profile
                  </Link>
                  {isTechnician && (
                    <button
                      type="button"
                      onClick={() => setEditProfileOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Edit profile
                    </button>
                  )}
                  {(row.role === 'company' || row.role === 'technician') && (
                    <button
                      type="button"
                      onClick={() => onMasquerade?.(row.id)}
                      disabled={masqueradeBusyId === row.id}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      {masqueradeBusyId === row.id ? 'Starting…' : 'Impersonate'}
                    </button>
                  )}
                  <UserRowActionsMenu
                    user={row}
                    onMasquerade={onMasquerade}
                    onSendEmail={onSendEmail}
                    onSendSms={onSendSms}
                    onResetPassword={onResetPassword}
                    onDelete={onDelete}
                    onPlaceholderAction={onPlaceholderAction}
                    masqueradeBusy={masqueradeBusyId === row.id}
                    compact
                  />
                </div>
              </div>

              {migrateNotice && (
                <p className="rounded-md border border-sky-100 bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-800">
                  {migrateNotice}
                </p>
              )}
              {crmError && (
                <p className="rounded-md border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
                  {crmError}
                </p>
              )}

              {row.isFlagged && (
                <DrawerSection title="Flagged — needs resolution">
                  <p className="mb-2 text-xs text-slate-700">
                    This account is in the review queue for a specific reason, not a generic risk score.
                  </p>
                  {row.flagReasons?.length > 0 ? (
                    <ul className="mb-3 space-y-1">
                      {row.flagReasons.map((reason) => (
                        <li key={reason} className="border-l-2 border-red-200 pl-2 text-[11px] text-red-800">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-[11px] text-slate-500">No reason recorded yet.</p>
                  )}
                </DrawerSection>
              )}

              {isTechnician ? (
                <>
                  {/* 2. Activation status and availability */}
                  <DrawerSection title="Activation status">
                    <ActivationStatusControls
                      status={activation?.status || 'new'}
                      availability={activation?.current_availability || 'unknown'}
                      onStatusChange={handleStatusChange}
                      onAvailabilityChange={handleAvailabilityChange}
                      busy={crmBusy}
                    />
                  </DrawerSection>

                  {/* 3. Log Call / Add Note / Schedule Follow-up */}
                  <DrawerSection title="Log call" accent>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] text-slate-500">One-click outcome. Does not place a call.</p>
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-700"
                        onClick={() => setShowLogCall((v) => !v)}
                      >
                        {showLogCall ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {showLogCall && <LogCallPanel onSubmit={handleLogCall} busy={crmBusy} />}
                  </DrawerSection>

                  <DrawerSection title="Add note">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Add internal note..."
                        className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      />
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={crmBusy || !noteText.trim()}
                        className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </DrawerSection>

                  <DrawerSection title="Schedule follow-up">
                    <div className="space-y-1.5">
                      <input
                        type="datetime-local"
                        value={followUpAt}
                        onChange={(e) => setFollowUpAt(e.target.value)}
                        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
                      />
                      <input
                        type="text"
                        value={followUpNote}
                        onChange={(e) => setFollowUpNote(e.target.value)}
                        placeholder="Optional description"
                        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFollowUpAt(defaultFollowUpLocalValue(24))}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          +1 day
                        </button>
                        <button
                          type="button"
                          onClick={handleScheduleFollowUp}
                          disabled={crmBusy || !followUpAt}
                          className="rounded-md bg-tf-blue px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-tf-blue-dark disabled:opacity-50"
                        >
                          Schedule
                        </button>
                      </div>
                    </div>
                  </DrawerSection>

                  {/* 4. Next action and onboarding blockers */}
                  <DrawerSection title="Next action">
                    {nextOpenFollowUp ? (
                      <div className="rounded-md border border-amber-100 bg-amber-50/70 px-2.5 py-2">
                        <p className="text-[11px] font-semibold text-amber-900">
                          Follow-up {formatRelativeTime(nextOpenFollowUp.due_at) || 'scheduled'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-700">
                          {nextOpenFollowUp.description || 'No description'}
                        </p>
                        <button
                          type="button"
                          onClick={() => completeFollowUp(nextOpenFollowUp.id)}
                          disabled={crmBusy}
                          className="mt-1.5 text-[10px] font-semibold text-tf-blue hover:underline disabled:opacity-50"
                        >
                          Mark completed
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        {activation?.last_contacted_at
                          ? `Last contacted ${formatRelativeTime(activation.last_contacted_at)}. No open follow-up.`
                          : 'Never contacted — log a call to start activation.'}
                      </p>
                    )}
                  </DrawerSection>

                  <DrawerSection title="Onboarding blockers">
                    <OnboardingReadinessChecklist
                      onboarding={onboarding}
                      onEditProfile={() => setEditProfileOpen(true)}
                    />
                  </DrawerSection>

                  {/* 5. Interaction timeline */}
                  <DrawerSection title="Interaction timeline">
                    <InteractionTimeline interactions={interactions} platformEvents={timeline} />
                  </DrawerSection>

                  {/* 6. Quick stats and platform history */}
                  <DrawerSection title="Quick stats">
                    <OverviewCards detail={detail} row={row} />
                  </DrawerSection>

                  <DrawerSection title="Communication">
                    <dl className="space-y-1 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Last email</dt>
                        <dd className="tabular-nums text-slate-700">
                          {lastEmail ? formatRelativeTime(lastEmail.sent_at || lastEmail.at) : 'None yet'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Last contacted</dt>
                        <dd className="tabular-nums text-slate-700">
                          {activation?.last_contacted_at
                            ? formatRelativeTime(activation.last_contacted_at)
                            : 'Never'}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-2 flex gap-3 text-[11px]">
                      <button type="button" onClick={() => onSendEmail?.(row)} className="font-semibold text-tf-blue hover:underline">
                        Send email
                      </button>
                      <button type="button" onClick={() => onSendSms?.(row, row.verification?.suggested_sms?.next_gap || '')} className="font-semibold text-slate-500 hover:text-slate-700 hover:underline">
                        Send SMS
                      </button>
                    </div>
                  </DrawerSection>
                </>
              ) : (
                <>
                  <DrawerSection title="Quick stats">
                    <OverviewCards detail={detail} row={row} />
                  </DrawerSection>

                  {completeness && (
                    <DrawerSection title="Profile completeness">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs text-slate-600">{completeness.percent}% complete</span>
                        <span className="text-[10px] text-slate-400">{completeness.missing.length} missing</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${completeness.percent}%` }}
                        />
                      </div>
                      {completeness.missing.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {completeness.missing.slice(0, 6).map((m) => (
                            <span key={m} className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </DrawerSection>
                  )}

                  <DrawerSection title="Recent activity">
                    {timeline.length === 0 ? (
                      <p className="text-[11px] text-slate-400">No activity yet in the last 30 days.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {timeline.map((ev, i) => (
                          <li key={i} className="flex gap-2 text-[11px] leading-snug">
                            <span className="w-12 shrink-0 tabular-nums text-slate-400">{formatRelativeTime(ev.iso) || '—'}</span>
                            <span className="text-slate-700">{ev.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </DrawerSection>

                  <DrawerSection title="Communication">
                    <dl className="space-y-1 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Last email</dt>
                        <dd className="tabular-nums text-slate-700">
                          {lastEmail ? formatRelativeTime(lastEmail.sent_at || lastEmail.at) : 'None yet'}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-2 flex gap-3 text-[11px]">
                      <button type="button" onClick={() => onSendEmail?.(row)} className="font-semibold text-tf-blue hover:underline">
                        Send email
                      </button>
                      <button type="button" onClick={() => onSendSms?.(row, '')} className="font-semibold text-slate-500 hover:underline">
                        Send SMS
                      </button>
                      <Link to="/crm" className="font-semibold text-tf-blue hover:underline">CRM</Link>
                    </div>
                  </DrawerSection>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
