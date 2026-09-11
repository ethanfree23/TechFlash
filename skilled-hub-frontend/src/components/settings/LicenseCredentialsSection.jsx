import React, { useMemo, useState } from 'react';
import EmptyState from './EmptyState';
import SettingsBadge from './SettingsBadge';
import LicenseDocumentModal from './LicenseDocumentModal';
import {
  emptyLicenseForm,
  isAllowedLicenseImageFile,
  LICENSE_IMAGE_ACCEPT,
  licenseEmptyStateVisible,
  licenseFormShouldBeVisible,
  presentLicenseCard,
} from '../../utils/licenseCredentials';
import { mediaUrlWithCacheBust } from '../../utils/mediaUrl';

export default function LicenseCredentialsSection({
  certificates,
  uploading,
  deletingId,
  previewErrors,
  onPreviewError,
  onDelete,
  onUpload,
  onUpdate,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyLicenseForm);
  const [selectedId, setSelectedId] = useState(null);
  const [formError, setFormError] = useState('');

  const cards = useMemo(
    () => (certificates || []).map((doc) => presentLicenseCard(
      doc,
      (url, updatedAt) => mediaUrlWithCacheBust(url, updatedAt),
    )),
    [certificates],
  );

  const selectedCard = cards.find((card) => card.id === selectedId) || null;
  const empty = licenseEmptyStateVisible(certificates);
  const showForm = licenseFormShouldBeVisible(formOpen);

  const resetForm = () => {
    setForm(emptyLicenseForm());
    setFormError('');
    setFormOpen(false);
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      setForm((prev) => ({ ...prev, file: null }));
      return;
    }
    const check = isAllowedLicenseImageFile(file);
    if (!check.ok) {
      setFormError(check.message);
      setForm((prev) => ({ ...prev, file: null }));
      return;
    }
    setFormError('');
    setForm((prev) => ({ ...prev, file }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.file) {
      setFormError('Attach an image before saving.');
      return;
    }
    const check = isAllowedLicenseImageFile(form.file);
    if (!check.ok) {
      setFormError(check.message);
      return;
    }
    setFormError('');
    const ok = await onUpload?.({
      title: String(form.title || '').trim(),
      reference: String(form.reference || '').trim(),
      file: form.file,
    });
    if (ok !== false) resetForm();
  };

  const handleCardPhotoSelect = async (card, event) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUpdate) return;
    const check = isAllowedLicenseImageFile(file);
    if (!check.ok) {
      setFormError(check.message);
      return;
    }
    await onUpdate({
      id: card.id,
      title: card.title === 'Trade license' ? '' : card.title,
      reference: card.licenseNumber || '',
      file,
    });
  };

  const addButton = (
    <button
      type="button"
      onClick={() => setFormOpen(true)}
      className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
    >
      + Add license or certification
    </button>
  );

  return (
    <div className="space-y-4">
      {empty && !showForm ? (
        <EmptyState
          title="No licenses or certifications added yet."
          action={addButton}
        />
      ) : null}

      {cards.length > 0 ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {cards.map((card) => {
            const previewBroken = previewErrors?.[card.id] === true;
            const showImage = card.hasImage && !previewBroken;
            return (
              <div
                key={card.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(card.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(card.id);
                  }
                }}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="aspect-[4/3] bg-gray-100">
                  {showImage ? (
                    <img
                      src={card.imageUrl}
                      alt={card.title}
                      className="h-full w-full object-cover"
                      onError={() => onPreviewError?.(card.id)}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-500">
                      <span>{card.missingImageLabel}</span>
                      {onUpdate ? (
                        <label
                          className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="file"
                            accept={LICENSE_IMAGE_ACCEPT}
                            className="hidden"
                            onChange={(event) => handleCardPhotoSelect(card, event)}
                            disabled={uploading}
                          />
                          Add photo
                        </label>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{card.title}</p>
                  {card.licenseNumber ? (
                    <p className="text-sm text-gray-600">License #: {card.licenseNumber}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <SettingsBadge variant={card.statusVariant}>{card.statusLabel}</SettingsBadge>
                    {onUpdate && showImage ? (
                      <label
                        className="inline-flex cursor-pointer items-center text-xs font-semibold text-blue-700 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="file"
                          accept={LICENSE_IMAGE_ACCEPT}
                          className="hidden"
                          onChange={(event) => handleCardPhotoSelect(card, event)}
                          disabled={uploading}
                        />
                        Replace photo
                      </label>
                    ) : null}
                  </div>
                </div>
                {onDelete ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete(card.id);
                    }}
                    className="absolute right-2 top-2 rounded-full bg-red-600 p-1.5 text-white shadow-sm opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    title="Remove"
                    aria-label="Remove license"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
                {deletingId === card.id || (uploading && selectedId === card.id) ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-gray-600">
                    {deletingId === card.id ? 'Removing…' : 'Saving…'}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!empty && !showForm ? (
        <div>{addButton}</div>
      ) : null}

      {showForm ? (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 p-4 space-y-3" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="e.g. Texas Journeyman Electrician"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference / license number</label>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <input
                type="file"
                accept={LICENSE_IMAGE_ACCEPT}
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              {form.file ? 'Change image' : 'Attach image'}
            </label>
            <span className="text-xs text-gray-500">
              {form.file ? `Selected: ${form.file.name}` : 'JPEG, PNG, WebP, GIF, or BMP'}
            </span>
          </div>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={uploading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Saving...' : 'Save license'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={uploading}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <LicenseDocumentModal
        isOpen={Boolean(selectedCard)}
        card={selectedCard}
        onClose={() => setSelectedId(null)}
        onSave={onUpdate}
        saving={uploading}
      />
    </div>
  );
}
