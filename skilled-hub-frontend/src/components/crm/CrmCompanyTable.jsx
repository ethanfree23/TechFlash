import React, { useEffect } from 'react';
import { FaSort, FaSortDown, FaSortUp } from 'react-icons/fa';
import { CrmStatusBadge } from './CrmBadges';
import {
  companyTypeLabel,
  formatCrmDate,
  getCompanyDisplayName,
  getPrimaryContactPreview,
  getRelationshipTemperature,
  isLinkedToPlatformAccount,
} from '../../utils/crmDisplayAdapter';
import { usStateAbbreviation } from '../../utils/crmUsState';

const COLUMN_SORTS = {
  status: ['status_asc', 'status_desc'],
  market: ['city_asc', 'city_desc'],
  linked_account: ['unlinked_first'],
  updated: ['updated_desc', 'updated_asc'],
};

const COMPANY_SORTS = ['name_asc', 'name_desc'];

function nextSort(current, cycle) {
  const idx = cycle.indexOf(current);
  if (idx < 0) return cycle[0];
  return cycle[(idx + 1) % cycle.length];
}

function SortIcon({ active, descending }) {
  if (!active) return <FaSort className="h-2.5 w-2.5 text-slate-300" aria-hidden />;
  if (descending) return <FaSortDown className="h-2.5 w-2.5 text-tf-blue" aria-hidden />;
  return <FaSortUp className="h-2.5 w-2.5 text-tf-blue" aria-hidden />;
}

function locationLabel(row) {
  const city = String(row?.city || '').trim();
  const state = usStateAbbreviation(row?.state) || String(row?.state || '').trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || '';
}

function labelTrade(type) {
  if (type === 'hvac') return 'HVAC';
  return companyTypeLabel(type);
}

function tradeLabel(row) {
  const types = Array.isArray(row?.company_types) ? row.company_types.filter(Boolean) : [];
  if (!types.length) return '';
  const first = labelTrade(types[0]);
  if (types.length === 1) return first;
  return `${first} +${types.length - 1}`;
}

function contactMeta(row) {
  const preview = getPrimaryContactPreview(row);
  const contacts = Array.isArray(row?.contacts) ? row.contacts : [];
  const primary = contacts.find((c) => c && (c.is_primary === true || c.is_primary === 'true')) || contacts[0];
  return {
    name: preview.name,
    email: preview.email || String(row?.company_email || '').trim(),
    phone: preview.phone || String(row?.company_phone || row?.phone || '').trim(),
    title: String(primary?.job_title || '').trim(),
  };
}

function Missing({ label }) {
  return (
    <span className="text-slate-400" title={label}>
      —
    </span>
  );
}

