import React from 'react';
import { FaChevronRight } from 'react-icons/fa';
import { TechnicianCell, ItemStatusBadge, PriorityBadge, Pagination, TableSkeleton, EmptyState, ErrorState } from './primitives';
import { formatRelative, formatDate, isBulkSelectable } from '../../../utils/trustSafety';

const REVIEW_TYPE_ICON = {
  background_check: { label: 'BG', className: 'bg-slate-800 text-white' },
  document: { label: 'DOC', className: 'bg-tf-blue/10 text-tf-blue' },
  reference: { label: 'REF', className: 'bg-violet-50 text-violet-700' },
};

function ReviewTypeChip({ item }) {
  const chip = REVIEW_TYPE_ICON[item.item_type] || REVIEW_TYPE_ICON.document;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`inline-flex h-5 w-9 shrink-0 items-center justify-center rounded text-[9px] font-bold tracking-wide ${chip.className}`}>{chip.label}</span>
      <span className="text-xs text-slate-800 truncate">{item.review_type_label}</span>
    </div>
  );
}

export default function ReviewQueueTable({
  items,
  pagination,
  loading,
  error,
  selectedKey,
  checkedKeys,
  onToggleChecked,
  onToggleAll,
  onOpen,
  onPageChange,
  onPerPageChange,
  onRetry,
  emptyTitle = 'Queue is clear',
  emptyDescription = 'Nothing matches these filters. Adjust the filters or check back later.',
}) {
  const selectable = (items || []).filter(isBulkSelectable);
  const allChecked = selectable.length > 0 && selectable.every((it) => checkedKeys?.has(it.key));

  return (
    <div className="rounded-b-xl overflow-hidden">
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading && !items?.length ? (
        <TableSkeleton rows={8} cols={7} />
      ) : !items?.length ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th scope="col" className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all safe bulk items"
                      checked={allChecked}
                      disabled={selectable.length === 0}
                      onChange={() => onToggleAll?.(selectable.map((it) => it.key), !allChecked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-tf-blue focus:ring-tf-blue/40"
                    />
                  </th>
                  <th scope="col" className="px-3 py-2 min-w-[14rem]">Technician</th>
                  <th scope="col" className="px-3 py-2 min-w-[10rem]">Review Type</th>
                  <th scope="col" className="px-3 py-2 min-w-[12rem]">Submitted Item</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Submitted</th>
                  <th scope="col" className="px-3 py-2">Priority</th>
                  <th scope="col" className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 ${loading ? 'opacity-60' : ''}`}>
                {items.map((item) => {
                  const selected = selectedKey === item.key;
                  const checkable = isBulkSelectable(item);
                  return (
                    <tr
                      key={item.key}
                      data-item-key={item.key}
                      onClick={() => onOpen(item.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpen(item.key);
                        }
                      }}
                      tabIndex={0}
                      aria-selected={selected}
                      className={`group cursor-pointer outline-none transition-colors ${
                        selected ? 'bg-tf-blue/5 ring-1 ring-inset ring-tf-blue/30' : 'hover:bg-slate-50 focus-visible:bg-slate-50'
                      }`}
                    >
                      <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.technician?.display_name || 'item'}`}
                          checked={Boolean(checkedKeys?.has(item.key))}
                          disabled={!checkable}
                          title={checkable ? '' : 'Background checks cannot be bulk-selected'}
                          onChange={() => onToggleChecked?.(item.key)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-tf-blue focus:ring-tf-blue/40 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <TechnicianCell technician={item.technician} compact />
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <ReviewTypeChip item={item} />
                      </td>
                      <td className="px-3 py-2.5 align-middle min-w-0">
                        <div className="text-xs text-slate-900 truncate max-w-[18rem]" title={item.title || ''}>
                          {item.title || '—'}
                        </div>
                        {item.subtitle && <div className="text-[11px] text-slate-500 truncate max-w-[18rem]">{item.subtitle}</div>}
                        {item.action_reason && item.needs_review && (
                          <div className="text-[11px] text-orange-700 truncate max-w-[18rem]" title={item.action_reason}>
                            {item.action_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <ItemStatusBadge status={item.status} />
                        {item.status?.provider_label && item.status.provider_label !== item.status.label && (
                          <div className="text-[10px] text-slate-400 mt-0.5">Checkr: {item.status.provider_label}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        <div className="text-xs text-slate-800">{formatRelative(item.submitted_at)}</div>
                        <div className="text-[10px] text-slate-400">{formatDate(item.submitted_at)}</div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-tf-blue group-hover:underline">
                          Review <FaChevronRight className="h-2.5 w-2.5" aria-hidden="true" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onOpen(item.key)}
                  className={`w-full text-left px-3 py-3 space-y-2 ${selectedKey === item.key ? 'bg-tf-blue/5' : 'active:bg-slate-50'}`}
                >
                  <TechnicianCell technician={item.technician} compact stopPropagation />
                  <div className="flex items-center justify-between gap-2">
                    <ReviewTypeChip item={item} />
                    <ItemStatusBadge status={item.status} />
                  </div>
                  <div className="text-xs text-slate-800 truncate">{item.title}</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{formatRelative(item.submitted_at)}</span>
                    <PriorityBadge priority={item.priority} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <Pagination pagination={pagination} onPageChange={onPageChange} onPerPageChange={onPerPageChange} />
        </>
      )}
    </div>
  );
}
