import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { profilesAPI, settingsAPI } from '../api/api';
import CardPaymentForm from '../components/CardPaymentForm';
import CountryStateSelect from '../components/CountryStateSelect';

const SettingsPage = ({ user, onLogout }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({});
  const [paymentError, setPaymentError] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder';

  const isCompany = user?.role === 'company';
  const isTechnician = user?.role === 'technician';

  useEffect(() => {
    fetchProfile();
  }, [user?.role]);

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
      alert('Profile saved!');
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
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
      alert('Photo updated!');
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
    const stripe = window.Stripe(publishableKey);
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
              <span className="text-2xl font-bold text-blue-600">SkilledHub</span>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Profile & Settings</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
        )}

        {/* Profile section */}
        <section className="bg-white rounded-2xl shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
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

          {!isCompany && !isTechnician && (
            <p className="text-gray-500">Payment settings are available for companies and technicians.</p>
          )}
        </section>
      </main>
    </div>
  );
};

export default SettingsPage;