export default function CrmCompanyTable({
  loading,
  totalCount,
  rows,
  columns,
  sortId,
  onSort,
  selectedId,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onOpen,
  onMerge,
  onClearFilters,
  onExportSelected,
  onDeleteSelected,
  onAddCompany,
  onImport,
  emptyBecauseFilters,
  className = '',
}) {
  const list = Array.isArray(rows) ? rows : [];
  const visibleColumns = (Array.isArray(columns) ? columns : []).filter((col) => col.visible !== false);
  const selectedSet = new Set(selectedIds || []);
  const visibleIds = list.map((item) => item.lead?.id).filter((id) => id != null);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const someChecked = visibleIds.some((id) => selectedSet.has(id));
  const selectedCount = (selectedIds || []).length;

  useEffect(() => {
    if (selectedId == null) return;
    const el = document.getElementById(`crm-company-row-${selectedId}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const renderSortableHeader = (label, cycle) => {
    if (!cycle) {
      return <span>{label}</span>;
    }
    const active = cycle.includes(sortId);
    const descending = sortId.endsWith('_desc') || sortId === 'unlinked_first';
    return (
      <button
        type="button"
        onClick={() => onSort?.(nextSort(sortId, cycle))}
        className={`inline-flex items-center gap-1 hover:text-slate-800 focus:outline-none focus-visible:text-tf-blue ${
          active ? 'text-tf-blue' : ''
        }`}
      >
        {label}
        <SortIcon active={active} descending={active && descending} />
        <span className="sr-only">{active ? 'Sorted' : 'Sort'}</span>
      </button>
    );
  };

  const renderCell = (col, row, contact) => {
    if (col.key === 'contact') {
      return (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-800" title={contact.name || 'No primary contact'}>
            {contact.name || <span className="font-normal text-slate-400">No contact</span>}
          </div>
          {contact.title ? <div className="truncate text-[11px] text-slate-500">{contact.title}</div> : null}
        </div>
      );
    }
    if (col.key === 'status') {
      const rel = getRelationshipTemperature(row.status);
      return (
        <div className="flex flex-col items-start gap-0.5">
          <CrmStatusBadge status={row.status} />
          <span className="text-[10px] text-slate-400">{rel.label}</span>
        </div>
      );
    }
    if (col.key === 'trade') {
      const label = tradeLabel(row);
      const full = (row.company_types || []).map(labelTrade).join(', ');
      return label ? (
        <span className="text-slate-700" title={full}>
          {label}
        </span>
      ) : (
        <Missing label="No trade" />
      );
    }
    if (col.key === 'market') {
      const label = locationLabel(row);
      return label ? <span className="text-slate-700">{label}</span> : <Missing label="No city" />;
    }
    if (col.key === 'phone') {
      return contact.phone ? (
        <a href={`tel:${String(contact.phone).replace(/[^\d+]/g, '')}`} className="whitespace-nowrap text-slate-700 hover:text-tf-blue hover:underline" onClick={(e) => e.stopPropagation()}>
          {contact.phone}
        </a>
      ) : (
        <Missing label="Missing phone" />
      );
    }
    if (col.key === 'email') {
      return contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          title={contact.email}
          className="block max-w-[14rem] truncate text-slate-700 hover:text-tf-blue hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {contact.email}
        </a>
      ) : (
        <Missing label="Missing email" />
      );
    }
    if (col.key === 'linked_account') {
      const linked = isLinkedToPlatformAccount(row);
      if (!linked) {
        return (
          <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
            Unlinked
          </span>
        );
      }
      const accountName = String(row.linked_account?.company_name || '').trim();
      return (
        <span
          className="inline-flex max-w-[12rem] truncate rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800"
          title={accountName ? `Linked to ${accountName}` : 'Linked to a TechFlash account'}
        >
          {accountName || 'Linked'}
        </span>
      );
    }
    if (col.key === 'notes') {
      const count = Number(row.notes_count) || 0;
      return <span className="tabular-nums text-slate-600">{count}</span>;
    }
    if (col.key === 'updated') {
      return <span className="whitespace-nowrap text-slate-600">{formatCrmDate(row.updated_at || row.created_at)}</span>;
    }
    return null;
  };

  const shown = list.length;
  const total = Number(totalCount) || 0;
  const countLabel = shown === total ? `${total} ${total === 1 ? 'company' : 'companies'}` : `${shown} of ${total} companies`;

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="text-xs font-semibold text-slate-700">{loading ? 'Loading companies…' : countLabel}</div>
        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs" role="region" aria-label="Bulk actions">
            <span className="font-semibold text-slate-800">{selectedCount} selected</span>
            <button
              type="button"
              onClick={onExportSelected}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-800 hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-2 p-3" aria-busy="true">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((key) => (
              <div key={key} className="h-9 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-16 text-center">
            {emptyBecauseFilters ? (
              <>
                <p className="text-sm font-semibold text-slate-800">No companies match these filters</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">Try a different search, or clear the active filters.</p>
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-800">No companies yet</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                  Import contractor lists or add a company to start tracking outreach.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={onImport} className="rounded-lg bg-tf-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-tf-blue-dark">
                    Import prospects
                  </button>
                  <button type="button" onClick={onAddCompany} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Add company
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[920px] border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked;
                    }}
                    onChange={() => onToggleAll?.(visibleIds, !allChecked)}
                    aria-label={allChecked ? 'Deselect all visible companies' : 'Select all visible companies'}
                    className="rounded border-slate-300 text-tf-blue focus:ring-tf-blue/30"
                  />
                </th>
                <th className="min-w-[14rem] px-3 py-2">{renderSortableHeader('Company', COMPANY_SORTS)}</th>
                {visibleColumns.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-3 py-2" aria-sort={COLUMN_SORTS[col.key]?.includes(sortId) ? (sortId.endsWith('_desc') || sortId === 'unlinked_first' ? 'descending' : 'ascending') : 'none'}>
                    {renderSortableHeader(col.label, COLUMN_SORTS[col.key])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((item) => {
                const row = item.lead;
                const name = getCompanyDisplayName(row);
                const contact = contactMeta(row);
                const selected = selectedId === row.id;
                const checked = selectedSet.has(row.id);
                const dup = item.duplicateCrRecordsCount > 1 && item.mergeSiblingLeadId != null;
                return (
                  <tr
                    key={row.id}
                    id={`crm-company-row-${row.id}`}
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={() => onOpen?.(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen?.(row.id);
                      }
                    }}
                    className={`cursor-pointer border-b border-slate-100 align-middle outline-none transition-colors hover:bg-slate-50 focus-visible:bg-sky-50/70 ${
                      selected ? 'bg-sky-50' : 'bg-white'
                    }`}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleRow?.(row.id)}
                        aria-label={`Select ${name}`}
                        className="rounded border-slate-300 text-tf-blue focus:ring-tf-blue/30"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-8 w-1 shrink-0 rounded-full ${selected ? 'bg-tf-blue' : 'bg-transparent'}`} aria-hidden />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900" title={name}>
                            {name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {dup ? (
                              <button
                                type="button"
                                className="rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-900 hover:bg-amber-100"
                                title="Open merge with the other CRM record for this company"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMerge?.(row.id, item.mergeSiblingLeadId);
                                }}
                              >
                                {item.duplicateCrRecordsCount} records · Merge
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    {visibleColumns.map((col) => (
                      <td key={col.key} className="px-3 py-2 text-slate-700">
                        {renderCell(col, row, contact)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
