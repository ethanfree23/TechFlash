import React, { useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import SettingsBadge from './SettingsBadge';
import { isAllowedLicenseImageFile, LICENSE_IMAGE_ACCEPT } from '../../utils/licenseCredentials';

export default function LicenseDocumentModal({
  isOpen,
  card,
  onClose,
  onSave,
  saving = false,
}) {
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [formError, setFormError] = useState('');
  const [previewBroken, setPreviewBroken] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, saving]);

  useEffect(() => {
    if (!card) return;
    setTitle(card.title === 'Trade license' ? '' : (card.title || ''));
    setReference(card.licenseNumber || '');
    setFile(null);
    setFormError('');
    setPreviewBroken(false);
  }, [card]);

  const localPreviewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    if (!localPreviewUrl) return undefined;
    return () => URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  if (!card) return null;

  const existingImageUrl = card.hasImage && !previewBroken ? card.imageUrl : null;
  const previewUrl = localPreviewUrl || existingImageUrl;
  const canEdit = typeof onSave === 'function';

  const handleFileSelect = (event) => {
    const next = event.target.files?.[0];
    event.target.value = '';
    if (!next) return;
    const check = isAllowedLicenseImageFile(next);
    if (!check.ok) {
      setFormError(check.message);
      return;
    }
    setFormError('');
    setFile(next);
    setPreviewBroken(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!canEdit || saving) return;
    if (!card.hasImage && !file) {
      setFormError('Attach an image before saving.');
      return;
    }
    if (file) {
      const check = isAllowedLicenseImageFile(file);
      if (!check.ok) {
        setFormError(check.message);
        return;
      }
    }
    setFormError('');
    const ok = await onSave({
      id: card.id,
      title: String(title || '').trim(),
      reference: String(reference || '').trim(),
      file,
    });
    if (ok !== false) onClose?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={() => !saving && onClose?.()}
      shouldCloseOnOverlayClick={!saving}
      shouldCloseOnEsc={!saving}
      contentLabel={card.title || 'License'}
      className="relative mx-auto my-4 w-[calc(100%-1.25rem)] max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl outline-none overflow-hidden"
      overlayClassName="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[2px] flex items-center justify-center overflow-y-auto py-4"
    >
      <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          <div className="min-w-0 flex-1">
            {canEdit ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Document title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. TDLR"
                    disabled={saving}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">License number</span>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Optional"
                    disabled={saving}
                  />
                </label>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900">{card.title}</h2>
                {card.licenseNumber ? (
                  <p className="mt-1 text-sm text-gray-600">License #{card.licenseNumber}</p>
                ) : null}
              </>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SettingsBadge variant={card.statusVariant}>{card.statusLabel}</SettingsBadge>
              {card.uploadedLabel ? (
                <span className="text-xs text-gray-500">Uploaded {card.uploadedLabel}</span>
              ) : null}
              {card.sourceLabel ? (
                <span className="text-xs text-gray-400">{card.sourceLabel}</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-gray-950/95 p-3 sm:p-5">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={title || card.title}
              className="mx-auto max-h-[65vh] w-auto max-w-full object-contain"
              onError={() => {
                if (!localPreviewUrl) setPreviewBroken(true);
              }}
            />
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 text-center text-sm text-gray-300">
              <p>{card.missingImageLabel}</p>
              {canEdit ? <p className="text-xs text-gray-400">Add a photo below so companies can review this credential.</p> : null}
            </div>
          )}
        </div>
        {canEdit ? (
          <div className="shrink-0 space-y-3 border-t border-gray-100 bg-white px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <input
                  type="file"
                  accept={LICENSE_IMAGE_ACCEPT}
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={saving}
                />
                {file || existingImageUrl ? 'Replace photo' : 'Add photo'}
              </label>
              <span className="text-xs text-gray-500">
                {file ? `Selected: ${file.name}` : 'JPEG, PNG, WebP, GIF, or BMP'}
              </span>
            </div>
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
