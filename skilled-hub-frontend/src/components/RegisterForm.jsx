import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, licensingSettingsAPI, membershipTierConfigsAPI, signupPaymentsAPI } from '../api/api';
import { auth } from '../auth';
import CardPaymentForm from './CardPaymentForm';
import { getStripePublishableKey, isValidStripePublishableKey } from '../stripeConfig';
import { requiresElectricalLicenseForState, setLocalOnlyLicenseStates } from '../utils/licensingRules';
import { US_STATES } from '../data/statesByCountry';
import { TRADE_OPTIONS } from '../constants/trades';

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

const FALLBACK_TIER_CONFIG = {
  technician: [
    { id: 'basic', name: 'Basic', price: '$0/mo', description: '20% commission.', requiresPayment: false },
    { id: 'pro', name: 'Pro', price: '$49/mo', description: '20% commission.', requiresPayment: true },
    { id: 'premium', name: 'Premium', price: '$249/mo', description: '10% commission.', requiresPayment: true },
  ],
  company: [
    { id: 'basic', name: 'Basic', price: '$0/mo', description: '20% commission.', requiresPayment: false },
    { id: 'pro', name: 'Pro', price: '$99/mo', description: '15% commission.', requiresPayment: true },
    { id: 'premium', name: 'Premium', price: '$249/mo', description: '10% commission.', requiresPayment: true },
  ],
};

const formatMonthlyPrice = (monthlyFeeCents) => {
  const cents = Number(monthlyFeeCents) || 0;
  if (cents <= 0) return '$0/mo';
  return `$${(cents / 100).toFixed(0)}/mo`;
};

const tierDescription = (tier) => `${tier.commission_percent}% commission.`;

const mapTier = (tier) => ({
  id: tier.slug,
  name: tier.display_name || tier.slug,
  price: formatMonthlyPrice(tier.monthly_fee_cents),
  description: tierDescription(tier),
  requiresPayment: (Number(tier.monthly_fee_cents) || 0) > 0,
});

