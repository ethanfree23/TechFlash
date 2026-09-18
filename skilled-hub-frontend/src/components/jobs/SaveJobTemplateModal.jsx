import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import { jobTemplatesAPI } from '../../api/api';

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none';

/**
 * Saves an existing job's reusable setup as a company template. Dates, funding, status
 * and the assigned technician are left on the job — only the work configuration is stored.
 */
const SaveJobTemplateModal = ({ isOpen, onClose, job, onSaved }) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(job?.title ? String(job.title) : '');
    setError('');
  }, [isOpen, job]);

  const handleSave = async (event) => {
    event?.preventDefault?.();
    if (!job?.id || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await jobTemplatesAPI.create({
        name: name.trim(),
        from_job_id: job.id,
        company_profile_id: job.company_profile_id,
      });
      onSaved?.(created);
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not save this job as a template.');
    } finally {
      setBusy(false);
    }
  };

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
            disabled={busy || !name.trim()}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-45"
          >
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SaveJobTemplateModal;
