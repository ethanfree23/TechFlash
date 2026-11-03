import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import { jobTemplatesAPI } from '../../api/api';

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none';

/**
 * Saves an existing job's reusable setup as a company template. Dates, funding, status
 * and the assigned technician are left on the job — only the work configuration is stored.
 *
 * When the company already has templates, the user can either overwrite one they pick or
 * save this job as a brand-new template.
 */
const SaveJobTemplateModal = ({ isOpen, onClose, job, onSaved }) => {
  const [name, setName] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveMode, setSaveMode] = useState('new'); // 'new' | 'override'
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');

  const selectedTemplate =
    templates.find((t) => String(t.id) === String(selectedTemplateId)) || null;

  useEffect(() => {
    if (!isOpen) return;
    setName(job?.title ? String(job.title) : '');
    setSelectedTemplateId('');
    setSaveMode('new');
    setError('');
    setTemplates([]);

    let cancelled = false;
    const load = async () => {
      setLoadingList(true);
      try {
        const params = job?.company_profile_id
          ? { company_profile_id: job.company_profile_id }
          : {};
        const list = await jobTemplatesAPI.list(params);
        if (!cancelled) setTemplates(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setTemplates([]);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, job]);

  const canSubmit =
    saveMode === 'override'
      ? Boolean(selectedTemplate)
      : Boolean(name.trim());

  const handleSave = async (event) => {
    event?.preventDefault?.();
    if (!job?.id || !canSubmit) return;
    setBusy(true);
    setError('');
    try {
      let result;
      if (saveMode === 'override' && selectedTemplate) {
        result = await jobTemplatesAPI.update(selectedTemplate.id, {
          from_job_id: job.id,
        });
      } else {
        result = await jobTemplatesAPI.create({
          name: name.trim(),
          from_job_id: job.id,
          company_profile_id: job.company_profile_id,
        });
      }
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not save this job as a template.');
    } finally {
      setBusy(false);
    }
  };

  const hasExisting = templates.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      ariaHideApp={false}
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      overlayClassName="fixed inset-0 bg-black/40 z-40"
    >
      <form onSubmit={handleSave} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Save as template</h2>
          <p className="mt-1 text-sm text-slate-600">
            Keeps the work details, pay, duration and schedule pattern so you can post this
            setup again with a new start date. This job itself is unchanged.
          </p>
        </div>

        {loadingList ? (
          <p className="text-sm text-slate-500">Loading existing templates…</p>
        ) : hasExisting ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-800 mb-1">How do you want to save?</legend>
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/40">
              <input
                type="radio"
                name="save-job-template-mode"
                className="mt-1"
                checked={saveMode === 'new'}
                onChange={() => {
                  setSaveMode('new');
                  setError('');
                }}
              />
              <span className="text-sm text-slate-800">
                <span className="font-semibold">Save as a new template</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/40">
              <input
                type="radio"
                name="save-job-template-mode"
                className="mt-1"
                checked={saveMode === 'override'}
                onChange={() => {
                  setSaveMode('override');
                  setError('');
                }}
              />
              <span className="text-sm text-slate-800">
                <span className="font-semibold">Update an existing template</span>
                <span className="block text-xs text-slate-600 mt-0.5">
                  Overwrite a saved setup with this job&apos;s configuration.
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        {saveMode === 'override' && hasExisting ? (
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800 mb-1.5">Template to update</span>
            <select
              className={fieldClass}
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              autoFocus
            >
              <option value="">Select a template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800 mb-1.5">Template name</span>
            <input
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly HVAC maintenance crew"
              autoFocus
            />
          </label>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !canSubmit}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-45"
          >
            {busy
              ? 'Saving…'
              : saveMode === 'override' && selectedTemplate
                ? `Update "${selectedTemplate.name}"`
                : 'Save template'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SaveJobTemplateModal;
