import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaLock } from 'react-icons/fa';
import { authAPI, licensingSettingsAPI, membershipTierConfigsAPI } from '../api/api';
import { auth } from '../auth';
import { MembershipPlanCard } from './membership/MembershipPlanCard';
import { CompanyInfoFields } from './signup/CompanyInfoFields';
import { SignupFormActions } from './signup/SignupFormActions';
import { SignupProgressStepper } from './signup/SignupProgressStepper';
import { SignupTrustPanel } from './signup/SignupTrustPanel';
import { SignupWizardShell } from './signup/SignupWizardShell';
import { TechnicianInfoFields } from './signup/TechnicianInfoFields';
import { RoleSelector } from './signup/RoleSelector';
import { requiresElectricalLicenseForState, setLocalOnlyLicenseStates } from '../utils/licensingRules';
import { adaptMembershipTierList } from '../utils/membershipTierAdapter';
import { trackCompleteRegistration } from '../utils/metaPixel';

const roleLabel = (role) => (role === 'company' ? 'Company' : 'Technician');
const ONE_JOB_BASELINE_CENTS = 25 * 8 * 5 * 100;

const parseCommissionPercent = (plan) => {
  const rawPercent = Number(plan?.raw?.commission_percent);
  if (!Number.isNaN(rawPercent) && rawPercent >= 0) return rawPercent;
  const fromLabel = String(plan?.commissionLabel || '').match(/(\d+(?:\.\d+)?)\s*%/);
  return fromLabel ? Number(fromLabel[1]) : null;
};

