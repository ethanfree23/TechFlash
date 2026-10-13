import React, { useEffect, useMemo, useState } from 'react';
import { FaCheck, FaCopy, FaDownload, FaTimes } from 'react-icons/fa';
import { crmAPI } from '../../api/api';
import { CRM_NOTE_CONTACT_METHODS, CRM_STATUSES } from '../../utils/crmConstants';
import {
  NOTES_LOADER_CHATGPT_PROMPT,
  NOTES_LOADER_TEMPLATE_HEADERS,
  buildNotesLoaderDraftRows,
  buildNotesLoaderTemplateRows,
  contactsFromRow,
  matchRowsToLeads,
  normalizeNotesLoaderRow,
  summarizeNotesLoaderRows,
  toNotesLoaderSubmitRow,
} from '../../utils/crmNotesLoader';
import { parseCsv } from '../../utils/crmImport';
import { downloadXlsx, readSpreadsheetFile } from '../../utils/spreadsheetFile';

const METHOD_LABELS = { call: 'Call', text: 'Text', email: 'Email', in_person: 'In person', note: 'Note' };

const MATCH_BADGE = {
  matched: { label: 'Matched', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ambiguous: { label: 'Ambiguous', className: 'bg-red-50 text-red-700 border-red-200' },
  missing: { label: 'New company', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  new_in_batch: { label: 'New (above)', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const OUTCOME_LABELS = {
  applied: { label: 'Added', className: 'text-emerald-700' },
  created: { label: 'Company created', className: 'text-amber-700' },
  error: { label: 'Failed', className: 'text-red-700' },
  skipped: { label: 'Skipped', className: 'text-gray-500' },
};

const parsePastedSheet = (text) => {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!raw.trim()) return [];
  if (raw.includes('\t')) {
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.split('\t'));
  }
  return parseCsv(raw);
};

const rowNeedsAttention = (row) => row._errors?.length > 0 || row._match?.status === 'ambiguous';

export default function CrmNotesLoaderModal({ isOpen, leads, onClose, onApplied, onOpenCompany }) {
  const [rows, setRows] = useState([]);
  const [sheetInfo, setSheetInfo] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [createMissing, setCreateMissing] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRows([]);
    setSheetInfo(null);
    setPasteText('');
    setFilter('all');
    setParseError('');
    setResult(null);
    setPromptOpen(false);
    setPromptCopied(false);
  }, [isOpen]);

  const matchedRows = useMemo(() => matchRowsToLeads(rows, leads || []), [rows, leads]);
  const summary = useMemo(() => summarizeNotesLoaderRows(matchedRows), [matchedRows]);
  const visibleRows = useMemo(
    () =>
      matchedRows
        .map((row, idx) => ({ row, idx }))
        .filter(({ row }) => {
          if (filter === 'attention') return rowNeedsAttention(row);
          if (filter === 'new') return row._match?.status === 'missing' || row._match?.status === 'new_in_batch';
          return true;
        }),
    [matchedRows, filter],
  );

  if (!isOpen) return null;

  const loadSheet = (rows2d, sourceLabel) => {
    const built = buildNotesLoaderDraftRows(rows2d);
    if (!built.rows.length) {
      setParseError(`Could not find any rows in ${sourceLabel}. Make sure the sheet has a header row with at least a "website" and a "note" column.`);
      return;
    }
    setParseError('');
    setResult(null);
    setRows(built.rows);
    setSheetInfo({ ...built, sourceLabel });
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const rows2d = await readSpreadsheetFile(file);
      loadSheet(rows2d, file.name);
    } catch (err) {
      setParseError(err?.message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const onParsePaste = () => {
    const rows2d = parsePastedSheet(pasteText);
    loadSheet(rows2d, 'the pasted text');
  };

  const updateRow = (idx, key, value) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        // The company cell edits the URL; normalization moves a bare name back into company_name.
        const patch = key === 'company' ? { website: value, company_name: '' } : { [key]: value };
        return normalizeNotesLoaderRow({ ...row, ...patch }, row._rowNum);
      }),
    );
  };

  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const downloadTemplate = async () => {
    try {
      await downloadXlsx(buildNotesLoaderTemplateRows(), 'crm-notes-template.xlsx', 'Notes');
    } catch (err) {
      setParseError(err?.message || 'Could not build the template file.');
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(NOTES_LOADER_CHATGPT_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setPromptOpen(true);
    }
  };

  const applyRows = async () => {
    const blockers = matchedRows.filter(rowNeedsAttention);
    if (blockers.length) {
      setFilter('attention');
      setParseError(`${blockers.length} row(s) need attention before loading. Fix or remove them first.`);
      return;
    }
    if (!createMissing && summary.missing > 0) {
      setFilter('new');
      setParseError(`${summary.missing} row(s) point at companies that are not in the CRM. Turn on "Create missing companies" or fix their URLs.`);
      return;
    }
    setParseError('');
    setBusy(true);
    try {
      const payload = matchedRows.map(toNotesLoaderSubmitRow);
      const res = await crmAPI.importNotes(payload, { createMissing });
      setResult(res);
      const failedRows = new Set((res.results || []).filter((r) => r.outcome === 'error').map((r) => Number(r.row)));
      setRows((prev) => prev.filter((_, idx) => failedRows.has(idx + 1)));
      onApplied?.(res);
    } catch (err) {
      setParseError(err?.message || 'Could not load notes into the CRM.');
    } finally {
      setBusy(false);
    }
  };

  const hasRows = matchedRows.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crm-notes-loader-title"
    >
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 id="crm-notes-loader-title" className="text-lg font-semibold text-gray-900">
              Load sales notes from a spreadsheet
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              One row per note: the company URL finds the CRM record, the note lands on its timeline, and any new people are added as contacts.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                <FaDownload className="w-3 h-3" aria-hidden /> Download Excel template
              </button>
              <button
                type="button"
                onClick={copyPrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              >
                {promptCopied ? <FaCheck className="w-3 h-3 text-emerald-600" aria-hidden /> : <FaCopy className="w-3 h-3" aria-hidden />}
                {promptCopied ? 'Copied' : 'Copy ChatGPT prompt'}
              </button>
              <button
                type="button"
                onClick={() => setPromptOpen((v) => !v)}
                className="text-xs text-indigo-700 hover:underline"
              >
                {promptOpen ? 'Hide prompt' : 'Show prompt'}
              </button>
            </div>
            {promptOpen ? (
              <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-700 bg-white border border-gray-200 rounded-lg p-3 max-h-48 overflow-auto">
                {NOTES_LOADER_CHATGPT_PROMPT}
              </pre>
            ) : null}
            <p className="text-xs text-gray-500">
              Columns: <code className="text-[11px]">{NOTES_LOADER_TEMPLATE_HEADERS.join(', ')}</code>. Only <code className="text-[11px]">website</code> and{' '}
              <code className="text-[11px]">note</code> are required; headers are matched loosely (URL, Notes, Type, Follow up, Email, Phone, etc.).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block rounded-lg border border-gray-200 p-3">
              <span className="text-xs font-medium text-gray-500 uppercase">Excel or CSV file</span>
              <input
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                disabled={busy}
                className="mt-2 block w-full text-sm"
                onChange={onFileChange}
              />
              <span className="mt-2 block text-[11px] text-gray-500">The first sheet in the workbook is used.</span>
            </label>
            <div className="rounded-lg border border-gray-200 p-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-500 uppercase">Or paste rows from Excel</span>
                <textarea
                  className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[88px] bg-white"
                  placeholder={'website\tnote\tcontact_method\nacme.com\tSpoke with Pat…\tcall'}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  disabled={busy}
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !pasteText.trim()}
                  onClick={onParsePaste}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Parse pasted rows
                </button>
                <button
                  type="button"
                  disabled={busy || !pasteText}
                  onClick={() => setPasteText('')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {parseError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{parseError}</div>
          ) : null}

          {sheetInfo && !sheetInfo.headerDetected && hasRows ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No header row found in {sheetInfo.sourceLabel}; columns were assumed in template order ({NOTES_LOADER_TEMPLATE_HEADERS.slice(0, 4).join(', ')}, …).
            </div>
          ) : null}
          {sheetInfo?.unmappedHeaders?.length ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Ignored columns: {sheetInfo.unmappedHeaders.join(', ')}
            </div>
          ) : null}

          {hasRows ? (
            <div className="rounded-lg border border-gray-200 bg-white space-y-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{summary.total} rows</span>
                  {' · '}
                  <span className="text-emerald-700">{summary.matched} matched</span>
                  {' · '}
                  <span className={summary.missing ? 'text-amber-700' : 'text-gray-500'}>{summary.missing} new companies</span>
                  {' · '}
                  <span className={summary.ambiguous ? 'text-red-700' : 'text-gray-500'}>{summary.ambiguous} ambiguous</span>
                  {' · '}
                  <span className={summary.withErrors ? 'text-red-700' : 'text-gray-500'}>{summary.withErrors} with issues</span>
                  {' · '}
                  <span className="text-gray-600">{summary.notes} notes, {summary.contacts} contacts</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 bg-white"
                  >
                    <option value="all">Show all rows</option>
                    <option value="attention">Needs attention</option>
                    <option value="new">New companies</option>
                  </select>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={createMissing}
                      onChange={(e) => setCreateMissing(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Create missing companies
                  </label>
                  <button
                    type="button"
                    onClick={applyRows}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? 'Loading…' : `Load ${summary.total} row${summary.total === 1 ? '' : 's'} into CRM`}
                  </button>
                </div>
              </div>

              <div className="max-h-[40vh] overflow-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Row</th>
                      <th className="px-2 py-1.5 text-left min-w-[14rem]">Company</th>
                      <th className="px-2 py-1.5 text-left min-w-[18rem]">Note</th>
                      <th className="px-2 py-1.5 text-left">Method</th>
                      <th className="px-2 py-1.5 text-left">Reached</th>
                      <th className="px-2 py-1.5 text-left">Follow-up</th>
                      <th className="px-2 py-1.5 text-left">Status</th>
                      <th className="px-2 py-1.5 text-left min-w-[12rem]">New contacts</th>
                      <th className="px-2 py-1.5 text-left" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(({ row, idx }) => {
                      const badge = MATCH_BADGE[row._match?.status] || MATCH_BADGE.missing;
                      const contacts = contactsFromRow(row);
                      return (
                        <tr key={`${row._rowNum}-${idx}`} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-1.5 text-gray-500">{row._rowNum}</td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full border rounded px-1.5 py-0.5"
                              value={row.website || row.company_name}
                              placeholder="company URL"
                              onChange={(e) => updateRow(idx, 'company', e.target.value)}
                            />
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
                                {badge.label}
                              </span>
                              <span className="truncate text-gray-600" title={row._match?.leadName}>
                                {row._match?.leadName}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <textarea
                              className="w-full border rounded px-1.5 py-0.5 min-h-[3.5rem]"
                              value={row.note}
                              onChange={(e) => updateRow(idx, 'note', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="border rounded px-1 py-0.5"
                              value={row.contact_method}
                              onChange={(e) => updateRow(idx, 'contact_method', e.target.value)}
                            >
                              <option value="">Note</option>
                              {CRM_NOTE_CONTACT_METHODS.map((m) => (
                                <option key={m} value={m}>{METHOD_LABELS[m] || m}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="border rounded px-1 py-0.5"
                              value={row.made_contact}
                              onChange={(e) => updateRow(idx, 'made_contact', e.target.value)}
                            >
                              <option value="">—</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-28 border rounded px-1.5 py-0.5"
                              value={row.remind_at}
                              placeholder="YYYY-MM-DD"
                              onChange={(e) => updateRow(idx, 'remind_at', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="border rounded px-1 py-0.5"
                              value={CRM_STATUSES.includes(row.status) ? row.status : ''}
                              onChange={(e) => updateRow(idx, 'status', e.target.value)}
                            >
                              <option value="">No change</option>
                              {CRM_STATUSES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            {contacts.length ? (
                              <ul className="space-y-0.5">
                                {contacts.map((c, cIdx) => (
                                  <li key={cIdx} className="text-gray-700">
                                    <span className="font-medium">{c.name || c.email || c.phone}</span>
                                    {c.job_title ? <span className="text-gray-500"> · {c.job_title}</span> : null}
                                    {c.name && (c.email || c.phone) ? (
                                      <span className="block text-[11px] text-gray-500">{[c.email, c.phone].filter(Boolean).join(' · ')}</span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <button type="button" onClick={() => removeRow(idx)} className="text-red-700 hover:underline">
                              Remove
                            </button>
                            {row._errors?.length ? (
                              <div className="mt-1 text-red-700 whitespace-normal break-words max-w-[10rem]">{row._errors.join('; ')}</div>
                            ) : null}
                            {row._warnings?.length ? (
                              <div className="mt-1 text-amber-700 whitespace-normal break-words max-w-[10rem]">{row._warnings.join('; ')}</div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-lg border border-gray-200 p-3 text-sm space-y-2">
              <p className="font-medium text-gray-900">
                {result.notes_added || 0} note{result.notes_added === 1 ? '' : 's'} added, {result.contacts_added || 0} new contact
                {result.contacts_added === 1 ? '' : 's'}
                {result.contacts_updated ? `, ${result.contacts_updated} contact${result.contacts_updated === 1 ? '' : 's'} updated` : ''}
                {result.created_count ? `, ${result.created_count} compan${result.created_count === 1 ? 'y' : 'ies'} created` : ''}
                {result.failed_count ? `, ${result.failed_count} failed` : ''}.
              </p>
              <ul className="max-h-48 overflow-y-auto space-y-1 text-xs">
                {(result.results || []).map((r) => {
                  const outcome = OUTCOME_LABELS[r.outcome] || OUTCOME_LABELS.skipped;
                  return (
                    <li key={`${r.row}-${r.crm_lead_id || 'x'}`} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-gray-500">Row {r.row}</span>
                      <span className={`font-medium ${outcome.className}`}>{outcome.label}</span>
                      {r.crm_lead_id && onOpenCompany ? (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenCompany(r.crm_lead_id);
                            onClose();
                          }}
                          className="text-indigo-700 hover:underline"
                        >
                          {r.company_name || r.website}
                        </button>
                      ) : (
                        <span className="text-gray-700">{r.company_name || r.website}</span>
                      )}
                      {r.outcome !== 'error' ? (
                        <span className="text-gray-500">
                          {[
                            r.note_added ? 'note' : null,
                            r.contacts_added ? `${r.contacts_added} contact${r.contacts_added === 1 ? '' : 's'}` : null,
                            r.status_changed ? 'status' : null,
                          ]
                            .filter(Boolean)
                            .join(' + ')}
                        </span>
                      ) : null}
                      {r.errors?.length ? <span className="text-red-700">{r.errors.join('; ')}</span> : null}
                      {r.warnings?.length ? <span className="text-amber-700">{r.warnings.join('; ')}</span> : null}
                    </li>
                  );
                })}
              </ul>
              {result.failed_count ? (
                <p className="text-xs text-gray-500">Failed rows stay in the table above so you can fix and reload them.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {result ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
