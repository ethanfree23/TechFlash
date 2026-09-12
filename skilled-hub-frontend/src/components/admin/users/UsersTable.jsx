import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaChevronRight, FaSort, FaSortDown, FaSortUp } from 'react-icons/fa';
import UserTypeBadge from './UserTypeBadge';
import UserStatusBadge from './UserStatusBadge';
import UserVerificationBadge from './UserVerificationBadge';
import UserRiskBadge from './UserRiskBadge';
import UserRowActionsMenu from './UserRowActionsMenu';
import UsersEmptyState from './UsersEmptyState';
import { TableRowsSkeleton } from './UsersSkeleton';
import { displayOrFallback, TRADE_LEVEL_RANK } from '../../../utils/adminUsersDisplayAdapter';
import { mediaUrlWithCacheBust } from '../../../utils/mediaUrl';
import {
  ADMIN_USERS_PAGE_SIZES,
  paginateItems,
  persistPageSize,
  readStoredPageSize,
} from '../../../utils/adminUsersPagination';
import {
  clampTableColumnWidth,
  minWidthForColumnKey,
} from '../../../utils/tableColumnPrefs';

const CHECKBOX_COL_WIDTH = 32;
const ACTIONS_COL_WIDTH = 56;

function columnWidthPx(col, draftWidths) {
  const min = minWidthForColumnKey(col.key);
  if (draftWidths[col.key] != null) {
    return clampTableColumnWidth(draftWidths[col.key], { min }) ?? min;
  }
  return clampTableColumnWidth(col.width, { min }) ?? (col.key === 'user' ? 200 : 96);
}

