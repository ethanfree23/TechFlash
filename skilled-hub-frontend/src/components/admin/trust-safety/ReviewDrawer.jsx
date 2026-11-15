import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { FaTimes, FaExternalLinkAlt, FaChevronLeft, FaChevronRight, FaStepForward } from 'react-icons/fa';
import { adminTrustSafetyAPI } from '../../../api/api';
import { TechnicianAvatar, ItemStatusBadge, PriorityBadge, Kbd } from './primitives';
import { DocumentPanel, BackgroundCheckPanel, ReferencePanel } from './ItemPanels';
import AuditTimeline from './AuditTimeline';
import DecisionModal from './DecisionModal';
import { parseItemKey, buildDecisionPayload, describeApiError, isConflictError, formatRelative } from '../../../utils/trustSafety';

const PRIMARY_KEYS = new Set(['approve', 'reject', 'request_info', 'manually_approved', 'manually_rejected']);

function buttonClass(action) {
  const base = 'inline-flex items-center justify-center h-9 rounded-md px-3 text-xs font-semibold transition-colors disabled:opacity-50';
  if (action.tone === 'success') return `${base} bg-emerald-600 text-white hover:bg-emerald-700`;
  if (action.tone === 'danger') return `${base} bg-white text-red-700 border border-red-200 hover:bg-red-50`;
  return `${base} bg-white text-slate-700 border border-slate-200 hover:bg-slate-50`;
}

