import React, { useState } from 'react';
import { isValidStripePublishableKey } from '../stripeConfig';

/**
 * Connect a US business bank account via Stripe Financial Connections (SetupIntent).
 * Handles instant verification and microdeposit fallback.
 */
const BankAccountSetupForm = ({
  stripe: stripeProp,
  publishableKey,
  onRequestClientSecret,
  onComplete,
  disabled = false,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [microdeposits, setMicrodeposits] = useState(null);
  const [amount1, setAmount1] = useState('');
  const [amount2, setAmount2] = useState('');

  const resolveStripe = () => {
    if (stripeProp) return stripeProp;
    if (window.Stripe && isValidStripePublishableKey(publishableKey)) {
      return window.Stripe(publishableKey);
    }
    return null;
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const stripe = resolveStripe();
    if (!stripe) {
      setError('Payment form not ready.');
      return;
    }
    if (!name.trim()) {
      setError('Enter the name on the bank account.');
      return;
    }
    setProcessing(true);
    try {
      const { client_secret } = await onRequestClientSecret();
      if (!client_secret) throw new Error('Could not start bank setup.');

      const collect = await stripe.collectBankAccountForSetup({
        clientSecret: client_secret,
        params: {
          payment_method_type: 'us_bank_account',
          payment_method_data: {
            billing_details: {
              name: name.trim(),
              email: email.trim() || undefined,
            },
          },
        },
        expand: ['payment_method'],
      });

      if (collect.error) throw new Error(collect.error.message);
      if (collect.setupIntent?.status === 'requires_payment_method') {
        throw new Error('Bank connection was cancelled. Try again.');
      }

      const confirm = await stripe.confirmUsBankAccountSetup(client_secret);
      if (confirm.error) throw new Error(confirm.error.message);

      const intent = confirm.setupIntent;
      if (intent?.status === 'succeeded') {
        setInfo('Bank account connected and verified.');
        setMicrodeposits(null);
        onComplete?.({ setupIntent: intent });
        return;
      }

      if (
        intent?.status === 'requires_action' &&
        intent?.next_action?.type === 'verify_with_microdeposits'
      ) {
        setMicrodeposits({ clientSecret: client_secret, setupIntent: intent });
        setInfo(
          'Instant verification was unavailable. Stripe will deposit two small amounts. Enter those amounts here once they appear (usually 1–2 business days).'
        );
        return;
      }

      setInfo(`Bank setup status: ${intent?.status || 'unknown'}.`);
      onComplete?.({ setupIntent: intent });
    } catch (err) {
      setError(err.message || 'Could not connect bank account');
    } finally {
      setProcessing(false);
    }
  };

  const handleVerifyMicrodeposits = async (e) => {
    e.preventDefault();
    setError(null);
    const stripe = resolveStripe();
    if (!stripe || !microdeposits?.clientSecret) {
      setError('Verification is not ready.');
      return;
    }
    const a1 = Math.round(parseFloat(amount1) * 100);
    const a2 = Math.round(parseFloat(amount2) * 100);
    if (!Number.isFinite(a1) || !Number.isFinite(a2)) {
      setError('Enter both deposit amounts in dollars (for example 0.32).');
      return;
    }
    setProcessing(true);
    try {
      const result = await stripe.verifyMicrodepositsForSetup(microdeposits.clientSecret, {
        amounts: [a1, a2],
      });
      if (result.error) throw new Error(result.error.message);
      if (result.setupIntent?.status === 'succeeded') {
        setInfo('Bank account verified.');
        setMicrodeposits(null);
        onComplete?.({ setupIntent: result.setupIntent });
      } else {
        setInfo(`Verification status: ${result.setupIntent?.status || 'pending'}.`);
      }
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {!microdeposits ? (
        <form onSubmit={handleConnect} className="space-y-4">
          <p className="text-sm text-slate-600">
            Connect a US business checking or savings account. TechFlash uses Stripe Financial Connections —
            we never see or store your full account or routing numbers.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name on account</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg bg-white"
              placeholder="Business legal name"
              disabled={processing || disabled}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg bg-white"
              placeholder="billing@company.com"
              disabled={processing || disabled}
            />
          </div>
          <p className="text-xs text-slate-500">
            By connecting, you authorize TechFlash to debit this account for job funding, counteroffer
            adjustments, and settlement top-ups under your saved payment method mandate.
          </p>
          <button
            type="submit"
            disabled={processing || disabled}
            className="px-6 py-2.5 bg-[#1d4ed8] text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
          >
            {processing ? 'Connecting…' : 'Connect bank account'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyMicrodeposits} className="space-y-4">
          <p className="text-sm text-slate-600">
            Enter the two microdeposit amounts Stripe sent to your bank (in dollars).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount 1</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount1}
                onChange={(e) => setAmount1(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg bg-white"
                placeholder="0.32"
                disabled={processing || disabled}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount 2</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount2}
                onChange={(e) => setAmount2(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg bg-white"
                placeholder="0.45"
                disabled={processing || disabled}
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={processing || disabled}
            className="px-6 py-2.5 bg-[#1d4ed8] text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
          >
            {processing ? 'Verifying…' : 'Verify deposits'}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-[#c2410c] bg-orange-50 border border-orange-100 rounded-lg p-3">{info}</p>}
    </div>
  );
};

export default BankAccountSetupForm;
