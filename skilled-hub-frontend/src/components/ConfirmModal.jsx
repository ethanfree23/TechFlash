import React from 'react';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'default' }) => {
  if (!isOpen) return null;

  const isDestructive = variant === 'destructive';

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative border-2 border-orange-100 rounded-2xl shadow-2xl shadow-orange-100/30 max-w-md w-full overflow-hidden backdrop-blur-md"
        style={{ background: 'linear-gradient(180deg, rgba(247, 247, 247, 0.88) 0%, rgba(254, 103, 17, 0.06) 100%)' }}
      >
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">{title}</h2>
          <p className="text-gray-600 mb-6">{message}</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 font-semibold text-gray-700 bg-white border-2 border-gray-200 rounded-full hover:bg-gray-50 transition"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm?.();
                onClose();
              }}
              className={`px-6 py-3 font-semibold text-white rounded-full transition ${
                isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-[#FE6711] hover:bg-[#e55a0a]'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
