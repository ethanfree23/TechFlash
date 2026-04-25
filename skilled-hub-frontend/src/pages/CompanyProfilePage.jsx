import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AdminCreateUserModal from '../components/AdminCreateUserModal';
import AlertModal from '../components/AlertModal';
import { profilesAPI, crmAPI } from '../api/api';
import { buildImportDraftRows } from '../utils/crmImport';

const CRM_STATUSES = ['lead', 'contacted', 'qualified', 'proposal', 'prospect', 'customer', 'competitor', 'churned', 'lost'];
const CRM_COMPANY_TYPES = [
  'hvac',
  'plumbing',
  'electrical',
  'refrigeration',
  'fire_protection',
  'general_contracting',
  'handyman',
  'roofing',
  'solar',
  'appliance_repair',
  'facility_maintenance',
  'other',
];

const CompanyProfilePage = ({ user, onLogout }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState('');
  const [mergeOptions, setMergeOptions] = useState([]);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [mergeDirection, setMergeDirection] = useState('into_selected');
  const [companyCrmLeads, setCompanyCrmLeads] = useState([]);
  const [selectedCrmLeadId, setSelectedCrmLeadId] = useState('');
  const [contactImportText, setContactImportText] = useState('');
  const [contactImportRows, setContactImportRows] = useState([]);
  const [contactImportBusy, setContactImportBusy] = useState(false);
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'success',
  });

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    profilesAPI.getCompanyById(id)
      .then(setProfile)
      .catch((err) => {
        // Backend returns 403 when company tries to view another company's profile
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('own company') || msg.includes('forbidden') || msg.includes('403')) {
          navigate('/dashboard', { replace: true });
        } else {
          setError('Failed to load company profile');
        }
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (user?.role !== 'admin') return undefined;
    const q = mergeQuery.trim();
    if (q.length < 2) {
      setMergeOptions([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setMergeBusy(true);
      try {
        const res = await crmAPI.searchCompanies(q);
        if (!cancelled) {
          const options = (res.companies || []).filter((c) => Number(c.id) !== Number(id));
          setMergeOptions(options);
        }
      } catch {
        if (!cancelled) setMergeOptions([]);
      } finally {
        if (!cancelled) setMergeBusy(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mergeQuery, id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin' || !id) return;
    let cancelled = false;
    const loadCompanyCrmLeads = async () => {
      try {
        const res = await crmAPI.list();
        if (cancelled) return;
        const leads = (res.crm_leads || []).filter((lead) => Number(lead.linked_company_profile_id) === Number(id));
        setCompanyCrmLeads(leads);
        if (leads.length > 0) setSelectedCrmLeadId(String(leads[0].id));
      } catch {
        if (cancelled) return;
        setCompanyCrmLeads([]);
        setSelectedCrmLeadId('');
      }
    };
    loadCompanyCrmLeads();
    return () => {
      cancelled = true;
    };
  }, [id, user?.role]);

  const refreshCompanyProfile = useCallback(async () => {
    if (!id) return;
    try {
      const p = await profilesAPI.getCompanyById(id);
      setProfile(p);
    } catch {
      setAlertModal({
        isOpen: true,
        title: 'Could not refresh',
        message: 'The user list may be stale. Try reloading the page.',
        variant: 'error',
      });
    }
  }, [id]);

  const mergeCompany = async () => {
    if (!mergeTarget?.id) {
      setAlertModal({
        isOpen: true,
        title: 'Target required',
        message: 'Select the company to keep before merging.',
        variant: 'error',
      });
      return;
    }
    const keepCurrent = mergeDirection === 'into_current';
    const currentLabel = profile?.company_name || `Company #${id}`;
    const selectedLabel = mergeTarget.company_name || `Company #${mergeTarget.id}`;
    const confirmMessage = keepCurrent
      ? `Merge "${selectedLabel}" into "${currentLabel}"? This keeps the current account and removes the selected one. This cannot be undone.`
      : `Merge "${currentLabel}" into "${selectedLabel}"? This removes the current account and keeps the selected one. This cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;
    setMergeSaving(true);
    try {
      const directionParam = keepCurrent ? 'into_current' : 'into_target';
      await profilesAPI.mergeCompanyProfile(id, mergeTarget.id, directionParam);
      setAlertModal({
        isOpen: true,
        title: 'Merge complete',
        message: 'Duplicate company was merged successfully.',
        variant: 'success',
      });
      navigate(`/companies/${keepCurrent ? id : mergeTarget.id}`, { replace: true });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Merge failed',
        message: e.message || 'Could not merge company profiles.',
        variant: 'error',
      });
    } finally {
      setMergeSaving(false);
    }
  };

  const parseContactImport = () => {
    if (!contactImportText.trim()) {
      setAlertModal({
        isOpen: true,
        title: 'Nothing to parse',
        message: 'Paste contact details first.',
        variant: 'error',
      });
      return;
    }
    const draft = buildImportDraftRows(contactImportText, CRM_STATUSES, CRM_COMPANY_TYPES);
    const contacts = draft
      .map((row) => ({
        name: String(row.contact_name || '').trim(),
        email: String(row.email || '').trim(),
        phone: String(row.phone || '').trim(),
      }))
      .filter((contact) => contact.name || contact.email || contact.phone);
    if (contacts.length === 0) {
      setAlertModal({
        isOpen: true,
        title: 'No contacts found',
        message: 'Try adding names with emails or phone numbers.',
        variant: 'error',
      });
      return;
    }
    setContactImportRows(contacts);
  };

  const updateContactImportRow = (idx, key, value) => {
    setContactImportRows((rows) => rows.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  };

  const removeContactImportRow = (idx) => {
    setContactImportRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const saveImportedContacts = async () => {
    const targetLeadId = Number(selectedCrmLeadId);
    if (!targetLeadId) {
      setAlertModal({
        isOpen: true,
        title: 'CRM company required',
        message: 'Link this company to a CRM record first, then import contacts.',
        variant: 'error',
      });
      return;
    }
    const cleanedRows = contactImportRows
      .map((row) => ({
        name: String(row.name || '').trim(),
        email: String(row.email || '').trim(),
        phone: String(row.phone || '').trim(),
      }))
      .filter((row) => row.name || row.email || row.phone);
    if (cleanedRows.length === 0) {
      setAlertModal({
        isOpen: true,
        title: 'No contacts to save',
        message: 'Parse and review at least one contact first.',
        variant: 'error',
      });
      return;
    }

    const dedupeKey = (entry) => [
      String(entry.name || '').trim().toLowerCase(),
      String(entry.email || '').trim().toLowerCase(),
      String(entry.phone || '').replace(/\D/g, '').slice(-10),
    ].join('|');

    setContactImportBusy(true);
    try {
      const leadRes = await crmAPI.get(targetLeadId);
      const lead = leadRes.crm_lead || {};
      const existingContacts = Array.isArray(lead.contacts) ? lead.contacts : [];
      const merged = [...existingContacts, ...cleanedRows]
        .map((entry) => ({
          name: String(entry.name || '').trim(),
          email: String(entry.email || '').trim(),
          phone: String(entry.phone || '').trim(),
        }))
        .filter((entry) => entry.name || entry.email || entry.phone);
      const uniqueContacts = [];
      const seen = new Set();
      merged.forEach((entry) => {
        const key = dedupeKey(entry);
        if (!key || seen.has(key)) return;
        seen.add(key);
        uniqueContacts.push(entry);
      });
      const primary = uniqueContacts[0] || {};

      await crmAPI.update(targetLeadId, {
        contacts: uniqueContacts,
        contact_name: primary.name || '',
        email: primary.email || '',
        phone: primary.phone || '',
      });

      setContactImportRows([]);
      setContactImportText('');
      setAlertModal({
        isOpen: true,
        title: 'Contacts imported',
        message: `${cleanedRows.length} contact(s) added to this company CRM record.`,
        variant: 'success',
      });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Import failed',
        message: e.message || 'Could not save contacts.',
        variant: 'error',
      });
    } finally {
      setContactImportBusy(false);
    }
  };

  const createLinkedCrmRecord = async () => {
    if (!profile?.id) return;
    setContactImportBusy(true);
    try {
      const primaryCompanyUser = Array.isArray(profile.company_users) ? profile.company_users[0] : null;
      const payload = {
        name: (profile.company_name || '').trim() || `Company #${profile.id}`,
        status: 'lead',
        linked_company_profile_id: profile.id,
        linked_user_id: primaryCompanyUser?.id || undefined,
        website: profile.website_url || '',
        phone: profile.phone || '',
      };
      const res = await crmAPI.create(payload);
      const createdLead = res.crm_lead;
      if (!createdLead?.id) {
        throw new Error('CRM record was created but no id was returned.');
      }
      const nextLeads = [createdLead, ...companyCrmLeads];
      setCompanyCrmLeads(nextLeads);
      setSelectedCrmLeadId(String(createdLead.id));
      setAlertModal({
        isOpen: true,
        title: 'CRM record created',
        message: 'Linked CRM company record is ready. You can now paste and import contacts.',
        variant: 'success',
      });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not create CRM record',
        message: e.message || 'Please create/link a CRM company record from the CRM page.',
        variant: 'error',
      });
    } finally {
      setContactImportBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-600">{error || 'Company not found'}</p>
          <Link to="/jobs" className="mt-4 inline-block text-blue-600 hover:underline">Back to Jobs</Link>
        </div>
      </div>
    );
  }

  const ratings = profile.ratings_received || [];
  const companyUsers = Array.isArray(profile.company_users) ? profile.company_users : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} emailVariant="simple" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link to="/dashboard" className="text-blue-600 hover:text-blue-800 text-sm">Dashboard</Link>
          <span className="text-gray-400 mx-2">|</span>
          <Link to="/jobs" className="text-blue-600 hover:text-blue-800 text-sm">Jobs</Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-start gap-6">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-300 flex items-center justify-center text-2xl font-bold text-gray-500 shrink-0">
                  {(profile.company_name || 'C')[0].toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile.company_name || 'Company'}
                </h1>
                <div className="mt-2 flex flex-wrap gap-4 text-gray-600">
              {profile.industry && (
                <span className="flex items-center">
                  <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                  {profile.industry}
                </span>
              )}
              {profile.location && (
                <span className="flex items-center">
                  <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  {profile.location}
                </span>
              )}
              {profile.average_rating != null && (
                <span className="inline-flex items-center text-amber-600 font-medium">
                  ★ {Number(profile.average_rating).toFixed(1)} average rating
                </span>
              )}
                </div>
              </div>
            </div>
          </div>

          {profile.bio && (
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">About</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}

          {user?.role === 'admin' && (
            <div className="p-6 border-b border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Company users</h2>
                <button
                  type="button"
                  onClick={() => setCreateUserOpen(true)}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm"
                >
                  Add user
                </button>
              </div>
              {companyUsers.length === 0 ? (
                <p className="text-gray-500">No linked login accounts yet.</p>
              ) : (
                <ul className="space-y-2">
                  {companyUsers.map((member) => (
                    <li key={member.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{member.email}</div>
                        <div className="text-xs text-gray-500">User #{member.id}</div>
                      </div>
                      <Link to={`/admin/users/${member.id}`} className="text-sm text-blue-600 hover:underline">
                        View user
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {user?.role === 'admin' && (
            <div className="p-6 border-b border-gray-200 bg-amber-50/40">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Duplicate / Merge</h2>
              <p className="text-sm text-gray-600 mb-3">
                Choose merge direction: keep this current account, or keep the selected account.
              </p>
              <div className="mb-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="company-merge-direction"
                    checked={mergeDirection === 'into_selected'}
                    onChange={() => setMergeDirection('into_selected')}
                  />
                  Merge current account into selected account (keep selected account data)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="company-merge-direction"
                    checked={mergeDirection === 'into_current'}
                    onChange={() => setMergeDirection('into_current')}
                  />
                  Merge selected account into current account (keep current account data)
                </label>
              </div>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Search company to keep..."
                value={mergeQuery}
                onChange={(e) => {
                  setMergeQuery(e.target.value);
                  setMergeTarget(null);
                }}
              />
              <div className="mt-2 border border-gray-200 rounded-lg bg-white max-h-44 overflow-auto">
                {mergeBusy ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
                ) : mergeOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No matches yet.</div>
                ) : (
                  mergeOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMergeTarget(opt)}
                      className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${
                        Number(mergeTarget?.id) === Number(opt.id) ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.company_name || `Company #${opt.id}`}</div>
                      <div className="text-xs text-gray-500">{opt.company_users_count || 0} login account(s)</div>
                    </button>
                  ))
                )}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={mergeSaving || !mergeTarget}
                  onClick={mergeCompany}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {mergeSaving
                    ? 'Merging…'
                    : mergeDirection === 'into_current'
                      ? 'Merge selected into current company'
                      : 'Merge current into selected company'}
                </button>
              </div>
            </div>
          )}

          {user?.role === 'admin' && (
            <div className="p-6 border-b border-gray-200 bg-indigo-50/40">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Company Contact Loader</h2>
              <p className="text-sm text-gray-600 mb-3">
                Paste contact details for this one company, review, then append contacts to its linked CRM company record.
              </p>
              {companyCrmLeads.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-amber-700">
                    This company is not linked to any CRM company record yet.
                  </p>
                  <button
                    type="button"
                    onClick={createLinkedCrmRecord}
                    disabled={contactImportBusy}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {contactImportBusy ? 'Creating…' : 'Create linked CRM company record'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Target CRM company record</span>
                    <select
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      value={selectedCrmLeadId}
                      onChange={(e) => setSelectedCrmLeadId(e.target.value)}
                    >
                      {companyCrmLeads.map((lead) => (
                        <option key={lead.id} value={String(lead.id)}>
                          {lead.name || `CRM #${lead.id}`} (ID {lead.id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Paste contact rows/text</span>
                    <textarea
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[140px] bg-white"
                      value={contactImportText}
                      onChange={(e) => setContactImportText(e.target.value)}
                      placeholder="Paste contact rows or unstructured contact text here."
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={parseContactImport}
                      disabled={contactImportBusy}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Parse contacts
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContactImportText('');
                        setContactImportRows([]);
                      }}
                      disabled={contactImportBusy}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>

                  {contactImportRows.length > 0 && (
                    <div className="rounded-lg border border-gray-200 bg-white">
                      <div className="px-3 py-2 text-sm font-medium text-gray-900 border-b border-gray-100">
                        Parsed contacts: {contactImportRows.length}
                      </div>
                      <div className="max-h-64 overflow-auto">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-2 py-1 text-left">Name</th>
                              <th className="px-2 py-1 text-left">Email</th>
                              <th className="px-2 py-1 text-left">Phone</th>
                              <th className="px-2 py-1 text-left">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contactImportRows.map((row, idx) => (
                              <tr key={`${idx}-${row.email || row.phone || row.name}`} className="border-t border-gray-100">
                                <td className="px-2 py-1">
                                  <input
                                    className="w-44 border rounded px-1 py-0.5"
                                    value={row.name}
                                    onChange={(e) => updateContactImportRow(idx, 'name', e.target.value)}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <input
                                    className="w-52 border rounded px-1 py-0.5"
                                    value={row.email}
                                    onChange={(e) => updateContactImportRow(idx, 'email', e.target.value)}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <input
                                    className="w-40 border rounded px-1 py-0.5"
                                    value={row.phone}
                                    onChange={(e) => updateContactImportRow(idx, 'phone', e.target.value)}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <button type="button" onClick={() => removeContactImportRow(idx)} className="text-red-700 hover:underline">
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={saveImportedContacts}
                          disabled={contactImportBusy}
                          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {contactImportBusy ? 'Saving…' : 'Save contacts to company CRM record'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Reviews from Technicians</h2>
            {ratings.length === 0 ? (
              <p className="text-gray-500">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {ratings.map((r) => (
                  <div key={r.id} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <span className="text-sm text-gray-500">
                        Technician review
                        {r.job_id && (
                          <Link to={`/jobs/${r.job_id}`} className="ml-2 text-blue-600 hover:underline">
                            (Job #{r.job_id})
                          </Link>
                        )}
                      </span>
                      <span className="inline-flex items-center text-amber-600 font-medium">
                        ★ {r.score != null ? Number(r.score).toFixed(1) : '—'} overall
                      </span>
                    </div>
                    {r.category_scores && Object.keys(r.category_scores || {}).length > 0 && r.category_labels && (
                      <div className="space-y-1 mb-2 text-sm">
                        {Object.entries(r.category_scores).map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span className="text-gray-600">{r.category_labels[k] || k}</span>
                            <span className="text-amber-600 font-medium">{v}/5 ★</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.comment && <p className="text-gray-700 text-sm mt-2">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {user?.role === 'admin' && profile?.id != null && (
        <AdminCreateUserModal
          isOpen={createUserOpen}
          onClose={() => setCreateUserOpen(false)}
          presetCompanyProfile={{
            id: profile.id,
            company_name: profile.company_name,
            company_users_count: companyUsers.length,
          }}
          onCompleted={async () => {
            await refreshCompanyProfile();
            setAlertModal({
              isOpen: true,
              title: 'Done',
              message: 'Company users were updated.',
              variant: 'success',
            });
          }}
          onError={(message) =>
            setAlertModal({
              isOpen: true,
              title: 'Something went wrong',
              message: message || 'Request failed',
              variant: 'error',
            })
          }
        />
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((m) => ({ ...m, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
};

export default CompanyProfilePage;
