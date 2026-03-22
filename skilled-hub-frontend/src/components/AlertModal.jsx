import React from 'react';

const AlertModal = ({ isOpen, onClose, title, message, variant = 'success' }) => {
  if (!isOpen) return null;

  const isSuccess = variant === 'success';
  const iconBg = isSuccess ? 'bg-[#FE6711]/20' : 'bg-red-100';
  const iconColor = isSuccess ? 'text-[#FE6711]' : 'text-red-500';
  const buttonBg = isSuccess ? 'bg-[#FE6711] hover:bg-[#e55a0a]' : 'bg-gray-700 hover:bg-gray-800';

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Modal */}
      <div
        className="relative border-2 border-orange-100 rounded-2xl shadow-2xl shadow-orange-100/30 max-w-md w-full overflow-hidden backdrop-blur-md"
        style={{ background: 'linear-gradient(180deg, rgba(247, 247, 247, 0.88) 0%, rgba(254, 103, 17, 0.06) 100%)' }}
      >
        <div className="p-8 text-center">
          <div className={`inline-flex p-4 rounded-2xl ${iconBg} mb-4`}>
            <svg
              className={`w-10 h-10 ${iconColor}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isSuccess ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
          </div>
          {title && (
            <h2 className="text-xl font-bold text-gray-800 mb-2">{title}</h2>
          )}
          <p className="text-gray-600 mb-6">{message}</p>
          <button
            type="button"
            onClick={onClose}
            className={`px-8 py-3 font-semibold text-white rounded-full transition shadow-lg ${buttonBg}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
