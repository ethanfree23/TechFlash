import React, { useCallback, useEffect, useState } from 'react';
import { jobTemplatesAPI } from '../../api/api';
import ConfirmModal from '../ConfirmModal';

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none';
const labelClass = 'block text-sm font-semibold text-slate-800 mb-1.5';
const btnBase =
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed px-3 py-2';
const btnPrimary = `${btnBase} bg-blue-600 text-white hover:bg-blue-700 font-semibold`;
const btnSecondary = `${btnBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;

const tomorrowDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const describeTemplate = (template) => {
  if (!template) return '';
  const bits = [];
  if (template.trade_type) bits.push(template.trade_type);
  if (template.duration_days) bits.push(`${template.duration_days} day${template.duration_days === 1 ? '' : 's'}`);
  if (template.schedule_start_time) bits.push(`starts ${template.schedule_start_time}`);
  if (template.use_count > 0) bits.push(`used ${template.use_count}×`);
  return bits.join(' · ');
};

/**
 * Save, reuse, rename and delete job templates from the create-job form.
 *
 * Applying a template asks the API for the job attributes it produces for the chosen
 * start date, then hands them to the form through `onApply` in the same shape a job has,
 * so the form fills itself exactly as it does when duplicating a job. The company always
 * picks the new start date; the template supplies the duration and schedule structure.
 */
const JobTemplatePanel = ({ companyProfileId, getConfiguration, onApply }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [startDate, setStartDate] = useState(tomorrowDateString());
  const [newName, setNewName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = templates.find((t) => String(t.id) === String(selectedId)) || null;

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = companyProfileId ? { company_profile_id: companyProfileId } : {};
      const list = await jobTemplatesAPI.list(params);
      setTemplates(Array.isArray(list) ? list : []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [companyProfileId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const run = async (label, fn) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(err?.message || `Could not ${label}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleApply = () => run('use this template', async () => {
    const result = await jobTemplatesAPI.apply(selected.id, { start_date: startDate });
    onApply(result.job_attributes || {});
    setNotice(`Filled from "${selected.name}". Review the dates and pay before posting.`);
    loadTemplates();
  });

  const handleSave = () => run('save this template', async () => {
    const created = await jobTemplatesAPI.create({
      name: newName.trim(),
      configuration: getConfiguration(),
      company_profile_id: companyProfileId || undefined,
    });
    setNewName('');
    setShowSave(false);
    setSelectedId(String(created.id));
    setNotice(`Saved "${created.name}".`);
    loadTemplates();
  });

  const handleOverwrite = () => run('update this template', async () => {
    await jobTemplatesAPI.update(selected.id, { configuration: getConfiguration() });
    setNotice(`Updated "${selected.name}" with the current form values.`);
    loadTemplates();
  });

  const handleRename = () => run('rename this template', async () => {
    const name = newName.trim();
    if (!name) return;
    await jobTemplatesAPI.update(selected.id, { name });
    setNewName('');
    setShowSave(false);
    setNotice(`Renamed to "${name}".`);
    loadTemplates();
  });

  const handleDelete = () => run('delete this template', async () => {
    await jobTemplatesAPI.remove(selected.id);
    setSelectedId('');
    setNotice('Template deleted.');
    loadTemplates();
  });

  return (
    <div
      className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3"
      // This panel sits inside the create-job form, so Enter in one of its inputs would
      // otherwise post the job.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Job templates</h3>
          <p className="text-xs text-slate-600">
            Reuse a saved setup instead of filling this form again. A template keeps the
            work details, pay, duration and schedule pattern — you choose the start date.
          </p>
        </div>
        <button
          type="button"
          className={btnSecondary}
          disabled={busy}
          onClick={() => {
            setShowSave((v) => !v);
            setNewName(selected ? selected.name : '');
          }}
        >
          Save current setup
        </button>
      </div>

      {showSave && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <label className={labelClass} htmlFor="job-template-name">Template name</label>
          <input
            id="job-template-name"
            className={fieldClass}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Weekly HVAC maintenance crew"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={busy || !newName.trim()} onClick={handleSave}>
              Save as new template
            </button>
            {selected && (
              <>
                <button type="button" className={btnSecondary} disabled={busy || !newName.trim()} onClick={handleRename}>
                  Rename "{selected.name}"
                </button>
                <button type="button" className={btnSecondary} disabled={busy} onClick={handleOverwrite}>
                  Replace "{selected.name}" with current values
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="job-template-select">Use a saved template</label>
            <select
              id="job-template-select"
              className={fieldClass}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select a template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selected && <p className="text-xs text-slate-600 mt-1">{describeTemplate(selected)}</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="job-template-start-date">New start date</label>
            <input
              id="job-template-start-date"
              type="date"
              className={fieldClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-xs text-slate-600 mt-1">
              Rolls forward to the template's next working day if this date is not one.
            </p>
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={busy || !selected || !startDate} onClick={handleApply}>
            Fill form from template
          </button>
          <button
            type="button"
            className={`${btnSecondary} text-red-700 border-red-200 hover:bg-red-50`}
            disabled={busy || !selected}
            onClick={() => setConfirmDelete(true)}
          >
            Delete template
          </button>
        </div>
      )}

      {!loading && templates.length === 0 && (
        <p className="text-xs text-slate-600">
          No templates yet. Fill in this form and choose "Save current setup" to reuse it later.
        </p>
      )}

      {notice && <p className="text-sm text-emerald-800">{notice}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          handleDelete();
        }}
        title="Delete template"
        message={`Delete "${selected?.name || ''}"? Jobs already posted from it are not affected.`}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
};

export default JobTemplatePanel;