function DrawerSkeleton() {
  return (
    <div className="p-5 space-y-4" aria-busy="true">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-slate-100 animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-3 w-40 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-56 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="h-48 rounded-lg bg-slate-100 animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-slate-100 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/**
 * Right-hand review drawer. Loads the full item + its audit history, renders the
 * type-specific panel, and funnels every decision through DecisionModal.
 */
export default function ReviewDrawer({ itemKey, onClose, onPrev, onNext, onNextPending, hasNextPending, onItemChanged, onToast }) {
  const parsed = useMemo(() => parseItemKey(itemKey), [itemKey]);
  const [item, setItem] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [conflictNotice, setConflictNotice] = useState('');

  const load = useCallback(async () => {
    if (!parsed) return;
    setLoading(true);
    setError('');
    try {
      const res = await adminTrustSafetyAPI.item(parsed.itemType, parsed.id);
      setItem(res?.item || null);
      setAudit(res?.audit || []);
    } catch (e) {
      setError(e?.message || 'Could not load this item.');
    } finally {
      setLoading(false);
    }
  }, [parsed]);

  useEffect(() => {
    setItem(null);
    setAudit([]);
    setConflictNotice('');
    setPendingAction(null);
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e) => {
      if (pendingAction) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'n' && hasNextPending) onNextPending?.();
      if (e.key === 'a' || e.key === 'r' || e.key === 'i') {
        const map = { a: ['approve', 'manually_approved'], r: ['reject', 'manually_rejected'], i: ['request_info'] };
        const act = (item?.actions || []).find((x) => map[e.key].includes(x.key));
        if (act) setPendingAction(act);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onNextPending, hasNextPending, item, pendingAction]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const submitDecision = async ({ reason, confirmed, outcome, method }) => {
    if (!item || !pendingAction) return;
    setSubmitting(true);
    setServerError('');
    try {
      let response;
      if (pendingAction.key === 'note') {
        response = await adminTrustSafetyAPI.createNote(item.item_type, item.id, reason);
      } else if (pendingAction.key === 'contact_attempt') {
        response = await adminTrustSafetyAPI.recordReferenceContactAttempt(item.id, { outcome, method, note: reason });
      } else {
        const payload = buildDecisionPayload(item, pendingAction, { reason, confirmed });
        if (!payload) throw new Error('Unsupported action.');
        response = await adminTrustSafetyAPI[payload.endpoint](item.id, payload.body);
      }
      const nextItem = response?.item || null;
      setPendingAction(null);
      onToast?.({ tone: 'success', message: response?.message || 'Saved.' });
      if (nextItem) setItem(nextItem);
      // Reload audit (and the item, in case the server returned a partial).
      await load();
      onItemChanged?.(nextItem || item);
    } catch (e) {
      if (isConflictError(e)) {
        setPendingAction(null);
        setConflictNotice(describeApiError(e));
        // Show the server's latest copy immediately, then reload so the audit trail catches up too.
        if (e?.details?.item) setItem(e.details.item);
        await load();
        onItemChanged?.(e?.details?.item || item);
      } else {
        setServerError(describeApiError(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const technician = item?.technician;
  const actions = item?.actions || [];
  const primary = actions.filter((a) => PRIMARY_KEYS.has(a.key));
  const secondary = actions.filter((a) => !PRIMARY_KEYS.has(a.key));

  return createPortal(
    <>
      <button type="button" className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[2px]" aria-label="Close review" onClick={onClose} />
      <aside
        className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-50 w-full sm:max-w-xl bg-white sm:border-l border-slate-200 shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Review item"
      >
        {/* Header */}
        <header className="border-b border-slate-200 px-4 sm:px-5 py-3 flex items-start gap-3">
          {technician ? (
            <>
              <TechnicianAvatar technician={technician} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={technician.admin_user_path} className="text-sm font-semibold text-slate-900 hover:text-tf-blue hover:underline truncate">
                    {technician.display_name}
                  </Link>
                  {!technician.has_real_name && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">No name on file</span>}
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    User #{technician.user_id}
                    {technician.technician_profile_id ? ` · Profile #${technician.technician_profile_id}` : ''}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {[technician.trade, technician.skill_class, technician.location_label, technician.experience_years != null ? `${technician.experience_years} yrs` : null]
                    .filter(Boolean)
                    .join(' · ') || technician.email}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  {technician.email && (
                    <a href={`mailto:${technician.email}`} className="hover:text-tf-blue truncate">
                      {technician.email}
                    </a>
                  )}
                  {technician.phone && <span>{technician.phone}</span>}
                  <span className="capitalize">Account: {technician.account_status}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="h-4 w-40 rounded bg-slate-100 animate-pulse" />
            </div>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {technician && (
              <Link
                to={technician.admin_user_path}
                className="hidden sm:inline-flex items-center gap-1 h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                View Full Account <FaExternalLinkAlt className="h-2.5 w-2.5" />
              </Link>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
              <FaTimes className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Item strip */}
        {item && (
          <div className="px-4 sm:px-5 py-2 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">
                {item.review_type_label}
                {item.title ? ` — ${item.title}` : ''}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                Submitted {formatRelative(item.submitted_at)} · Updated {formatRelative(item.updated_at)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <PriorityBadge priority={item.priority} />
              <ItemStatusBadge status={item.status} />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-6">
          {conflictNotice && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
              {conflictNotice}
            </div>
          )}
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-center justify-between gap-2" role="alert">
              <span>{error}</span>
              <button type="button" onClick={load} className="font-semibold underline">Retry</button>
            </div>
          ) : loading && !item ? (
            <DrawerSkeleton />
          ) : item ? (
            <>
              {item.item_type === 'document' && <DocumentPanel item={item} />}
              {item.item_type === 'background_check' && <BackgroundCheckPanel item={item} />}
              {item.item_type === 'reference' && <ReferencePanel item={item} />}

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Review history</h4>
                  {secondary.find((a) => a.key === 'note') && (
                    <button type="button" onClick={() => setPendingAction(secondary.find((a) => a.key === 'note'))} className="text-[11px] font-medium text-tf-blue hover:underline">
                      + Add note
                    </button>
                  )}
                </div>
                <AuditTimeline events={audit} />
              </section>
            </>
          ) : null}
        </div>

        {/* Decision bar */}
        <footer className="border-t border-slate-200 bg-white px-4 sm:px-5 py-3 space-y-2">
          {item && (
            <div className="flex flex-wrap gap-2">
              {primary.length === 0 ? (
                <p className="text-xs text-slate-500 py-1.5">
                  No decision is available in the current state.{item.override_block_reason ? ` ${item.override_block_reason}` : ''}
                </p>
              ) : (
                primary.map((action) => (
                  <button key={action.key} type="button" onClick={() => setPendingAction(action)} className={buttonClass(action)} title={action.consequence || ''}>
                    {action.label}
                  </button>
                ))
              )}
              {secondary
                .filter((a) => a.key !== 'note')
                .map((action) => (
                  <button key={action.key} type="button" onClick={() => setPendingAction(action)} className={buttonClass(action)}>
                    {action.label}
                  </button>
                ))}
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1">
              <button type="button" onClick={onPrev} disabled={!onPrev} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30" aria-label="Previous item">
                <FaChevronLeft className="h-3 w-3" />
              </button>
              <button type="button" onClick={onNext} disabled={!onNext} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30" aria-label="Next item">
                <FaChevronRight className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onNextPending}
                disabled={!hasNextPending}
                className="ml-1 inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-tf-blue hover:bg-tf-blue/5 disabled:opacity-30"
              >
                <FaStepForward className="h-2.5 w-2.5" /> Next pending
              </button>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span>
                <Kbd>A</Kbd> approve
              </span>
              <span>
                <Kbd>R</Kbd> reject
              </span>
              <span>
                <Kbd>I</Kbd> request info
              </span>
              <span>
                <Kbd>N</Kbd> next pending
              </span>
              <span>
                <Kbd>Esc</Kbd> close
              </span>
            </div>
          </div>
        </footer>
      </aside>

      <DecisionModal
        open={Boolean(pendingAction)}
        item={item}
        action={pendingAction}
        submitting={submitting}
        serverError={serverError}
        onClose={() => {
          setPendingAction(null);
          setServerError('');
        }}
        onSubmit={submitDecision}
      />
    </>,
    document.body
  );
}
