import React, { useEffect, useState } from 'react';
import SettingsCard from './SettingsCard';
import SettingsInput from './SettingsInput';

function AccountActionModal({
  isOpen,
  title,
  onClose,
  onSubmit,
  saving,
  error,
  submitLabel,
  children,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-action-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      >
        <form onSubmit={onSubmit} className="p-6">
          <h2 id="account-action-title" className="text-lg font-semibold text-gray-900">{title}</h2>
          <div className="mt-4 space-y-4">{children}</div>
          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AccountActionsCard({
  currentEmail,
  saving,
  onUpdateUsername,
  onUpdatePassword,
  onDeleteAccount,
}) {
  const [modal, setModal] = useState(null);
  const [emailDraft, setEmailDraft] = useState(currentEmail || '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (modal === 'username') {
      setEmailDraft(currentEmail || '');
      setError('');
    }
    if (modal === 'password') {
      setPassword('');
      setPasswordConfirm('');
      setShowPassword(false);
      setShowPasswordConfirm(false);
      setError('');
    }
  }, [modal, currentEmail]);

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setError('');
  };

  const handleUsernameSubmit = async (event) => {
    event.preventDefault();
    const email = String(emailDraft || '').trim();
    if (!email) {
      setError('Email is required.');
      return;
    }
    try {
      setError('');
      await onUpdateUsername(email);
      setModal(null);
    } catch (err) {
      setError(err.message || 'Failed to update username');
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!password) {
      setError('Enter a new password.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }
    try {
      setError('');
      await onUpdatePassword(password, passwordConfirm);
      setModal(null);
    } catch (err) {
      setError(err.message || 'Failed to update password');
    }
  };

  const buttonClass =
    'w-full inline-flex items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

  return (
    <>
      <SettingsCard
        title="Account"
        description={currentEmail ? `Username: ${currentEmail}` : 'Update your login email, password, or delete this account.'}
      >
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className={`${buttonClass} border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus-visible:ring-blue-500`}
            onClick={() => setModal('username')}
          >
            Update username
          </button>
          <button
            type="button"
            className={`${buttonClass} border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus-visible:ring-blue-500`}
            onClick={() => setModal('password')}
          >
            Update password
          </button>
          <button
            type="button"
            className={`${buttonClass} border-red-200 bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500`}
            onClick={onDeleteAccount}
          >
            Delete account
          </button>
        </div>
      </SettingsCard>

      <AccountActionModal
        isOpen={modal === 'username'}
        title="Update username"
        onClose={closeModal}
        onSubmit={handleUsernameSubmit}
        saving={saving}
        error={error}
        submitLabel="Save username"
      >
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Email (username)
          </label>
          <SettingsInput
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
            required
          />
        </div>
      </AccountActionModal>

      <AccountActionModal
        isOpen={modal === 'password'}
        title="Update password"
        onClose={closeModal}
        onSubmit={handlePasswordSubmit}
        saving={saving}
        error={error}
        submitLabel="Save password"
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
              New password
            </label>
            <button
              type="button"
              className="text-xs font-semibold text-blue-700 hover:underline"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <SettingsInput
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Enter new password"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Confirm new password
            </label>
            <button
              type="button"
              className="text-xs font-semibold text-blue-700 hover:underline"
              onClick={() => setShowPasswordConfirm((value) => !value)}
            >
              {showPasswordConfirm ? 'Hide' : 'Show'}
            </button>
          </div>
          <SettingsInput
            type={showPasswordConfirm ? 'text' : 'password'}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Confirm new password"
          />
        </div>
      </AccountActionModal>
    </>
  );
}