const formatLocationLabel = (city, state, zip) => [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—';

const RegisterForm = ({
  onLoginSuccess,
  idPrefix = 'register',
  initialEmail = '',
  initialRole = 'technician',
  initialRoleView = 'technician',
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [billingInterval, setBillingInterval] = useState('monthly');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [tierConfigRaw, setTierConfigRaw] = useState({ technician: [], company: [] });
  const [tierLoadError, setTierLoadError] = useState(false);
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
    business_email: '',
    business_phone: '',
    business_address: '',
    business_city: '',
    business_state: '',
    business_zip_code: '',
    electrical_license_number: '',
    trade_type: '',
    company_name: '',
    industry: '',
    primary_hiring_need: '',
    specialties: [],
    role: initialRole,
    membership_tier: 'basic',
    role_view: initialRoleView,
    honeypot: '',
  });

  const emailLocked = Boolean((initialEmail || '').trim());

  useEffect(() => {
    setRegisterData((prev) => ({
      ...prev,
      email: (initialEmail || '').trim() || prev.email,
      role: initialRole,
      role_view: initialRoleView,
    }));
  }, [initialEmail, initialRole, initialRoleView]);

  useEffect(() => {
    let active = true;
    const loadAudience = async (audience) => {
      try {
        const res = await membershipTierConfigsAPI.list(audience);
        const list = res?.membership_tier_configs || [];
        if (!list.length) return null;
        return list;
      } catch {
        return null;
      }
    };
    const load = async () => {
      const [tech, company] = await Promise.all([loadAudience('technician'), loadAudience('company')]);
      if (!active) return;
      if (!tech && !company) setTierLoadError(true);
      setTierConfigRaw({
        technician: tech || [],
        company: company || [],
      });
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    licensingSettingsAPI
      .get()
      .then((res) => {
        if (!alive) return;
        setLocalOnlyLicenseStates(res?.local_only_state_codes || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const adaptedTiers = useMemo(
    () => adaptMembershipTierList(tierConfigRaw[registerData.role] || [], billingInterval),
    [tierConfigRaw, registerData.role, billingInterval]
  );

  useEffect(() => {
    const slugs = adaptedTiers.map((t) => t.id);
    if (!slugs.includes(registerData.membership_tier) && slugs.length > 0) {
      setRegisterData((prev) => ({ ...prev, membership_tier: slugs[0] }));
    }
  }, [adaptedTiers, registerData.membership_tier]);

  const selectedPlan = useMemo(
    () => adaptedTiers.find((t) => t.id === registerData.membership_tier),
    [adaptedTiers, registerData.membership_tier]
  );
  const basicPlan = useMemo(() => adaptedTiers.find((t) => t.id === 'basic') || adaptedTiers[0] || null, [adaptedTiers]);

  const yearlySavingsLabel = useMemo(
    () => (tierConfigRaw[registerData.role] || []).find((t) => t.yearly_savings_label)?.yearly_savings_label || '',
    [tierConfigRaw, registerData.role]
  );
  const selectedPlanSavingsLabel = useMemo(() => {
    if (!selectedPlan || !basicPlan) return '';
    const selectedCommission = parseCommissionPercent(selectedPlan);
    const basicCommission = parseCommissionPercent(basicPlan);
    if (selectedCommission == null || basicCommission == null) return '';
    const savingsPct = Math.max(0, basicCommission - selectedCommission) / 100;
    const savingsCents = Math.round(ONE_JOB_BASELINE_CENTS * savingsPct);
    if (savingsCents <= 0) return '';
    return `After one 40-hour job at $25/hr, you keep $${(savingsCents / 100).toFixed(0)} more than Basic on commission.`;
  }, [selectedPlan, basicPlan]);

  const validateStepOne = () => {
    if (!registerData.email?.trim()) {
      setError('Email is required.');
      return false;
    }
    if (!registerData.password || !registerData.password_confirmation) {
      setError('Password and confirmation are required.');
      return false;
    }
    if (registerData.password !== registerData.password_confirmation) {
      setError('Passwords do not match.');
      return false;
    }
    if (registerData.honeypot) {
      setError('Registration is unavailable for this email.');
      return false;
    }
    return true;
  };

  const validateStepTwo = () => {
    if (!registerData.first_name.trim() || !registerData.last_name.trim()) {
      setError('First and last name are required.');
      return false;
    }
    if (!registerData.phone.trim()) {
      setError('Phone is required.');
      return false;
    }
    if (!registerData.email.trim()) {
      setError('Email is required.');
      return false;
    }
    if (registerData.role === 'technician') {
      if (!registerData.city.trim() || !registerData.state.trim() || !registerData.zip_code.trim()) {
        setError('City, state, and ZIP are required.');
        return false;
      }
      if (!registerData.trade_type.trim()) {
        setError('Select a primary trade.');
        return false;
      }
    } else {
      if (!registerData.company_name.trim()) {
        setError('Company name is required.');
        return false;
      }
      if (!registerData.industry.trim()) {
        setError('Company trade focus is required.');
        return false;
      }
      if (!registerData.primary_hiring_need.trim()) {
        setError('Select a primary hiring need.');
        return false;
      }
      if (!registerData.business_phone?.trim() || !registerData.business_email?.trim()) {
        setError('Business phone and business email are required.');
        return false;
      }
      if (
        !registerData.business_address?.trim() ||
        !registerData.business_city?.trim() ||
        !registerData.business_state?.trim() ||
        !registerData.business_zip_code?.trim()
      ) {
        setError('Complete your full business address (street, city, state, ZIP).');
        return false;
      }
    }
    const stateRequiresLicense =
      registerData.role === 'company' && requiresElectricalLicenseForState(registerData.business_state || registerData.state);
    if (stateRequiresLicense && !registerData.electrical_license_number.trim()) {
      setError('This state requires an electrical license number.');
      return false;
    }
    return true;
  };

  const validateStepThree = () => {
    if (tierLoadError || adaptedTiers.length === 0) {
      setError('Membership plans could not be loaded. Refresh and try again.');
      return false;
    }
    if (!registerData.membership_tier) {
      setError('Please select a membership plan.');
      return false;
    }
    return true;
  };

  const validateStepFour = () => {
    if (!termsAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step === 1) {
      if (!validateStepOne()) return;
      setError('');
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!validateStepTwo()) return;
      setError('');
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!validateStepThree()) return;
      setError('');
      setStep(4);
      return;
    }

    if (!validateStepFour()) return;

    setLoading(true);
    setError('');
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      const payload = {
        ...registerData,
        email: registerData.email.trim(),
        first_name: registerData.first_name.trim(),
        last_name: registerData.last_name.trim(),
        success_url: `${origin}/settings?tab=membership&membership=success`,
        cancel_url: `${origin}/settings?tab=membership&membership=cancel`,
      };
      if (registerData.role === 'technician') {
        payload.specialties = Array.isArray(registerData.specialties) ? registerData.specialties : [];
        delete payload.company_name;
        delete payload.industry;
        delete payload.primary_hiring_need;
        delete payload.business_email;
        delete payload.business_phone;
        delete payload.business_address;
        delete payload.business_city;
        delete payload.business_state;
        delete payload.business_zip_code;
      } else {
        payload.address = registerData.business_address.trim();
        payload.city = registerData.business_city.trim();
        payload.state = registerData.business_state.trim();
        payload.zip_code = registerData.business_zip_code.trim();
        delete payload.trade_type;
        delete payload.specialties;
      }
      const response = await authAPI.register(payload);
      auth.setToken(response.token);
      auth.setUser(response.user);
      trackCompleteRegistration({
        userType: registerData.role === 'company' ? 'company' : 'technician',
      });
      if (response.checkout?.url) {
        window.location.href = response.checkout.url;
        return;
      }
      onLoginSuccess(response.user);
      setTimeout(() => navigate('/dashboard'), 100);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const trustVariant = step === 1 ? 'email' : step === 2 ? 'profile' : step === 3 ? 'membership' : 'review';

  const goBack = () => {
    setError('');
    setStep((s) => Math.max(1, s - 1));
  };

  return (
    <>
      <div className="rounded-b-3xl bg-tf-navy px-4 pb-10 pt-2 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SignupProgressStepper currentStep={step} />
        </div>
      </div>
      <div className="mx-auto -mt-10 max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
      <SignupWizardShell>
        <form id="signup-wizard" onSubmit={handleSubmit} className="text-left">
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
          )}

          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-4">
              <SignupTrustPanel variant={trustVariant} />
            </div>
            <div className="lg:col-span-8">
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <label htmlFor={`${idPrefix}-email`} className="block text-sm font-semibold text-gray-700">
                      Email address
                    </label>
                    <input
                      type="email"
                      id={`${idPrefix}-email`}
                      value={registerData.email}
                      onChange={(e) => !emailLocked && setRegisterData((p) => ({ ...p, email: e.target.value }))}
                      readOnly={emailLocked}
                      disabled={emailLocked}
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none focus:border-[#3A7CA5] focus:ring-1 focus:ring-[#3A7CA5] disabled:cursor-not-allowed"
                    />
                    {emailLocked && (
                      <p className="mt-1 text-xs text-gray-500">Captured from your signup — contact support to change before completing.</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`${idPrefix}-pw`} className="block text-sm font-semibold text-gray-700">
                      Password
                    </label>
                    <input
                      type="password"
                      id={`${idPrefix}-pw`}
                      value={registerData.password}
                      onChange={(e) => setRegisterData((p) => ({ ...p, password: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#3A7CA5] focus:ring-1 focus:ring-[#3A7CA5]"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${idPrefix}-pw2`} className="block text-sm font-semibold text-gray-700">
                      Confirm password
                    </label>
                    <input
                      type="password"
                      id={`${idPrefix}-pw2`}
                      value={registerData.password_confirmation}
                      onChange={(e) => setRegisterData((p) => ({ ...p, password_confirmation: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#3A7CA5] focus:ring-1 focus:ring-[#3A7CA5]"
                      autoComplete="new-password"
                    />
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
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8">
                  <RoleSelector
                    role={registerData.role}
                    onChange={(role) => {
                      setRegisterData((p) => ({ ...p, role, role_view: role }));
                      setPaymentToken(null);
                      setPaymentSummary(null);
                    }}
                  />
                  {registerData.role === 'technician' ? (
                    <TechnicianInfoFields
                      registerData={registerData}
                      setRegisterData={setRegisterData}
                      idPrefix={idPrefix}
                      emailReadOnly={emailLocked}
                    />
                  ) : (
                    <CompanyInfoFields
                      registerData={registerData}
                      setRegisterData={setRegisterData}
                      idPrefix={idPrefix}
                      emailReadOnly={emailLocked}
                    />
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                    <span className="text-sm font-semibold text-gray-600">Billing</span>
                    <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
                      <button
                        type="button"
                        onClick={() => setBillingInterval('monthly')}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                          billingInterval === 'monthly' ? 'bg-white text-tf-navy shadow' : 'text-gray-600'
                        }`}
                      >
                        Monthly
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingInterval('yearly')}
                        className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
                          billingInterval === 'yearly' ? 'bg-sky-100 text-[#3A7CA5] shadow' : 'text-gray-600'
                        }`}
                      >
                        Yearly
                        {yearlySavingsLabel ? (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            {yearlySavingsLabel}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>
                  {tierLoadError && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      Membership plans could not be loaded from the server. Refresh the page and try again — we do not show fallback prices.
                    </p>
                  )}
                  <div className="grid gap-4 lg:grid-cols-3">
                    {adaptedTiers.map((plan) => (
                      <MembershipPlanCard
                        key={plan.id}
                        plan={plan}
                        selected={registerData.membership_tier === plan.id}
                        billingInterval={billingInterval}
                        onSelect={() => {
                          setRegisterData((p) => ({ ...p, membership_tier: plan.id }));
                          setPaymentToken(null);
                          setPaymentSummary(null);
                        }}
                      />
                    ))}
                  </div>
                  {selectedPlan && (
                    <section className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4 text-sm text-gray-700">
                      <h3 className="text-base font-bold text-tf-navy">{selectedPlan.name} plan benefits</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <p>
                          <span className="font-semibold text-tf-navy">Job access: </span>
                          {selectedPlan.jobAccessLabel}
                        </p>
                        <p>
                          <span className="font-semibold text-tf-navy">Commission: </span>
                          {selectedPlan.commissionLabel}
                        </p>
                        {selectedPlanSavingsLabel && (
                          <p className="sm:col-span-2">
                            <span className="font-semibold text-tf-navy">One-job savings: </span>
                            {selectedPlanSavingsLabel}
                          </p>
                        )}
                        <p className="sm:col-span-2">
                          <span className="font-semibold text-tf-navy">Background check: </span>
                          {selectedPlan.id === 'premium'
                            ? 'Checkr background check cost is covered on Premium.'
                            : 'You pay for the Checkr background check on this tier.'}
                        </p>
                      </div>
                    </section>
                  )}
                  <p className="flex items-center justify-center gap-2 text-center text-xs text-gray-500">
                    <FaLock className="h-3.5 w-3.5" aria-hidden />
                    Billing starts after signup is complete.
                  </p>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-8">
                  <section className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-bold text-tf-navy">Your Information</h3>
                      <button type="button" onClick={() => setStep(2)} className="text-sm font-semibold text-[#3A7CA5] hover:underline">
                        Edit
                      </button>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase text-gray-500">Account type</dt>
                        <dd>{roleLabel(registerData.role)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-gray-500">Name</dt>
                        <dd>
                          {registerData.first_name} {registerData.last_name}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-gray-500">Phone</dt>
                        <dd>{registerData.phone}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-gray-500">Email</dt>
                        <dd className="break-all">{registerData.email}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase text-gray-500">Location</dt>
                        <dd>
                          {registerData.role === 'company'
                            ? formatLocationLabel(
                                registerData.business_city,
                                registerData.business_state,
                                registerData.business_zip_code
                              )
                            : formatLocationLabel(registerData.city, registerData.state, registerData.zip_code)}
                        </dd>
                      </div>
                      {registerData.role === 'technician' ? (
                        <>
                          <div>
                            <dt className="text-xs font-semibold uppercase text-gray-500">Primary trade</dt>
                            <dd>{registerData.trade_type}</dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-xs font-semibold uppercase text-gray-500">Specialties</dt>
                            <dd>{(registerData.specialties || []).join(', ') || '—'}</dd>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="sm:col-span-2">
                            <dt className="text-xs font-semibold uppercase text-gray-500">Company</dt>
                            <dd>{registerData.company_name}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase text-gray-500">Business phone</dt>
                            <dd>{registerData.business_phone || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase text-gray-500">Business email</dt>
                            <dd>{registerData.business_email || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase text-gray-500">Trade focus</dt>
                            <dd>{registerData.industry}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase text-gray-500">Hiring need</dt>
                            <dd>{registerData.primary_hiring_need}</dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-xs font-semibold uppercase text-gray-500">Business location / service area</dt>
                            <dd>
                              {registerData.business_address}, {registerData.business_city}, {registerData.business_state}{' '}
                              {registerData.business_zip_code}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </section>

                  <section className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-bold text-tf-navy">Your Membership</h3>
                      <button type="button" onClick={() => setStep(3)} className="text-sm font-semibold text-[#3A7CA5] hover:underline">
                        Edit
                      </button>
                    </div>
                    {selectedPlan && (
                      <div className="mt-4 space-y-3 text-sm text-gray-700">
                        <p>
                          <span className="font-semibold text-tf-navy">Plan: </span>
                          {selectedPlan.name}
                          {selectedPlan.isPopular && (
                            <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-tf-orange">
                              Most popular
                            </span>
                          )}
                        </p>
                        <p>
                          <span className="font-semibold text-tf-navy">Billing: </span>
                          {billingInterval === 'yearly' ? 'Billed yearly' : 'Billed monthly'}
                        </p>
                        <p>
                          <span className="font-semibold text-tf-navy">Price: </span>
                          {selectedPlan.priceLabel}
                        </p>
                        {selectedPlan.features.length > 0 && (
                          <ul className="list-inside list-disc space-y-1">
                            {selectedPlan.features.map((f) => (
                              <li key={f}>{f}</li>
                            ))}
                          </ul>
                        )}
                        <p>
                          <span className="font-semibold text-tf-navy">Job access: </span>
                          {selectedPlan.jobAccessLabel}
                        </p>
                        <p>
                          <span className="font-semibold text-tf-navy">Commission: </span>
                          {selectedPlan.commissionLabel}
                        </p>
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5">
                    <h3 className="text-lg font-bold text-tf-navy">Billing</h3>
                    {!selectedPlan?.requiresPayment ? (
                      <p className="mt-2 text-sm text-gray-600">No payment is required for this plan.</p>
                    ) : (
                      <p className="mt-2 text-sm text-gray-700">
                        After you create your account you will complete monthly billing on Stripe Checkout.
                        Your paid plan is not active until checkout succeeds. If you leave checkout, you stay on the free plan and can upgrade in Settings.
                      </p>
                    )}
                  </section>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-tf-orange focus:ring-tf-orange"
                    />
                    <span className="text-sm text-gray-700">
                      I agree to the{' '}
                      <Link to="/terms-of-service" className="font-semibold text-[#3A7CA5] hover:underline" target="_blank" rel="noreferrer">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy-policy" className="font-semibold text-[#3A7CA5] hover:underline" target="_blank" rel="noreferrer">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>

          <SignupFormActions
            form="signup-wizard"
            showBack={step > 1}
            onBack={goBack}
            submitLabel={
              step === 1
                ? 'Continue'
                : step === 2
                  ? 'Continue'
                  : step === 3
                    ? 'Continue'
                    : loading
                      ? 'Creating account…'
                      : 'Complete Sign Up'
            }
            SubmitIcon={step === 4 ? FaLock : undefined}
            disabled={loading}
            loading={loading && step === 4}
          />
        </form>
      </SignupWizardShell>
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-gray-500">
        <FaLock className="h-3.5 w-3.5" aria-hidden />
        {selectedPlan && !selectedPlan.requiresPayment
          ? 'No subscription charge for your selected free plan.'
          : 'Billing starts after signup is complete.'}
      </p>
      </div>
    </>
  );
};

export default RegisterForm;
