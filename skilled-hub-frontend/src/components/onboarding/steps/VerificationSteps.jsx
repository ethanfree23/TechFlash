import React, { useEffect, useState } from 'react';
import {
  verificationAPI,
  verificationReferencesAPI,
  documentsAPI,
} from '../../../api/api';
import { OnboardingActions } from '../OnboardingShell';
import { VERIFICATION_SUBSTEPS } from '../onboardingSteps';

const inputClass =
  'w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-tf-orange focus:ring-2 focus:ring-tf-orange/20';

export default function VerificationSteps({
  section,
  substep = 'licenses',
  onSubstepChange,
  onBack,
  onContinue,
  onRefresh,
}) {
  const [center, setCenter] = useState(null);
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refForm, setRefForm] = useState({ full_name: '', email: '', phone: '', company_name: '', relationship: '' });
  const [licenseNote, setLicenseNote] = useState('');
  const [skipLicense, setSkipLicense] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [v, r] = await Promise.all([
        verificationAPI.getCenter(),
        verificationReferencesAPI.list().catch(() => []),
      ]);
      setCenter(v);
      setRefs(Array.isArray(r) ? r : r?.verification_references || r?.references || []);
    } catch (e) {
      setError(e.message || 'Could not load verification status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const licenseRequired = section?.license_required;
  const refCount = refs.length;
  const refsNeeded = Math.max(0, 3 - refCount);
  const bg = section?.background || {};

  const addReference = async () => {
    if (!refForm.full_name.trim()) {
      setError('Reference name is required.');
      return;
    }
    if (!refForm.email.trim() && !refForm.phone.trim()) {
      setError('Provide an email or phone for the reference.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await verificationReferencesAPI.create({
        full_name: refForm.full_name.trim(),
        email: refForm.email.trim() || undefined,
        phone: refForm.phone.trim() || undefined,
        company_name: refForm.company_name.trim() || undefined,
        relationship: refForm.relationship.trim() || undefined,
      });
      setRefForm({ full_name: '', email: '', phone: '', company_name: '', relationship: '' });
      await load();
      await onRefresh?.();
    } catch (e) {
      setError(e.message || 'Could not add reference.');
    } finally {
      setSaving(false);
    }
  };

  const uploadLicense = async (file) => {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', 'license');
      if (licenseNote.trim()) fd.append('title', licenseNote.trim());
      await documentsAPI.upload(fd);
      await load();
      await onRefresh?.();
    } catch (e) {
      setError(e.message || 'Could not upload credential.');
    } finally {
      setSaving(false);
    }
  };

  const startBackground = async () => {
    setSaving(true);
    setError('');
    try {
      await verificationAPI.startBackgroundCheck();
      await load();
      await onRefresh?.();
    } catch (e) {
      setError(e.message || 'Could not start background check.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    setError('');
    if (substep === 'licenses') {
      if (licenseRequired && !skipLicense) {
        const docs = center?.documents || center?.checklist?.licenses || [];
        const hasDoc = Array.isArray(docs) ? docs.length > 0 : section?.missing?.includes('trade_license') === false;
        if (section?.missing?.includes('trade_license') && !hasDoc) {
          setError('Upload a license or certification, or confirm you do not have one to upload yet.');
          return;
        }
      }
      onSubstepChange('references');
      return;
    }
    if (substep === 'references') {
      if (refCount < 3) {
        setError(`Add ${refsNeeded} more professional reference${refsNeeded === 1 ? '' : 's'} to continue.`);
        return;
      }
      onSubstepChange('background');
      return;
    }
    // background: technician must have started OR already verified/processing
    if (section?.missing?.includes('background_check')) {
      setError('Start your background check to continue. External review can finish after setup.');
      return;
    }
    onContinue();
  };

  const handleBack = () => {
    const idx = VERIFICATION_SUBSTEPS.findIndex((s) => s.key === substep);
    if (idx > 0) onSubstepChange(VERIFICATION_SUBSTEPS[idx - 1].key);
    else onBack();
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading verification…</p>;
  }

  return (
    <div>
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {VERIFICATION_SUBSTEPS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSubstepChange(s.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              substep === s.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {substep === 'licenses' ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {licenseRequired
              ? 'Upload applicable trade licenses or certifications. Existing valid credentials already on file count.'
              : 'If you have trade licenses or certifications, upload them here. This is optional unless you claim a credential.'}
          </p>
          {(center?.documents || []).length > 0 ? (
            <ul className="space-y-2">
              {(center.documents || []).map((doc) => (
                <li key={doc.id || doc.title} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="font-medium">{doc.title || doc.doc_type || 'Credential'}</span>
                  {doc.status ? <span className="ml-2 text-slate-500">· {doc.status}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No credentials uploaded yet.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={inputClass}
              placeholder="Credential title (optional)"
              value={licenseNote}
              onChange={(e) => setLicenseNote(e.target.value)}
            />
            <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Upload file
              <input
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={(e) => uploadLicense(e.target.files?.[0])}
              />
            </label>
          </div>
          {!licenseRequired ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={skipLicense} onChange={(e) => setSkipLicense(e.target.checked)} />
              I don&apos;t have a license to upload right now
            </label>
          ) : null}
        </div>
      ) : null}

      {substep === 'references' ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Provide three professional references. Existing references already on file are preserved.
          </p>
          <p className="text-sm font-semibold text-slate-800">{refCount} of 3 submitted</p>
          <ul className="space-y-2">
            {refs.map((ref) => (
              <li key={ref.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <span className="font-medium">{ref.full_name}</span>
                {ref.company_name ? <span className="text-slate-500"> · {ref.company_name}</span> : null}
                {ref.status ? <span className="ml-2 text-xs text-slate-500">({ref.status})</span> : null}
              </li>
            ))}
          </ul>
          {refCount < 3 ? (
            <div className="grid gap-3 sm:grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <input className={inputClass} placeholder="Full name *" value={refForm.full_name} onChange={(e) => setRefForm((p) => ({ ...p, full_name: e.target.value }))} />
              <input className={inputClass} placeholder="Company" value={refForm.company_name} onChange={(e) => setRefForm((p) => ({ ...p, company_name: e.target.value }))} />
              <input className={inputClass} placeholder="Email" value={refForm.email} onChange={(e) => setRefForm((p) => ({ ...p, email: e.target.value }))} />
              <input className={inputClass} placeholder="Phone" value={refForm.phone} onChange={(e) => setRefForm((p) => ({ ...p, phone: e.target.value }))} />
              <input className={`${inputClass} sm:col-span-2`} placeholder="Relationship (e.g. Supervisor)" value={refForm.relationship} onChange={(e) => setRefForm((p) => ({ ...p, relationship: e.target.value }))} />
              <button
                type="button"
                onClick={addReference}
                disabled={saving}
                className="sm:col-span-2 min-h-12 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Add reference
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {substep === 'background' ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            A background check helps companies trust who they hire. You can finish account setup while Checkr or TechFlash finishes reviewing — you just need to start the process.
          </p>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Status</p>
            <p className="mt-1 text-sm text-slate-700">
              {bg.verified
                ? 'Verified'
                : bg.label || bg.state || bg.color_bucket || 'Not started'}
            </p>
          </div>
          {!bg.verified && section?.missing?.includes('background_check') ? (
            <button
              type="button"
              onClick={startBackground}
              disabled={saving}
              className="min-h-12 rounded-xl bg-tf-orange px-5 text-sm font-bold text-white hover:bg-tf-orange-hover disabled:opacity-50"
            >
              {saving ? 'Starting…' : 'Start background check'}
            </button>
          ) : (
            <p className="text-sm text-emerald-700 font-medium">
              You&apos;ve completed the actions required from you for the background check.
            </p>
          )}
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

      <div className="mt-8">
        <OnboardingActions onBack={handleBack} onContinue={handleContinue} loading={saving} />
      </div>
    </div>
  );
}
