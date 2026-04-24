import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, signupPaymentsAPI } from '../api/api';
import { auth } from '../auth';
import CardPaymentForm from './CardPaymentForm';
import { getStripePublishableKey, isValidStripePublishableKey } from '../stripeConfig';

const styles = {
  default: {
    label: 'text-[#2E2E2E]',
    input:
      'border-gray-300 focus:ring-[#3A7CA5] focus:border-[#3A7CA5] text-[#2E2E2E]',
    button:
      'bg-[#3A7CA5] hover:bg-[#2F5D7C] focus:ring-[#3A7CA5]',
  },
  marketing: {
    label: 'text-gray-800',
    input:
      'border-orange-100 focus:ring-[#FE6711] focus:border-[#FE6711] text-gray-800 bg-white/95',
    button:
      'bg-[#FE6711] hover:bg-[#e55a0a] focus:ring-[#FE6711] shadow-lg shadow-orange-200/40',
  },
};

const RegisterForm = ({
  onLoginSuccess,
  variant = 'default',
  idPrefix = 'register',
  initialEmail = '',
  initialRole = 'technician',
  initialRoleView = 'technician',
}) => {
  const navigate = useNavigate();
  const publishableKey = getStripePublishableKey();
  const stripe = useMemo(() => {
    if (window.Stripe && isValidStripePublishableKey(publishableKey)) {
      return window.Stripe(publishableKey);
    }
    return null;
  }, [publishableKey]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [paymentToken, setPaymentToken] = useState(null);
  const [registerData, setRegisterData] = useState({
    email: initialEmail,
    password: '',
    password_confirmation: '',
    role: initialRole,
    membership_tier: 'basic',
    role_view: initialRoleView,
    honeypot: '',
  });

  const v = styles[variant] || styles.default;

  const tierConfig = {
    technician: [
      {
        id: 'basic',
        name: 'Basic',
        price: '$0',
        description: 'Full access to all jobs, 20% commission.',
        requiresPayment: false,
      },
      {
        id: 'pro',
        name: 'Pro',
        price: '$49/mo',
        description: 'View jobs one day before Basic, 20% commission.',
        requiresPayment: true,
      },
      {
        id: 'premium',
        name: 'Premium',
        price: '$249/mo',
        description: 'View jobs two days before Pro, 10% commission.',
        requiresPayment: true,
      },
    ],
    company: [
      { id: 'basic', name: 'Basic', price: '$0', description: 'Post jobs and connect with available technicians.', requiresPayment: false },
      { id: 'pro', name: 'Pro', price: '$99/mo', description: 'Priority matching and advanced filters.', requiresPayment: true },
      { id: 'premium', name: 'Premium', price: '$249/mo', description: 'Fast-fill support and premium visibility.', requiresPayment: true },
    ],
  };

  const selectedTier = tierConfig[registerData.role]?.find((tier) => tier.id === registerData.membership_tier);

  const validateStepOne = () => {
    if (!registerData.email || !registerData.password || !registerData.password_confirmation) {
      setError('Please complete all required fields.');
      return false;
    }
    if (registerData.password !== registerData.password_confirmation) {
      setError('Passwords do not match');
      return false;
    }
    if (registerData.honeypot) {
      setError('Registration is unavailable for this email.');
      return false;
    }
    return true;
  };

  const handlePaymentConfirm = async ({ card, billing_details }) => {
    setError('');
    if (!stripe) throw new Error('Payment form is not ready');
    const intent = await signupPaymentsAPI.createIntent({
      email: registerData.email.trim(),
      role: registerData.role,
      membership_tier: registerData.membership_tier,
    });
    const clientSecret = intent?.client_secret;
    if (!clientSecret) throw new Error(intent?.error || 'Could not initialize payment');
    const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card, billing_details },
    });
    if (confirmError) throw new Error(confirmError.message);
    setPaymentToken(paymentIntent?.id || null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step === 1 && !validateStepOne()) return;
    if (step === 1) {
      setError('');
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authAPI.register({
        ...registerData,
        email: registerData.email.trim(),
        signup_payment_intent_id: paymentToken,
      });
      auth.setToken(response.token);
      auth.setUser(response.user);
      onLoginSuccess(response.user);
      setTimeout(() => navigate('/dashboard'), 100);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-left">
      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step {step} of 3</p>
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((prev) => Math.max(1, prev - 1))}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-[#FE6711]"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
        )}
      </div>

      {step === 1 && (
        <>
          <div>
            <label htmlFor={`${idPrefix}-email`} className={`block text-sm font-medium ${v.label}`}>
              Email
            </label>
            <input
              type="email"
              id={`${idPrefix}-email`}
              name="email"
              value={registerData.email}
              onChange={(e) =>
                setRegisterData((prev) => ({ ...prev, email: e.target.value }))
              }
              required
              placeholder="you@example.com"
              className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
            />
          </div>

          <div>
            <label htmlFor={`${idPrefix}-password`} className={`block text-sm font-medium ${v.label}`}>
              Password
            </label>
            <input
              type="password"
              id={`${idPrefix}-password`}
              name="password"
              value={registerData.password}
              onChange={(e) =>
                setRegisterData((prev) => ({ ...prev, password: e.target.value }))
              }
              required
              placeholder="••••••••"
              className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
            />
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-password-confirmation`}
              className={`block text-sm font-medium ${v.label}`}
            >
              Confirm Password
            </label>
            <input
              type="password"
              id={`${idPrefix}-password-confirmation`}
              name="password_confirmation"
              value={registerData.password_confirmation}
              onChange={(e) =>
                setRegisterData((prev) => ({
                  ...prev,
                  password_confirmation: e.target.value,
                }))
              }
              required
              placeholder="Re-enter password"
              className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
            />
          </div>

          <div>
            <label htmlFor={`${idPrefix}-role`} className={`block text-sm font-medium ${v.label}`}>
              I am a:
            </label>
            <select
              id={`${idPrefix}-role`}
              name="role"
              value={registerData.role}
              onChange={(e) =>
                setRegisterData((prev) => ({
                  ...prev,
                  role: e.target.value,
                  role_view: e.target.value,
                }))
              }
              className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
            >
              <option value="technician">Technician (Job Seeker)</option>
              <option value="company">Company (Hiring)</option>
            </select>
          </div>

          <div className="absolute left-[-9999px] top-0 opacity-0 pointer-events-none">
            <label htmlFor={`${idPrefix}-consent-check`}>Consent check</label>
            <input
              id={`${idPrefix}-consent-check`}
              name="consent_check"
              type="checkbox"
              checked={!!registerData.honeypot}
              onChange={(e) =>
                setRegisterData((prev) => ({ ...prev, honeypot: e.target.checked ? '1' : '' }))
              }
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
        </>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Select your membership tier for {registerData.role === 'company' ? 'companies' : 'techs'}.
          </p>
          {tierConfig[registerData.role].map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => setRegisterData((prev) => ({ ...prev, membership_tier: tier.id }))}
              className={`w-full rounded-xl border p-4 text-left transition ${
                registerData.membership_tier === tier.id
                  ? 'border-[#FE6711] bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-orange-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">{tier.name}</h3>
                <span className="font-bold text-[#FE6711]">{tier.price}</span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{tier.description}</p>
            </button>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <p><span className="font-semibold">Email:</span> {registerData.email}</p>
            <p><span className="font-semibold">Account type:</span> {registerData.role}</p>
            <p><span className="font-semibold">Tier:</span> {selectedTier?.name} ({selectedTier?.price})</p>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-[#FE6711] hover:underline"
              >
                Edit
              </button>
            </div>
          </div>
          {selectedTier?.requiresPayment && (
            <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
              {!isValidStripePublishableKey(publishableKey) && (
                <p className="mb-3 text-sm text-amber-800">
                  Stripe is not configured for this build yet.
                </p>
              )}
              <CardPaymentForm
                stripe={stripe}
                publishableKey={publishableKey}
                onConfirm={handlePaymentConfirm}
                submitLabel={paymentToken ? 'Card added' : 'Save payment method'}
                disabled={!!paymentToken}
                amountLabel={`Selected plan: ${selectedTier.name} ${selectedTier.price}`}
              />
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || (step === 3 && selectedTier?.requiresPayment && !paymentToken)}
        className={`w-full flex justify-center py-3 px-4 rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${v.button}`}
      >
        {loading
          ? 'Creating account...'
          : step < 3
            ? 'Next'
            : 'Confirm and create account'}
      </button>

      <p className="text-xs text-gray-500">
        By creating an account, you agree to the{' '}
        <Link to="/terms-of-service" className="text-[#3A7CA5] hover:underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link to="/privacy-policy" className="text-[#3A7CA5] hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
};

export default RegisterForm;