const roleLabel = (role) => (role === 'company' ? 'Company' : 'Technician');

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
  const [tierConfig, setTierConfig] = useState(FALLBACK_TIER_CONFIG);
  const [registerData, setRegisterData] = useState({
    email: initialEmail,
    password: '',
    password_confirmation: '',
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    electrical_license_number: '',
    trade_type: '',
    role: initialRole,
    membership_tier: 'basic',
    role_view: initialRoleView,
    honeypot: '',
  });

  const v = styles[variant] || styles.default;
  useEffect(() => {
    let active = true;

    const loadAudience = async (audience) => {
      try {
        const res = await membershipTierConfigsAPI.list(audience);
        const mapped = (res?.membership_tier_configs || []).map(mapTier);
        if (!mapped.length) return null;
        return mapped;
      } catch {
        return null;
      }
    };

    const load = async () => {
      const [tech, company] = await Promise.all([
        loadAudience('technician'),
        loadAudience('company'),
      ]);

      if (!active) return;
      setTierConfig({
        technician: tech || FALLBACK_TIER_CONFIG.technician,
        company: company || FALLBACK_TIER_CONFIG.company,
      });
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    licensingSettingsAPI.get()
      .then((res) => {
        if (!active) return;
        setLocalOnlyLicenseStates(res?.local_only_state_codes || []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const options = tierConfig[registerData.role] || [];
    if (!options.some((tier) => tier.id === registerData.membership_tier) && options.length > 0) {
      setRegisterData((prev) => ({ ...prev, membership_tier: options[0].id }));
      setPaymentToken(null);
    }
  }, [registerData.role, registerData.membership_tier, tierConfig]);

  const selectedTier = tierConfig[registerData.role]?.find((tier) => tier.id === registerData.membership_tier);

  const validateStepOne = () => {
    if (
      !registerData.email ||
      !registerData.password ||
      !registerData.password_confirmation ||
      !registerData.first_name.trim() ||
      !registerData.last_name.trim()
    ) {
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

  const validateStepTwo = () => {
    if (!registerData.phone.trim()) {
      setError('Phone is required.');
      return false;
    }
    if (!registerData.city.trim() || !registerData.state.trim() || !registerData.zip_code.trim()) {
      setError('City, state, and zip are required.');
      return false;
    }
    if (registerData.role === 'technician' && !registerData.trade_type.trim()) {
      setError('Select at least one role/trade.');
      return false;
    }

    return true;
  };

  const validateStepThree = () => {
    if (!registerData.membership_tier) {
      setError('Please select a membership tier.');
      return false;
    }

    const stateRequiresLicense =
      registerData.role === 'company' && requiresElectricalLicenseForState(registerData.state);
    if (stateRequiresLicense && !registerData.electrical_license_number.trim()) {
      setError('This state requires an electrical license number.');
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
    if (step === 2 && !validateStepTwo()) return;
    if (step === 2) {
      setError('');
      setStep(3);
      return;
    }
    if (step === 3 && !validateStepThree()) return;
    if (step === 3) {
      setError('');
      setStep(4);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authAPI.register({
        ...registerData,
        email: registerData.email.trim(),
        first_name: registerData.first_name.trim(),
        last_name: registerData.last_name.trim(),
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
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step {step} of 4</p>
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
            <label htmlFor={`${idPrefix}-first-name`} className={`block text-sm font-medium ${v.label}`}>
              First Name
            </label>
            <input
              type="text"
              id={`${idPrefix}-first-name`}
              name="first_name"
              value={registerData.first_name}
              onChange={(e) =>
                setRegisterData((prev) => ({ ...prev, first_name: e.target.value }))
              }
              required
              placeholder="First name"
              className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
            />
          </div>

          <div>
            <label htmlFor={`${idPrefix}-last-name`} className={`block text-sm font-medium ${v.label}`}>
              Last Name
            </label>
            <input
              type="text"
              id={`${idPrefix}-last-name`}
              name="last_name"
              value={registerData.last_name}
              onChange={(e) =>
                setRegisterData((prev) => ({ ...prev, last_name: e.target.value }))
              }
              required
              placeholder="Last name"
              className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
            />
          </div>

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
              Account Type
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
        <div className="space-y-4">
          <div>
            <label htmlFor={`${idPrefix}-phone`} className={`block text-sm font-medium ${v.label}`}>
              Phone
            </label>
            <input
              type="tel"
              id={`${idPrefix}-phone`}
              name="phone"
              value={registerData.phone}
              onChange={(e) =>
                setRegisterData((prev) => ({ ...prev, phone: e.target.value }))
              }
              required
              placeholder="e.g. (713) 555-0134"
              className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
            />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <h3 className="font-medium text-gray-900">Location</h3>
            <div>
              <label htmlFor={`${idPrefix}-address`} className={`block text-sm font-medium ${v.label}`}>
                Street Address (optional)
              </label>
              <input
                type="text"
                id={`${idPrefix}-address`}
                name="address"
                value={registerData.address}
                onChange={(e) =>
                  setRegisterData((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="e.g. 123 Main St"
                className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-city`} className={`block text-sm font-medium ${v.label}`}>
                City
              </label>
              <input
                type="text"
                id={`${idPrefix}-city`}
                name="city"
                value={registerData.city}
                onChange={(e) =>
                  setRegisterData((prev) => ({ ...prev, city: e.target.value }))
                }
                required
                placeholder="e.g. Houston"
                className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-state`} className={`block text-sm font-medium ${v.label}`}>
                State
              </label>
              <select
                id={`${idPrefix}-state`}
                name="state"
                value={registerData.state}
                onChange={(e) =>
                  setRegisterData((prev) => ({ ...prev, state: e.target.value }))
                }
                required
                className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
              >
                <option value="">Select a state</option>
                {US_STATES.map((usState) => (
                  <option key={usState} value={usState}>
                    {usState}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${idPrefix}-zip-code`} className={`block text-sm font-medium ${v.label}`}>
                Zip Code
              </label>
              <input
                type="text"
                id={`${idPrefix}-zip-code`}
                name="zip_code"
                value={registerData.zip_code}
                onChange={(e) =>
                  setRegisterData((prev) => ({ ...prev, zip_code: e.target.value }))
                }
                required
                placeholder="e.g. 77007"
                className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
              />
            </div>
          </div>
          {registerData.role === 'company' && requiresElectricalLicenseForState(registerData.state) && (
            <div>
              <label htmlFor={`${idPrefix}-electrical-license-number`} className={`block text-sm font-medium ${v.label}`}>
                Electrical license number
              </label>
              <input
                type="text"
                id={`${idPrefix}-electrical-license-number`}
                name="electrical_license_number"
                value={registerData.electrical_license_number}
                onChange={(e) =>
                  setRegisterData((prev) => ({ ...prev, electrical_license_number: e.target.value }))
                }
                required
                placeholder="Enter TECL license number"
                className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
              />
            </div>
          )}
          {registerData.role === 'technician' && (
            <div>
              <label htmlFor={`${idPrefix}-trade-type`} className={`block text-sm font-medium ${v.label}`}>
                Trade / role
              </label>
              <select
                id={`${idPrefix}-trade-type`}
                name="trade_type"
                value={registerData.trade_type}
                onChange={(e) =>
                  setRegisterData((prev) => ({ ...prev, trade_type: e.target.value }))
                }
                required
                className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
              >
                <option value="">Select your role</option>
                {TRADE_OPTIONS.map((trade) => (
                  <option key={trade} value={trade}>
                    {trade}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
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

      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <p><span className="font-semibold">Name:</span> {registerData.first_name} {registerData.last_name}</p>
            <p><span className="font-semibold">Email:</span> {registerData.email}</p>
            <p><span className="font-semibold">Account Type:</span> {roleLabel(registerData.role)}</p>
            <p><span className="font-semibold">Phone:</span> {registerData.phone}</p>
            <p><span className="font-semibold">City:</span> {registerData.city}</p>
            <p><span className="font-semibold">State:</span> {registerData.state}</p>
            <p><span className="font-semibold">Zip:</span> {registerData.zip_code}</p>
            {registerData.role === 'technician' && (
              <p><span className="font-semibold">Trade / role:</span> {registerData.trade_type}</p>
            )}
            {registerData.role === 'company' && requiresElectricalLicenseForState(registerData.state) && (
              <p><span className="font-semibold">Electrical license:</span> {registerData.electrical_license_number}</p>
            )}
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
        disabled={loading || (step === 4 && selectedTier?.requiresPayment && !paymentToken)}
        className={`w-full flex justify-center py-3 px-4 rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${v.button}`}
      >
        {loading
          ? 'Creating account...'
          : step < 4
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
