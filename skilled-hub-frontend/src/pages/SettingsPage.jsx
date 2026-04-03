import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TECHFLASH_LOGO_NAV } from '../constants/branding';
import { profilesAPI, settingsAPI, authAPI, documentsAPI } from '../api/api';
import { auth } from '../auth';
import CardPaymentForm from '../components/CardPaymentForm';
import { getStripePublishableKey, isValidStripePublishableKey } from '../stripeConfig';
import CountryStateSelect from '../components/CountryStateSelect';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';

const SettingsPage = ({ user, onLogout, onUserUpdate }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({});
  const [paymentError, setPaymentError] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [deletingCertId, setDeletingCertId] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success' });
  const [confirmCertId, setConfirmCertId] = useState(null);
  const publishableKey = getStripePublishableKey();
  const stripe = useMemo(() => {
    if (window.Stripe && isValidStripePublishableKey(publishableKey)) {
      return window.Stripe(publishableKey);
    }
    return null;
  }, [publishableKey]);

  const isCompany = user?.role === 'company';
  const isTechnician = user?.role === 'technician';
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchProfile();
  }, [user?.role]);

  useEffect(() => {
    if (isTechnician && profile?.id) {
      documentsAPI.getAll()
        .then((docs) => {
          const certs = (docs || []).filter(
            (d) => d.doc_type === 'certificate' && d.uploadable_type === 'TechnicianProfile' && d.uploadable_id === profile.id
          );
          setCertificates(certs);
        })
        .catch(() => setCertificates([]));
    } else {
      setCertificates([]);
    }
  }, [isTechnician, profile?.id]);

  useEffect(() => {
    setAccountEmail(user?.email || auth.getUser()?.email || '');
  }, [user?.email]);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isCompany) {
        const p = await profilesAPI.getCompanyProfile();
        setProfile(p);
        setForm({
          company_name: p?.company_name || '',
          industry: p?.industry || '',
          location: p?.location || '',
          bio: p?.bio || '',
        });
      } else if (isTechnician) {
        const p = await profilesAPI.getTechnicianProfile();
        setProfile(p);
        setForm({
          trade_type: p?.trade_type || '',
          experience_years: p?.experience_years ?? '',
          availability: p?.availability || '',
          bio: p?.bio || '',
          location: p?.location || '',
          address: p?.address || '',
          city: p?.city || '',
          state: p?.state || 'Texas',
          zip_code: p?.zip_code || '',
          country: p?.country || 'United States',
        });
      } else {
        setProfile(null);
      }
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const showProfileForm = isCompany || isTechnician;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!profile?.id) return;
    setSaving(true);
    setError(null);
    try {
      if (isCompany) {
        await profilesAPI.updateCompanyProfile(profile.id, form);
      } else {
        await profilesAPI.updateTechnicianProfile(profile.id, {
          ...form,
          experience_years: form.experience_years === '' ? null : parseInt(form.experience_years, 10),
        });
      }
      await fetchProfile();
      setAlertModal({ isOpen: true, title: 'Profile saved!', message: 'Your profile has been updated.', variant: 'success' });
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    const email = accountEmail.trim();
    if (!email) return;
    if (accountPassword && accountPassword !== accountPasswordConfirm) {
      setAccountError('Passwords do not match');
      return;
    }
    setSavingAccount(true);
    setAccountError(null);
    try {
      const payload = { email };
      if (accountPassword) {
        payload.password = accountPassword;
        payload.password_confirmation = accountPasswordConfirm;
      }
      const res = await authAPI.updateMe(payload);
      auth.setUser(res.user);
      onUserUpdate?.(res.user);
      setAccountPassword('');
      setAccountPasswordConfirm('');
      setAlertModal({
        isOpen: true,
        title: 'Account updated',
        message: email !== (user?.email || auth.getUser()?.email) ? 'Email updated. Use your new email to log in next time.' : 'Your account has been updated.',
        variant: 'success',
      });
    } catch (err) {
      setAccountError(err.message || 'Failed to update account');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleCertificateUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    setUploadingCert(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('uploadable_type', 'TechnicianProfile');
      fd.append('uploadable_id', profile.id);
      fd.append('doc_type', 'certificate');
      await documentsAPI.upload(fd);
      const docs = await documentsAPI.getAll();
      setCertificates((docs || []).filter(
        (d) => d.doc_type === 'certificate' && d.uploadable_type === 'TechnicianProfile' && d.uploadable_id === profile.id
      ));
      setAlertModal({ isOpen: true, title: 'Certificate uploaded!', message: 'Your certificate has been added.', variant: 'success' });
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Upload failed', message: err.message || 'Failed to upload certificate', variant: 'error' });
    } finally {
      setUploadingCert(false);
      e.target.value = '';
    }
  };

  const handleCertificateDelete = (docId) => {
    setConfirmCertId(docId);
  };

  const confirmCertificateDelete = async () => {
    const docId = confirmCertId;
    setConfirmCertId(null);
    if (!docId) return;
    setDeletingCertId(docId);
    try {
      await documentsAPI.delete(docId);
      setCertificates((prev) => prev.filter((d) => d.id !== docId));
      setAlertModal({ isOpen: true, title: 'Certificate removed', message: 'The certificate has been deleted.', variant: 'success' });
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Remove failed', message: err.message || 'Failed to remove certificate', variant: 'error' });
    } finally {
      setDeletingCertId(null);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      if (isCompany) {
        await profilesAPI.updateCompanyProfile(profile.id, fd);
      } else {
        await profilesAPI.updateTechnicianProfile(profile.id, fd);
      }
      await fetchProfile();
      setAlertModal({ isOpen: true, title: 'Photo updated!', message: 'Your profile photo has been updated.', variant: 'success' });
    } catch (err) {
      setError(err.message || 'Failed to upload photo');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCardConfirm = async ({ card, billing_details }) => {
    setPaymentError(null);
    setPaymentSuccess(null);
    const res = await settingsAPI.createSetupIntent();
    const client_secret = res?.client_secret;
    if (!client_secret) throw new Error(res?.error || 'Could not create setup');
    if (!stripe) throw new Error('Payment form not ready');
    const { error: confirmError } = await stripe.confirmCardSetup(client_secret, {
      payment_method: { card, billing_details },
    });
    if (confirmError) throw new Error(confirmError.message);
    setPaymentSuccess('Payment method added successfully.');
  };

  const handleConnectBank = async () => {
    setPaymentError(null);
    setPaymentSuccess(null);
    try {
      const { url } = await settingsAPI.createConnectAccountLink();
      if (url) window.location.href = url;
      else throw new Error('No link received');
    } catch (err) {
      setPaymentError(err.message || 'Failed to start bank setup');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <img src={TECHFLASH_LOGO_NAV} alt="TechFlash" className="h-9 object-contain" />
            </Link>
            <nav className="flex space-x-4">
              <Link to="/dashboard" className="text-gray-600 hover:text-blue-600">Dashboard</Link>
              <Link to="/jobs" className="text-gray-600 hover:text-blue-600">Jobs</Link>
              <Link to="/messages" className="text-gray-600 hover:text-blue-600">Messages</Link>
              <Link to="/settings" className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">Settings</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button onClick={onLogout} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
        )}

        {/* Account section - Email (username) & Password */}
        <section className="bg-white rounded-2xl shadow p-6 mb-8 border-2 border-blue-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Account</h2>
          <p className="text-sm text-gray-600 mb-4">Your email is your username. Change it here along with your password.</p>
          {accountError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{accountError}</div>
          )}
          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (username)</label>
              <input
                type="email"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password (leave blank to keep current)</label>
              <input
                type="password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input
                type="password"
                value={accountPasswordConfirm}
                onChange={(e) => setAccountPasswordConfirm(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" disabled={savingAccount} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingAccount ? 'Saving...' : 'Update Account'}
            </button>
          </form>
        </section>

        {/* Profile section */}
        <section className="bg-white rounded-2xl shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
          {isAdmin ? (
            <p className="text-gray-500">Admin accounts do not have technician or company profiles.</p>
          ) : (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="relative">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-2 border-gray-200" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-3xl text-gray-500 font-bold">
                    {user?.email?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <label className="absolute bottom-0 right-0 bg-blue-600 text-white rounded-full p-2 cursor-pointer hover:bg-blue-700">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                </label>
              </div>
              <div className="text-sm text-gray-500">Click to change photo</div>
            </div>

            {isCompany && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
                  <input name="company_name" value={form.company_name} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <input name="industry" value={form.industry} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Construction, HVAC" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input name="location" value={form.location} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                </div>
              </>
            )}

            {isTechnician && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trade type</label>
                  <input name="trade_type" value={form.trade_type} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Electrician, Plumber" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Years of experience</label>
                  <input type="number" min="0" name="experience_years" value={form.experience_years} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Availability</label>
                  <input name="availability" value={form.availability} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Full-time, Part-time" />
                </div>
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Certificates</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Upload images of your certifications (e.g. OSHA, EPA, trade licenses). Companies will verify these match their job requirements.
                  </p>
                  <div className="flex flex-wrap gap-4 mb-4">
                    {certificates.map((doc) => (
                      <div key={doc.id} className="relative group border rounded-lg overflow-hidden bg-gray-50 w-32 h-32">
                        {doc.file_url && (
                          <img src={doc.file_url} alt="Certificate" className="w-full h-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => handleCertificateDelete(doc.id)}
                          disabled={deletingCertId === doc.id}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                          title="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    <label className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                      <input type="file" accept="image/*" className="hidden" onChange={handleCertificateUpload} disabled={uploadingCert} />
                      {uploadingCert ? (
                        <span className="text-sm text-gray-500">Uploading...</span>
                      ) : (
                        <span className="text-3xl text-gray-400">+</span>
                      )}
                    </label>
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Your Address</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input name="address" value={form.address} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. 123 Main St" />
                  </div>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input name="city" value={form.city} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Houston" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <CountryStateSelect
                      country={form.country}
                      state={form.state}
                      onCountryChange={(v) => handleChange({ target: { name: 'country', value: v } })}
                      onStateChange={(v) => handleChange({ target: { name: 'state', value: v } })}
                    />
                  </div>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                    <input name="zip_code" value={form.zip_code} onChange={handleChange} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. 77007" />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea name="bio" value={form.bio} onChange={handleChange} rows={4} className="w-full border rounded-lg px-3 py-2" placeholder="Tell others about yourself or your company..." />
            </div>

            <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
          )}
        </section>

        {/* Payment section */}
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment</h2>
          {paymentError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{paymentError}</div>}
          {paymentSuccess && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{paymentSuccess}</div>}

          {isCompany && (
            <div>
              <h3 className="text-base font-medium text-gray-900 mb-2">Credit card</h3>
              <p className="text-gray-600 mb-4">Add a credit or debit card to pay for jobs when you accept technicians.</p>
              <CardPaymentForm
                stripe={stripe}
                publishableKey={publishableKey}
                onConfirm={handleAddCardConfirm}
                submitLabel="Add Card"
              />
            </div>
          )}

          {isTechnician && (
            <div>
              <p className="text-gray-600 mb-4">
                Connect your bank account to receive payouts when jobs are completed.
                {profile?.stripe_connected && <span className="text-green-600 font-medium ml-2">✓ Connected</span>}
              </p>
              <button
                onClick={handleConnectBank}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                {profile?.stripe_connected ? 'Update Bank Account' : 'Connect Bank Account'}
              </button>
            </div>
          )}

          {(isAdmin || (!isCompany && !isTechnician)) && (
            <p className="text-gray-500">Payment settings are available for companies and technicians.</p>
          )}
        </section>
      </main>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />

      <ConfirmModal
        isOpen={!!confirmCertId}
        onClose={() => setConfirmCertId(null)}
        onConfirm={confirmCertificateDelete}
        title="Remove certificate?"
        message="Are you sure you want to remove this certificate?"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="destructive"
      />
    </div>
  );
};

export default SettingsPage;
