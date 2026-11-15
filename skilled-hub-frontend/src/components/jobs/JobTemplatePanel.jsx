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
 *
 * When a template is selected (or was just applied) and the user saves the current setup,
 * they must choose: overwrite that template, or save the form as a brand-new template.
 */
const JobTemplatePanel = ({ companyProfileId, getConfiguration, onApply }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  // Remembers the template last applied into the form, so Save can offer "update it"
  // even if the dropdown selection later drifts.
  const [appliedTemplateId, setAppliedTemplateId] = useState('');
  const [startDate, setStartDate] = useState(tomorrowDateString());
  const [newName, setNewName] = useState('');
  const [showSave, setShowSave] = useState(false);
  // 'new' | 'override' — only meaningful while showSave is open and a target exists.
  const [saveMode, setSaveMode] = useState('new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState(false);

  const selected = templates.find((t) => String(t.id) === String(selectedId)) || null;
  const applied =
    templates.find((t) => String(t.id) === String(appliedTemplateId)) || null;
  // Prefer the currently selected template; fall back to the one last applied into the form.
  const overrideTarget = selected || applied;

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

  const openSavePanel = () => {
    const nextOpen = !showSave;
    setShowSave(nextOpen);
    setError('');
    if (!nextOpen) return;

    const target = selected || applied;
    if (target) {
      setSaveMode('override');
      setNewName('');
    } else {
      setSaveMode('new');
      setNewName('');
    }
  };

  const handleApply = () => run('use this template', async () => {
    const result = await jobTemplatesAPI.apply(selected.id, { start_date: startDate });
    onApply(result.job_attributes || {});
    setAppliedTemplateId(String(selected.id));
    setNotice(`Filled from "${selected.name}". Review the dates and pay before posting.`);
    loadTemplates();
  });

  const handleSaveNew = () => run('save this template', async () => {
    const created = await jobTemplatesAPI.create({
      name: newName.trim(),
      configuration: getConfiguration(),
      company_profile_id: companyProfileId || undefined,
    });
    setNewName('');
    setShowSave(false);
    setSelectedId(String(created.id));
    setAppliedTemplateId(String(created.id));
    setNotice(`Saved "${created.name}" as a new template.`);
    loadTemplates();
  });

  const handleOverwrite = () => run('update this template', async () => {
    if (!overrideTarget) return;
    await jobTemplatesAPI.update(overrideTarget.id, { configuration: getConfiguration() });
    setShowSave(false);
    setConfirmOverride(false);
    setSelectedId(String(overrideTarget.id));
    setAppliedTemplateId(String(overrideTarget.id));
    setNotice(`Updated "${overrideTarget.name}" with the current form values.`);
    loadTemplates();
  });

  const handleRename = () => run('rename this template', async () => {
    if (!overrideTarget) return;
    const name = newName.trim();
    if (!name) return;
    await jobTemplatesAPI.update(overrideTarget.id, { name });
    setNewName('');
    setNotice(`Renamed to "${name}".`);
    loadTemplates();
  });

  const handleDelete = () => run('delete this template', async () => {
    await jobTemplatesAPI.remove(selected.id);
    setSelectedId('');
    if (String(appliedTemplateId) === String(selected.id)) setAppliedTemplateId('');
    setNotice('Template deleted.');
    loadTemplates();
  });

  const canSave =
    saveMode === 'override'
      ? Boolean(overrideTarget)
      : Boolean(newName.trim());

  const onPrimarySave = () => {
    if (saveMode === 'override' && overrideTarget) {
      setConfirmOverride(true);
      return;
    }
    handleSaveNew();
  };

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
          onClick={openSavePanel}
        >
          {showSave ? 'Cancel save' : 'Save current setup'}
        </button>
      </div>

      {showSave && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Save this setup</p>

          {overrideTarget ? (
            <fieldset className="space-y-2">
              <legend className="sr-only">Choose how to save</legend>
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/50">
                <input
                  type="radio"
                  name="job-template-save-mode"
                  className="mt-1"
                  checked={saveMode === 'override'}
                  onChange={() => {
                    setSaveMode('override');
                    setNewName('');
                    setError('');
                  }}
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Update selected template
                  </span>
                  <span className="block text-xs text-slate-600 mt-0.5">
                    Overwrite &ldquo;{overrideTarget.name}&rdquo; with the current form values.
                    Existing jobs posted from it are not changed.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/50">
                <input
                  type="radio"
                  name="job-template-save-mode"
                  className="mt-1"
                  checked={saveMode === 'new'}
                  onChange={() => {
                    setSaveMode('new');
                    setError('');
                  }}
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Save as a new template
                  </span>
                  <span className="block text-xs text-slate-600 mt-0.5">
                    Keep &ldquo;{overrideTarget.name}&rdquo; as-is and create another reusable setup.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : (
            <p className="text-xs text-slate-600">
              No template is selected. Enter a name to save this form as a new template.
            </p>
          )}

          {(saveMode === 'new' || !overrideTarget) && (
            <div>
              <label className={labelClass} htmlFor="job-template-name">New template name</label>
              <input
                id="job-template-name"
                className={fieldClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Weekly HVAC maintenance crew"
                autoFocus={!overrideTarget || saveMode === 'new'}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !canSave}
              onClick={onPrimarySave}
            >
              {saveMode === 'override' && overrideTarget
                ? `Update "${overrideTarget.name}"`
                : 'Save as new template'}
            </button>
            {overrideTarget && saveMode === 'new' && (
              <button
                type="button"
                className={btnSecondary}
                disabled={busy || !newName.trim()}
                onClick={handleRename}
                title={`Rename "${overrideTarget.name}" without changing its saved setup`}
              >
                Rename "{overrideTarget.name}" only
              </button>
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
            {!selected && applied && (
              <p className="text-xs text-slate-600 mt-1">
                Form was filled from &ldquo;{applied.name}&rdquo;. Saving can update that template
                or create a new one.
              </p>
            )}
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
              Rolls forward to the template&apos;s next working day if this date is not one.
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
          No templates yet. Fill in this form and choose &ldquo;Save current setup&rdquo; to reuse it later.
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

      <ConfirmModal
        isOpen={confirmOverride}
        onClose={() => setConfirmOverride(false)}
        onConfirm={() => {
          setConfirmOverride(false);
          handleOverwrite();
        }}
        title="Update template?"
        message={`Replace the saved setup for "${overrideTarget?.name || ''}" with the current form values? Jobs already posted from this template are not affected.`}
        confirmLabel="Update template"
      />
    </div>
  );
};

export default JobTemplatePanel;
