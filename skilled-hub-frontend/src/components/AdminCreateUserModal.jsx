import React, { useState, useEffect } from 'react';
import { FaBuilding, FaEye, FaEyeSlash, FaTimes, FaUserPlus, FaWrench } from 'react-icons/fa';
import { adminUsersAPI, crmAPI, licensingSettingsAPI } from '../api/api';
import { IndustryMultiSelect, ServiceCityPicker } from './admin/AdminUserFormPickers';
import { formatPhoneInput } from '../utils/phone';
import { requiresElectricalLicenseForState, setLocalOnlyLicenseStates } from '../utils/licensingRules';
import { TRADE_OPTIONS } from '../constants/trades';

/**
 * Same "Create user" flow as the Admin Users list page.
 * @param {null | { id: number, company_name?: string, company_users_count?: number }} presetCompanyProfile — when set, creates a company login on that profile only (simplified path).
 * @param {(detail: { kind: 'company_new'|'company_link'|'technician' }) => void} onCompleted — called after successful API create (modal already reset).
 */
export default function AdminCreateUserModal({
  isOpen,
  onClose,
  presetCompanyProfile = null,
  onCompleted,
  onError,
}) {
  const [createRole, setCreateRole] = useState('company');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    password_confirmation: '',
    company_name: '',
    contact_name: '',
    phone: '',
    bio: '',
    website_url: '',
    facebook_url: '',
    instagram_url: '',
    linkedin_url: '',
    state: '',
    electrical_license_number: '',
    trade_type: '',
    experience_years: '',
    location: '',
  });
  const [serviceCities, setServiceCities] = useState([]);
  const [selectedIndustries, setSelectedIndustries] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [useExistingCompany, setUseExistingCompany] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companySearchBusy, setCompanySearchBusy] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showContactPassword, setShowContactPassword] = useState(false);
  const [showTechPassword, setShowTechPassword] = useState(false);

  useEffect(() => {
    let active = true;
    licensingSettingsAPI.get()
      .then((res) => {
        if (!active) return;
        setLocalOnlyLicenseStates(res?.local_only_state_codes || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !creating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, creating, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (presetCompanyProfile?.id) {
      setCreateRole('company');
      setUseExistingCompany(true);
      setSelectedCompany({
        id: presetCompanyProfile.id,
        company_name: presetCompanyProfile.company_name,
        company_users_count: presetCompanyProfile.company_users_count ?? 0,
      });
      setCompanySearch('');
      setCompanyOptions([]);
    } else {
      setCreateRole('company');
      setUseExistingCompany(false);
      setSelectedCompany(null);
      setCompanySearch('');
      setCompanyOptions([]);
    }
    setCreateForm({
      email: '',
      first_name: '',
      last_name: '',
      password: '',
      password_confirmation: '',
      company_name: '',
      contact_name: '',
      phone: '',
      bio: '',
      website_url: '',
      facebook_url: '',
      instagram_url: '',
      linkedin_url: '',
      state: '',
      electrical_license_number: '',
      trade_type: '',
      experience_years: '',
      location: '',
    });
    setServiceCities([]);
    setSelectedIndustries([]);
    setLogoFile(null);
    setShowContactPassword(false);
    setShowTechPassword(false);
  }, [isOpen, presetCompanyProfile]);

  useEffect(() => {
    if (!isOpen || createRole !== 'company' || !useExistingCompany || presetCompanyProfile?.id) {
      return undefined;
    }
    const q = companySearch.trim();
    if (q.length < 2) {
      setCompanyOptions([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setCompanySearchBusy(true);
      try {
        const res = await crmAPI.searchCompanies(q);
        if (!cancelled) {
          setCompanyOptions(Array.isArray(res?.companies) ? res.companies : []);
        }
      } catch {
        if (!cancelled) setCompanyOptions([]);
      } finally {
        if (!cancelled) setCompanySearchBusy(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [companySearch, isOpen, createRole, useExistingCompany, presetCompanyProfile]);

  const resetAfterSuccess = async (kind, details = {}) => {
    setCreateForm({
      email: '',
      first_name: '',
      last_name: '',
      password: '',
      password_confirmation: '',
      company_name: '',
      contact_name: '',
      phone: '',
      bio: '',
      website_url: '',
      facebook_url: '',
      instagram_url: '',
      linkedin_url: '',
      state: '',
      electrical_license_number: '',
      trade_type: '',
      experience_years: '',
      location: '',
    });
    setServiceCities([]);
    setSelectedIndustries([]);
    setLogoFile(null);
    setShowContactPassword(false);
    setShowTechPassword(false);
    if (!presetCompanyProfile?.id) {
      setUseExistingCompany(false);
      setCompanySearch('');
      setCompanyOptions([]);
      setSelectedCompany(null);
    }
    onClose();
    if (onCompleted) await onCompleted({ kind, ...details });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const email = createForm.email?.trim();
    if (!email) {
      onError?.(createRole === 'company' ? 'Enter a contact email for this business.' : 'Enter an email for the new account.');
      return;
    }
    const firstName = createForm.first_name?.trim();
    const lastName = createForm.last_name?.trim();
    const phone = createForm.phone?.trim();
    if (!firstName || !lastName) {
      onError?.('First and last name are required.');
      return;
    }
    if (!phone) {
      onError?.('Phone number is required.');
      return;
    }
    const password = (createForm.password || '').trim();
    const passwordConfirmation = (createForm.password_confirmation || '').trim();
    if (password || passwordConfirmation) {
      if (!password || !passwordConfirmation) {
        onError?.('Enter and confirm the password.');
        return;
      }
      if (password !== passwordConfirmation) {
        onError?.('Password confirmation does not match.');
        return;
      }
    }
    const effectiveUseExisting = presetCompanyProfile?.id ? true : useExistingCompany;
    const effectiveCompany = presetCompanyProfile?.id
      ? {
          id: presetCompanyProfile.id,
          company_name: presetCompanyProfile.company_name,
          company_users_count: presetCompanyProfile.company_users_count,
        }
      : selectedCompany;

    setCreating(true);
    try {
      if (createRole === 'company') {
        if (effectiveUseExisting) {
          if (!effectiveCompany?.id) {
            onError?.('Pick an existing company before creating this contact login.');
            setCreating(false);
            return;
          }
          await adminUsersAPI.create({
            role: 'company',
            email,
            company_profile_id: effectiveCompany.id,
            first_name: firstName,
            last_name: lastName,
            phone,
            password: password || undefined,
            password_confirmation: passwordConfirmation || undefined,
          });
          await resetAfterSuccess('company_link', { passwordSet: Boolean(password) });
        } else {
          if (!createForm.company_name?.trim() || !createForm.phone?.trim() || !createForm.bio?.trim()) {
            onError?.('Company name, phone number, and bio are required.');
            setCreating(false);
            return;
          }
          const companyState = createForm.state?.trim();
          if (!companyState) {
            onError?.('Company state is required.');
            setCreating(false);
            return;
          }
          const stateRequiresLicense = requiresElectricalLicenseForState(companyState);
          if (stateRequiresLicense && !createForm.electrical_license_number?.trim()) {
            onError?.('This state requires an electrical license number.');
            setCreating(false);
            return;
          }
          const fd = new FormData();
          fd.append('role', 'company');
          fd.append('email', email);
          fd.append('first_name', firstName);
          fd.append('last_name', lastName);
          fd.append('phone', phone);
          if (password) fd.append('password', password);
          if (passwordConfirmation) fd.append('password_confirmation', passwordConfirmation);
          fd.append('company_name', createForm.company_name.trim());
          fd.append('state', companyState);
          if (createForm.electrical_license_number?.trim()) {
            fd.append('electrical_license_number', createForm.electrical_license_number.trim());
          }
          if (createForm.contact_name?.trim()) fd.append('contact_name', createForm.contact_name.trim());
          if (selectedIndustries.length) fd.append('industry', selectedIndustries.join(', '));
          fd.append('bio', createForm.bio.trim());
          if (createForm.website_url?.trim()) fd.append('website_url', createForm.website_url.trim());
          if (createForm.facebook_url?.trim()) fd.append('facebook_url', createForm.facebook_url.trim());
          if (createForm.instagram_url?.trim()) fd.append('instagram_url', createForm.instagram_url.trim());
          if (createForm.linkedin_url?.trim()) fd.append('linkedin_url', createForm.linkedin_url.trim());
          serviceCities.map((c) => c.trim()).filter(Boolean).forEach((c) => fd.append('service_cities[]', c));
          if (logoFile) fd.append('logo', logoFile);
          await adminUsersAPI.create(fd);
          await resetAfterSuccess('company_new', { passwordSet: Boolean(password) });
        }
      } else {
        await adminUsersAPI.create({
          role: 'technician',
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          password: password || undefined,
          password_confirmation: passwordConfirmation || undefined,
          trade_type: createForm.trade_type?.trim() || undefined,
          location: createForm.location?.trim() || undefined,
          experience_years:
            createForm.experience_years === '' ? undefined : parseInt(createForm.experience_years, 10),
          bio: createForm.bio?.trim() || undefined,
        });
        await resetAfterSuccess('technician', { passwordSet: Boolean(password) });
      }
    } catch (err) {
      onError?.(err.message || 'Could not create user');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  const lockedCompany = Boolean(presetCompanyProfile?.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-create-user-title"
    >
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FaUserPlus className="text-emerald-600 shrink-0 w-5 h-5" aria-hidden />
            <h2 id="admin-create-user-title" className="text-lg font-semibold text-gray-900 truncate">
              {createRole === 'company' ? 'Create company contact' : 'Create user'}
            </h2>
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          {!lockedCompany && (
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setCreateRole('company')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  createRole === 'company'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                <FaBuilding className="inline mr-1" /> Company
              </button>
              <button
                type="button"
                onClick={() => setCreateRole('technician')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  createRole === 'technician'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                <FaWrench className="inline mr-1" /> Technician
              </button>
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {createRole === 'company' ? (
              <>
                {lockedCompany ? (
                  <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-sm text-gray-800">
                    <div className="text-xs font-medium text-gray-500 uppercase mb-1">Step 1: Business</div>
                    <div className="font-semibold text-gray-900">
                      {presetCompanyProfile.company_name || `Company #${presetCompanyProfile.id}`}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      New login will be added to this company profile.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="sm:col-span-2 rounded-xl border border-gray-200 p-3 bg-gray-50">
                      <div className="text-xs font-medium text-gray-500 uppercase mb-2">Step 1: Business</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setUseExistingCompany(false);
                            setSelectedCompany(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                            !useExistingCompany ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                          }`}
                        >
                          Create new business
                        </button>
                        <button
                          type="button"
                          onClick={() => setUseExistingCompany(true)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                            useExistingCompany ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                          }`}
                        >
                          Use existing business
                        </button>
                      </div>
                    </div>
                    {useExistingCompany ? (
                      <div className="sm:col-span-2">
                        <span className="text-xs font-medium text-gray-500 uppercase">Select business *</span>
                        <input
                          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          value={companySearch}
                          onChange={(e) => {
                            setCompanySearch(e.target.value);
                            setSelectedCompany(null);
                          }}
                          placeholder="Search business by name..."
                        />
                        <div className="mt-2 border border-gray-200 rounded-lg max-h-40 overflow-auto bg-white">
                          {companySearchBusy ? (
                            <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
                          ) : companyOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">No companies found.</div>
                          ) : (
                            companyOptions.map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setSelectedCompany(opt)}
                                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-b-0 ${
                                  selectedCompany?.id === opt.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700'
                                }`}
                              >
                                <div className="font-medium">{opt.company_name || `Company #${opt.id}`}</div>
                                <div className="text-xs text-gray-500">{opt.company_users_count || 0} login account(s)</div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <label className="block sm:col-span-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">Business name *</span>
                          <input
                            required
                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={createForm.company_name}
                            onChange={(e) => setCreateForm((f) => ({ ...f, company_name: e.target.value }))}
                          />
                        </label>
                        <div className="block sm:col-span-2">
                          <label htmlFor="admin-create-industry-input" className="text-xs font-medium text-gray-500 uppercase">
                            Industry
                          </label>
                          <p className="text-xs text-gray-500 mt-0.5 mb-1">
                            Type to search (any casing). Press Enter or pick from the list to add a tag.
                          </p>
                          <IndustryMultiSelect
                            inputId="admin-create-industry-input"
                            value={selectedIndustries}
                            onChange={setSelectedIndustries}
                          />
                        </div>
                        <div className="block sm:col-span-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">Service cities</span>
                          <ServiceCityPicker
                            inputId="admin-create-service-cities-input"
                            value={serviceCities}
                            onChange={setServiceCities}
                          />
                        </div>
                        <label className="block sm:col-span-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">State *</span>
                          <input
                            required
                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={createForm.state}
                            onChange={(e) => setCreateForm((f) => ({ ...f, state: e.target.value }))}
                            placeholder="e.g. Texas"
                          />
                        </label>
                        {requiresElectricalLicenseForState(createForm.state) && (
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Electrical license number *</span>
                            <input
                              required
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                              value={createForm.electrical_license_number}
                              onChange={(e) =>
                                setCreateForm((f) => ({ ...f, electrical_license_number: e.target.value }))
                              }
                              placeholder="Enter TECL license number"
                            />
                          </label>
                        )}
                        <label className="block sm:col-span-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">Company website</span>
                          <input
                            type="url"
                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={createForm.website_url}
                            onChange={(e) => setCreateForm((f) => ({ ...f, website_url: e.target.value }))}
                            placeholder="https://"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-gray-500 uppercase">Facebook</span>
                          <input
                            type="url"
                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={createForm.facebook_url}
                            onChange={(e) => setCreateForm((f) => ({ ...f, facebook_url: e.target.value }))}
                            placeholder="https://facebook.com/..."
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-gray-500 uppercase">Instagram</span>
                          <input
                            type="url"
                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={createForm.instagram_url}
                            onChange={(e) => setCreateForm((f) => ({ ...f, instagram_url: e.target.value }))}
                            placeholder="https://instagram.com/..."
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">LinkedIn</span>
                          <input
                            type="url"
                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={createForm.linkedin_url}
                            onChange={(e) => setCreateForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                            placeholder="https://linkedin.com/..."
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">Logo</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-gray-300 file:bg-white"
                            onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                          />
                          <p className="text-xs text-gray-500 mt-1">Optional. Shown as the company profile image.</p>
                        </label>
                      </>
                    )}
                  </>
                )}
                <div className="sm:col-span-2 rounded-xl border border-gray-200 p-3 bg-gray-50">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">Step 2: Contact</div>
                  <p className="text-xs text-gray-600">
                    Create the login for the contact person who belongs to this business.
                  </p>
                </div>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Contact email *</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="contact@business.com"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">First name *</span>
                  <input
                    required
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, first_name: e.target.value }))}
                    placeholder="First name"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Last name *</span>
                  <input
                    required
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, last_name: e.target.value }))}
                    placeholder="Last name"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Phone *</span>
                  <input
                    type="tel"
                    required
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
                    placeholder="(555) 555-5555"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Set password</span>
                  <p className="text-xs text-gray-500 mt-0.5 mb-1">Leave blank to email a setup link.</p>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type={showContactPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="w-full min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowContactPassword((v) => !v)}
                      className="shrink-0 p-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                      aria-label={showContactPassword ? 'Hide password' : 'Show password'}
                    >
                      {showContactPassword ? (
                        <FaEyeSlash className="w-4 h-4" aria-hidden />
                      ) : (
                        <FaEye className="w-4 h-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Confirm password</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type={showContactPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="w-full min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={createForm.password_confirmation}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password_confirmation: e.target.value }))}
                      placeholder="Repeat password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowContactPassword((v) => !v)}
                      className="shrink-0 p-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                      aria-label={showContactPassword ? 'Hide password' : 'Show password'}
                    >
                      {showContactPassword ? (
                        <FaEyeSlash className="w-4 h-4" aria-hidden />
                      ) : (
                        <FaEye className="w-4 h-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Email *</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="tech@example.com"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">First name *</span>
                  <input
                    required
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, first_name: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Last name *</span>
                  <input
                    required
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, last_name: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Phone *</span>
                  <input
                    type="tel"
                    required
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Trade</span>
                  <input
                    list="admin-create-user-trades"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.trade_type}
                    onChange={(e) => setCreateForm((f) => ({ ...f, trade_type: e.target.value }))}
                    placeholder="Type or pick a trade"
                  />
                  <datalist id="admin-create-user-trades">
                    {TRADE_OPTIONS.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Years experience</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.experience_years}
                    onChange={(e) => setCreateForm((f) => ({ ...f, experience_years: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Location</span>
                  <input
                    autoComplete="off"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.location}
                    onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Set password</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type={showTechPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="w-full min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="Leave blank to send setup email"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTechPassword((v) => !v)}
                      className="shrink-0 p-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                      aria-label={showTechPassword ? 'Hide password' : 'Show password'}
                    >
                      {showTechPassword ? (
                        <FaEyeSlash className="w-4 h-4" aria-hidden />
                      ) : (
                        <FaEye className="w-4 h-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Confirm password</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type={showTechPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="w-full min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={createForm.password_confirmation}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password_confirmation: e.target.value }))}
                      placeholder="Repeat password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTechPassword((v) => !v)}
                      className="shrink-0 p-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                      aria-label={showTechPassword ? 'Hide password' : 'Show password'}
                    >
                      {showTechPassword ? (
                        <FaEyeSlash className="w-4 h-4" aria-hidden />
                      ) : (
                        <FaEye className="w-4 h-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </label>
              </>
            )}
            {!(lockedCompany && createRole === 'company') && (
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-gray-500 uppercase">
                  Bio{createRole === 'company' && !useExistingCompany ? ' *' : ''}
                </span>
                <textarea
                  rows={2}
                  required={createRole === 'company' && !useExistingCompany}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={createForm.bio}
                  onChange={(e) => setCreateForm((f) => ({ ...f, bio: e.target.value }))}
                />
              </label>
            )}
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50"
              >
                {creating ? 'Creating…' : createRole === 'company' ? 'Create contact & email' : 'Create & email'}
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={onClose}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