function ColumnResizeHandle({ colKey, currentWidth, onDraftWidth, onCommitWidth, onResetWidth }) {
  const startRef = useRef(null);

  const endDrag = (target, pointerId) => {
    const start = startRef.current;
    startRef.current = null;
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    if (target && pointerId != null) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    return start;
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, width: currentWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e) => {
    if (!startRef.current) return;
    const next = clampTableColumnWidth(startRef.current.width + (e.clientX - startRef.current.x), {
      min: minWidthForColumnKey(colKey),
    });
    if (next != null) onDraftWidth(colKey, next);
  };

  const onPointerUp = (e) => {
    const start = endDrag(e.currentTarget, e.pointerId);
    if (!start) return;
    const next = clampTableColumnWidth(start.width + (e.clientX - start.x), {
      min: minWidthForColumnKey(colKey),
    });
    if (next != null) onCommitWidth(colKey, next);
  };

  const onPointerCancel = (e) => {
    const start = endDrag(e.currentTarget, e.pointerId);
    if (!start) return;
    onDraftWidth(colKey, null);
  };

  const onDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onResetWidth(colKey);
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${colKey} column`}
      title="Drag to resize. Double-click to reset."
      className="absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none group/handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="pointer-events-none absolute inset-y-1 right-0 w-px rounded-full bg-slate-300 opacity-0 transition-opacity group-hover/col:opacity-100 group-hover/handle:w-0.5 group-hover/handle:bg-tf-blue group-hover/handle:opacity-100" />
    </span>
  );
}

/** Tablet: hide membership tier, risk, jobs */
const HIDDEN_MD = new Set(['jobs', 'risk', 'membership_tier']);
/** Mobile table (lg breakpoint): also hide city, state, last_login, joined */
const HIDDEN_LG = new Set(['city', 'state', 'location', 'last_login', 'joined']);

function Muted({ children, title }) {
  return (
    <span className="text-xs text-slate-400 truncate block min-w-0" title={title || (typeof children === 'string' ? children : undefined)}>
      {children}
    </span>
  );
}

function CellText({ children, title, className = 'text-xs text-slate-700' }) {
  const tip = title || (typeof children === 'string' ? children : undefined);
  return (
    <span className={`block min-w-0 truncate ${className}`} title={tip}>
      {children}
    </span>
  );
}

function SortIndicator({ colKey, sortKey, sortDir }) {
  if (colKey !== sortKey) {
    return <FaSort className="w-2.5 h-2.5 shrink-0 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />;
  }
  return sortDir === 'asc' ? (
    <FaSortUp className="w-2.5 h-2.5 shrink-0 text-tf-blue" aria-hidden />
  ) : (
    <FaSortDown className="w-2.5 h-2.5 shrink-0 text-tf-blue" aria-hidden />
  );
}

function UserAvatar({ row }) {
  const [broken, setBroken] = useState(false);
  const avatarUrl = row.avatarUrl;

  useEffect(() => {
    setBroken(false);
  }, [avatarUrl]);

  const src = avatarUrl && !broken ? mediaUrlWithCacheBust(avatarUrl, row.avatarUpdatedAt) : null;

  return (
    <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/80 overflow-hidden flex items-center justify-center text-[10px] font-bold text-slate-600">
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        row.initials
      )}
    </div>
  );
}

function UserCell({ row }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <UserAvatar row={row} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-900 truncate leading-tight">{row.displayName}</div>
        <div className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">{row.email}</div>
      </div>
    </div>
  );
}

function renderCell(col, row) {
  switch (col.key) {
    case 'user':
      return <UserCell row={row} />;
    case 'type':
      return (
        <div className="min-w-0 overflow-hidden">
          <UserTypeBadge role={row.role} />
        </div>
      );
    case 'status':
      return (
        <div className="min-w-0 overflow-hidden">
          <UserStatusBadge status={row.accountStatus} />
        </div>
      );
    case 'verification':
      return (
        <div className="min-w-0 overflow-hidden">
          <UserVerificationBadge status={row.verificationStatus} />
        </div>
      );
    case 'company_trade':
      return <CellText title={row.companyTradeLabel}>{row.companyTradeLabel}</CellText>;
    case 'trade_level':
      return row.tradeLevelLabel ? (
        <CellText title={row.tradeLevelLabel}>{row.tradeLevelLabel}</CellText>
      ) : (
        <Muted title="Trade level not provided">—</Muted>
      );
    case 'experience_years':
      return row.experienceYearsLabel ? (
        <CellText className="text-xs text-slate-600 tabular-nums" title={row.experienceYearsLabel}>
          {row.experienceYearsLabel}
        </CellText>
      ) : (
        <Muted title="Years not provided">—</Muted>
      );
    case 'location':
      return row.locationLabel === 'Not provided' ? (
        <Muted title="Location not provided">Not provided</Muted>
      ) : (
        <CellText className="text-xs text-slate-600" title={row.locationLabel}>{row.locationLabel}</CellText>
      );
    case 'city':
      return row.cityLabel ? (
        <CellText className="text-xs text-slate-600" title={row.cityLabel}>{row.cityLabel}</CellText>
      ) : (
        <Muted title="City not provided">—</Muted>
      );
    case 'state':
      return row.stateLabel ? (
        <CellText className="text-xs text-slate-600" title={row.stateLabel}>{row.stateLabel}</CellText>
      ) : (
        <Muted title="State not provided">—</Muted>
      );
    case 'membership_tier':
      return (
        <CellText title={displayOrFallback(row.membershipTier, 'Free')}>
          {displayOrFallback(row.membershipTier, 'Free')}
        </CellText>
      );
    case 'activity':
      return (
        <CellText
          className={`text-xs ${row.activityLabel?.isEmpty ? 'text-slate-400' : 'text-slate-700'}`}
          title={[row.activityLabel?.logins, row.activityLabel?.lastActive].filter(Boolean).join(' · ') || 'No activity yet'}
        >
          {row.activityLabel?.logins || 'No activity yet'}
        </CellText>
      );
    case 'jobs':
      if (row.jobsSummary) {
        if (row.role === 'technician') {
          const label = `${row.jobsSummary.accepted} acc · ${row.jobsSummary.completed} done`;
          return <CellText className="text-[11px] text-slate-600" title={label}>{label}</CellText>;
        }
        const label = `${row.jobsSummary.posted} posted · ${row.jobsSummary.filled} filled`;
        return <CellText className="text-[11px] text-slate-600" title={label}>{label}</CellText>;
      }
      return <Muted title="Open user drawer for job details">—</Muted>;
    case 'joined':
      return (
        <CellText className="text-xs text-slate-600 tabular-nums">
          {row.created_at
            ? new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
            : '—'}
        </CellText>
      );
    case 'last_login':
      return (
        <CellText
          className={`text-xs ${row.lastLoginAt ? 'text-slate-600' : 'text-slate-400'}`}
          title={row.lastLoginDisplay || '—'}
        >
          {row.lastLoginDisplay || '—'}
        </CellText>
      );
    case 'risk':
      return (
        <div className="min-w-0 overflow-hidden">
          <UserRiskBadge level={row.riskLevel || 'Low'} reasons={row.flagReasons} />
        </div>
      );
    default:
      return <Muted>—</Muted>;
  }
}

function colHiddenClass(key, asCol = false) {
  if (HIDDEN_LG.has(key)) return asCol ? 'hidden xl:table-column' : 'hidden xl:table-cell';
  if (HIDDEN_MD.has(key)) return asCol ? 'hidden lg:table-column' : 'hidden lg:table-cell';
  return '';
}

function TablePaginationBar({ pageInfo, pageSize, onPageSizeChange, onPageChange }) {
  const { total, start, end, page, totalPages } = pageInfo;

  return (
    <div className="shrink-0 px-3 py-1.5 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
      <span className="tabular-nums">
        {total} user{total === 1 ? '' : 's'}
      </span>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="inline-flex items-center gap-1.5">
          <span className="text-slate-400">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-tf-blue/20"
            aria-label="Rows per page"
          >
            {ADMIN_USERS_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="tabular-nums text-slate-400" aria-live="polite">
          {total === 0 ? '0 of 0' : `${start}–${end} of ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-2 py-0.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Previous page"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-2 py-0.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function UserMobileCard({ row, selected, onSelect, onRowClick, onViewProfile, actions }) {
  return (
    <div
      className="rounded-lg border border-slate-200/90 bg-white p-3 shadow-sm active:bg-slate-50/50 transition-colors"
      onClick={() => onRowClick(row)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onRowClick(row)}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onSelect(row.id); }}
          className="mt-2 rounded border-slate-300 shrink-0"
          aria-label={`Select ${row.displayName}`}
        />
        <div className="flex-1 min-w-0">
          <UserCell row={row} />
          <div className="mt-2 flex flex-wrap gap-1">
            <UserTypeBadge role={row.role} />
            <UserStatusBadge status={row.accountStatus} />
          </div>
          <p className={`mt-1.5 text-[11px] ${row.activityLabel?.isEmpty ? 'text-slate-400' : 'text-slate-500'}`}>
            {row.activityLabel?.logins || 'No activity yet'}
            {row.activityLabel?.lastActive ? ` · ${row.activityLabel.lastActive}` : ''}
          </p>
          {row.role === 'technician' && (row.tradeLevelLabel || row.experienceYearsLabel) && (
            <p className="mt-1 text-[11px] text-slate-500">
              {[row.tradeLevelLabel, row.experienceYearsLabel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {actions}
          <button
            type="button"
            onClick={() => onViewProfile?.(row)}
            className="text-[11px] font-semibold text-tf-blue flex items-center gap-0.5"
          >
            View
            <FaChevronRight className="w-2 h-2" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersTable({
  rows,
  columns,
  loading,
  loadError,
  emptyVariant,
  onEmptyAction,
  onRetry,
  selectedIds,
  onSelect,
  onSelectAll,
  onRowClick,
  onViewProfile,
  onMasquerade,
  onSendEmail,
  onResetPassword,
  onDelete,
  onPlaceholderAction,
  masqueradeBusyId,
  sortKey,
  sortDir,
  onSort,
  onColumnWidthChange,
  onResetColumnWidth,
}) {
  const [pageSize, setPageSize] = useState(readStoredPageSize);
  const [page, setPage] = useState(1);
  const [draftWidths, setDraftWidths] = useState({});
  const selectAllRef = useRef(null);
  const rowsSignature = `${rows.length}:${rows[0]?.id ?? ''}:${rows[rows.length - 1]?.id ?? ''}`;

  useEffect(() => {
    setPage(1);
  }, [rowsSignature, pageSize]);

  useEffect(() => () => {
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  }, []);

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);
  const tableWidth = useMemo(
    () =>
      CHECKBOX_COL_WIDTH +
      ACTIONS_COL_WIDTH +
      visibleColumns.reduce((sum, col) => sum + columnWidthPx(col, draftWidths), 0),
    [visibleColumns, draftWidths]
  );

  const handleDraftWidth = (key, width) => {
    setDraftWidths((prev) => {
      if (width == null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === width) return prev;
      return { ...prev, [key]: width };
    });
  };

  const handleCommitWidth = (key, width) => {
    setDraftWidths((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    onColumnWidthChange?.(key, width);
  };

  const handleResetWidth = (key) => {
    setDraftWidths((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    onResetColumnWidth?.(key);
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const getVal = (row, key) => {
        switch (key) {
          case 'user': return row.displayName?.toLowerCase() || '';
          case 'type': return row.role || '';
          case 'status': return row.accountStatus || '';
          case 'verification': return row.verificationStatus || '';
          case 'company_trade': return row.companyTradeLabel || '';
          case 'trade_level': return TRADE_LEVEL_RANK[row.tradeLevelSlug] || 0;
          case 'experience_years': return row.experienceYears ?? -1;
          case 'location': return row.locationLabel || '';
          case 'city': return row.cityLabel || '';
          case 'state': return row.stateLabel || '';
          case 'membership_tier': return row.membershipTier || '';
          case 'activity': return row.logins30d ?? 0;
          case 'jobs': return row.jobsSummary?.accepted ?? row.jobsSummary?.posted ?? 0;
          case 'joined': return row.created_at ? new Date(row.created_at).getTime() : 0;
          case 'last_login': return row.lastLoginAt ? new Date(row.lastLoginAt).getTime() : 0;
          case 'risk': return row.riskLevel || '';
          default: return '';
        }
      };
      const av = getVal(a, sortKey);
      const bv = getVal(b, sortKey);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const pageInfo = useMemo(
    () => paginateItems(sortedRows, page, pageSize),
    [sortedRows, page, pageSize]
  );
  const pagedRows = pageInfo.items;
  const pageIds = useMemo(() => pagedRows.map((r) => r.id), [pagedRows]);
  const allSelected = pagedRows.length > 0 && pagedRows.every((r) => selectedIds.has(r.id));
  const someSelected = pagedRows.some((r) => selectedIds.has(r.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    persistPageSize(size);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-0 w-full rounded-lg border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <TableRowsSkeleton />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 min-h-0 w-full flex flex-col">
        <UsersEmptyState variant="error" onAction={onRetry} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 min-h-0 w-full flex flex-col">
        <UsersEmptyState variant={emptyVariant} onAction={onEmptyAction} />
      </div>
    );
  }

  const rowActions = (row, compact = false) => (
    <UserRowActionsMenu
      user={row}
      onMasquerade={onMasquerade}
      onSendEmail={onSendEmail}
      onResetPassword={onResetPassword}
      onDelete={onDelete}
      onPlaceholderAction={onPlaceholderAction}
      masqueradeBusy={masqueradeBusyId === row.id}
      compact={compact}
    />
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      <div className="lg:hidden flex-1 min-h-0 space-y-2 overflow-y-auto">
        {pagedRows.map((row) => (
          <UserMobileCard
            key={row.id}
            row={row}
            selected={selectedIds.has(row.id)}
            onSelect={onSelect}
            onRowClick={onRowClick}
            onViewProfile={onViewProfile}
            actions={rowActions(row, true)}
          />
        ))}
      </div>
      <div className="lg:hidden shrink-0 mt-2 rounded-lg border border-slate-200/90 bg-white overflow-hidden">
        <TablePaginationBar
          pageInfo={pageInfo}
          pageSize={pageInfo.pageSize}
          onPageSizeChange={handlePageSizeChange}
          onPageChange={setPage}
        />
      </div>

      <div className="hidden lg:flex flex-1 min-h-0 w-full flex-col rounded-lg border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="table-fixed" style={{ width: tableWidth, minWidth: tableWidth }}>
            <colgroup>
              <col style={{ width: CHECKBOX_COL_WIDTH }} />
              {visibleColumns.map((col) => (
                <col
                  key={col.key}
                  className={colHiddenClass(col.key, true)}
                  style={{ width: columnWidthPx(col, draftWidths) }}
                />
              ))}
              <col style={{ width: ACTIONS_COL_WIDTH }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/80">
              <tr>
                <th className="px-1.5 py-2" style={{ width: CHECKBOX_COL_WIDTH }}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onSelectAll(e.target.checked, pageIds)}
                    aria-label="Select all on this page"
                    className="rounded border-slate-300"
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`group/col relative px-1.5 py-2 text-left min-w-0 ${colHiddenClass(col.key)}`}
                    style={{ width: columnWidthPx(col, draftWidths) }}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      title={col.label}
                      className={`group inline-flex max-w-[calc(100%-8px)] items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-left leading-none whitespace-nowrap ${
                        sortKey === col.key ? 'text-tf-blue' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span className="whitespace-nowrap">{col.label}</span>
                      <SortIndicator colKey={col.key} sortKey={sortKey} sortDir={sortDir} />
                    </button>
                    <ColumnResizeHandle
                      colKey={col.key}
                      currentWidth={columnWidthPx(col, draftWidths)}
                      onDraftWidth={handleDraftWidth}
                      onCommitWidth={handleCommitWidth}
                      onResetWidth={handleResetWidth}
                    />
                  </th>
                ))}
                <th className="px-1.5 py-2" style={{ width: ACTIONS_COL_WIDTH }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick(row)}
                  className="group/row hover:bg-slate-50/90 cursor-pointer transition-colors"
                >
                  <td className="px-1.5 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => onSelect(row.id)}
                      aria-label={`Select ${row.displayName}`}
                      className="rounded border-slate-300"
                    />
                  </td>
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={`px-1.5 py-2 align-middle min-w-0 overflow-hidden ${colHiddenClass(col.key)}`}>
                      {renderCell(col, row)}
                    </td>
                  ))}
                  <td className="px-1 py-2 text-right align-middle" style={{ width: ACTIONS_COL_WIDTH }} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5 opacity-70 group-hover/row:opacity-100 transition-opacity">
                      <Link
                        to={`/admin/users/${row.id}`}
                        className="p-1 rounded-md text-slate-400 hover:text-tf-blue hover:bg-blue-50/50 transition-colors"
                        title="View profile"
                      >
                        <FaChevronRight className="w-3 h-3" />
                      </Link>
                      {rowActions(row, true)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePaginationBar
          pageInfo={pageInfo}
          pageSize={pageInfo.pageSize}
          onPageSizeChange={handlePageSizeChange}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
