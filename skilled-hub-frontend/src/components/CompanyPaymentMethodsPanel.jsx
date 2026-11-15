import React, { useCallback, useEffect, useState } from 'react';
import CardPaymentForm from './CardPaymentForm';
import BankAccountSetupForm from './BankAccountSetupForm';
import { settingsAPI } from '../api/api';
import { isValidStripePublishableKey } from '../stripeConfig';

const CompanyPaymentMethodsPanel = ({
  stripe,
  publishableKey,
  onStatus,
}) => {
  const [methods, setMethods] = useState([]);
  const [defaultId, setDefaultId] = useState(null);
  const [achEnabled, setAchEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [error, setError] = useState(null);

  const notify = useCallback(
    (message, variant = 'success') => {
      onStatus?.(message, variant);
    },
    [onStatus]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await settingsAPI.listPaymentMethods();
      setMethods(Array.isArray(res?.payment_methods) ? res.payment_methods : []);
      setDefaultId(res?.default_payment_method_id || null);
      setAchEnabled(!!res?.ach_payments_enabled);
    } catch (err) {
      setError(err.message || 'Could not load payment methods');
      setMethods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cards = methods.filter((m) => m.type === 'card');
  const banks = methods.filter((m) => m.type === 'us_bank_account');

  const handleAddCardConfirm = async ({ card, billing_details }) => {
    const res = await settingsAPI.createSetupIntent({ payment_method_type: 'card' });
    const client_secret = res?.client_secret;
    if (!client_secret) throw new Error(res?.error || 'Could not create setup');
    if (!stripe) throw new Error('Payment form not ready');
    const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(client_secret, {
      payment_method: { card, billing_details },
    });
    if (confirmError) throw new Error(confirmError.message);
    if (setupIntent?.payment_method && methods.length === 0) {
      try {
        await settingsAPI.setDefaultPaymentMethod(setupIntent.payment_method);
      } catch {
        /* optional */
      }
    }
    setShowAddCard(false);
    notify('Card added successfully.');
    await refresh();
  };

  const handleBankClientSecret = async () => {
    const res = await settingsAPI.createSetupIntent({ payment_method_type: 'us_bank_account' });
    if (!res?.client_secret) throw new Error(res?.error || 'Could not create bank setup');
    return res;
  };

  const handleBankComplete = async () => {
    setShowAddBank(false);
    notify('Bank account connected.');
    await refresh();
  };

  const handleSetDefault = async (id) => {
    setBusyId(id);
    setError(null);
    try {
      await settingsAPI.setDefaultPaymentMethod(id);
      notify('Default payment method updated.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not set default');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this payment method?')) return;
    setBusyId(id);
    setError(null);
    try {
      await settingsAPI.removePaymentMethod(id);
      notify('Payment method removed.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not remove payment method');
    } finally {
      setBusyId(null);
    }
  };

  const MethodRow = ({ method }) => {
    const isDefault = method.is_default || method.id === defaultId;
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between py-3 border-b border-slate-100 last:border-0">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">{method.display_name || method.id}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
            {isDefault && (
              <span className="text-[#c2410c] font-semibold uppercase tracking-wide">Default</span>
            )}
            {method.type === 'us_bank_account' && method.status && (
              <span>Status: {method.status}</span>
            )}
            {method.type === 'card' && method.exp_month && method.exp_year && (
              <span>
                Exp {String(method.exp_month).padStart(2, '0')}/{method.exp_year}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isDefault && (
            <button
              type="button"
              onClick={() => handleSetDefault(method.id)}
              disabled={busyId === method.id}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Set default
            </button>
          )}
          <button
            type="button"
            onClick={() => handleRemove(method.id)}
            disabled={busyId === method.id}
            className="text-sm px-3 py-1.5 rounded-lg text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {!isValidStripePublishableKey(publishableKey) && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Stripe is not configured for this build. Set{' '}
          <code className="font-mono text-xs">VITE_STRIPE_PUBLISHABLE_KEY_TEST</code> or{' '}
          <code className="font-mono text-xs">VITE_STRIPE_PUBLISHABLE_KEY</code>.
        </p>
      )}

      <div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">Payment methods</h3>
        <p className="text-sm text-slate-600 mb-4">
          Priced jobs are charged when you post them. Cards authorize immediately; bank (ACH) debits
          can take 1–5 business days — jobs stay unpublished until the debit succeeds.
        </p>
        {loading ? (
          <p className="text-sm text-slate-500">Loading payment methods…</p>
        ) : (
          <>
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-800 mb-2">Credit &amp; debit cards</h4>
              {cards.length === 0 ? (
                <p className="text-sm text-slate-500 mb-2">No cards on file.</p>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white px-4">
                  {cards.map((m) => (
                    <MethodRow key={m.id} method={m} />
                  ))}
                </div>
              )}
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-800 mb-2">Bank accounts</h4>
              {banks.length === 0 ? (
                <p className="text-sm text-slate-500 mb-2">No bank accounts connected.</p>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white px-4">
                  {banks.map((m) => (
                    <MethodRow key={m.id} method={m} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setShowAddCard((v) => !v);
              setShowAddBank(false);
            }}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-50"
          >
            {showAddCard ? 'Cancel' : '+ Add card'}
          </button>
          {achEnabled ? (
            <button
              type="button"
              onClick={() => {
                setShowAddBank((v) => !v);
                setShowAddCard(false);
              }}
              className="px-4 py-2 text-sm rounded-lg bg-[#1d4ed8] text-white hover:bg-blue-800"
            >
              {showAddBank ? 'Cancel' : '+ Connect bank account'}
            </button>
          ) : (
            <p className="text-sm text-slate-500 self-center">
              Bank account (ACH) payments are not enabled for this company.
            </p>
          )}
        </div>
      </div>

      {showAddCard && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Add credit or debit card</h4>
          <CardPaymentForm
            stripe={stripe}
            publishableKey={publishableKey}
            onConfirm={handleAddCardConfirm}
            submitLabel="Save card"
          />
        </div>
      )}

      {achEnabled && showAddBank && (
        <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Connect US bank account</h4>
          <BankAccountSetupForm
            stripe={stripe}
            publishableKey={publishableKey}
            onRequestClientSecret={handleBankClientSecret}
            onComplete={handleBankComplete}
          />
        </div>
      )}
    </div>
  );
};

export default CompanyPaymentMethodsPanel;
