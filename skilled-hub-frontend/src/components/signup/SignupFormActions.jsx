import React from 'react';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';

export function SignupFormActions({
  onBack,
  showBack,
  submitLabel,
  submitIcon: SubmitIcon,
  disabled,
  loading,
  form = 'signup-wizard',
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
      {showBack ? (
        <button
          type="button"
          form={form}
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#3A7CA5] hover:text-tf-navy"
        >
          <FaArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
      ) : (
        <span />
      )}
      <button
        type="submit"
        form={form}
        disabled={disabled || loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-tf-orange px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-tf-orange-hover disabled:opacity-50 sm:min-w-[200px]"
      >
        {loading ? 'Please wait…' : submitLabel}
        {!loading && SubmitIcon && <SubmitIcon className="h-3.5 w-3.5" aria-hidden />}
        {!loading && !SubmitIcon && <FaArrowRight className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </div>
  );
}
