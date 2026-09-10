import React, { useEffect } from 'react';
import Modal from 'react-modal';
import SettingsBadge from './SettingsBadge';

export default function LicenseDocumentModal({
  isOpen,
  card,
  onClose,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!card) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
      contentLabel={card.title || 'License'}
      className="relative mx-auto my-4 w-[calc(100%-1.25rem)] max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl outline-none overflow-hidden"
      overlayClassName="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[2px] flex items-center justify-center overflow-y-auto py-4"
    >
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">{card.title}</h2>
          {card.licenseNumber ? (
            <p className="mt-1 text-sm text-gray-600">License #{card.licenseNumber}</p>
          ) : null}
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
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-gray-950/95 p-3 sm:p-5">
        {card.hasImage ? (
          <img
            src={card.imageUrl}
            alt={card.title}
            className="mx-auto max-h-[75vh] w-auto max-w-full object-contain"
          />
        ) : (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl bg-gray-800 text-sm text-gray-300">
            {card.missingImageLabel}
          </div>
        )}
      </div>
    </Modal>
  );
}
