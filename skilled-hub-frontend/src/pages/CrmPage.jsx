import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { crmAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import {
  FaBuilding,
  FaChartLine,
  FaComments,
  FaCommentDots,
  FaBriefcase,
  FaDollarSign,
  FaLink,
  FaPlus,
  FaSearch,
  FaTimes,
  FaTrash,
  FaUserPlus,
  FaFileUpload,
} from 'react-icons/fa';

const CRM_STATUSES = [
  'lead',
  'contacted',
  'qualified',
  'proposal',
  'prospect',
  'customer',
  'competitor',
  'churned',
  'lost',
];

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

const CRM_IMPORT_HEADERS = ['name', 'contact_name', 'email', 'phone', 'website', 'company_types', 'status', 'notes'];

const parseCsv = (text) => {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      current = '';
      continue;
    }
    current += ch;
  }
  row.push(current);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
};

const formatCurrency = (cents) => {
  if (cents == null || cents === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

const CrmPage = ({ user, onLogout }) => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchTimer = useRef(null);
  const companySearchTimer = useRef(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'error' });
  const [pipelineNameFilter, setPipelineNameFilter] = useState('');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  const [provision, setProvision] = useState({
    email: '',
    first_name: '',
    last_name: '',
    company_name: '',
    phone: '',
    industry: '',
    location: '',
    bio: '',
  });
  const [provisionSaving, setProvisionSaving] = useState(false);
  const [provisionModalOpen, setProvisionModalOpen] = useState(false);
  const [newCompanyModalOpen, setNewCompanyModalOpen] = useState(false);
  const [provisionMode, setProvisionMode] = useState('new');
  const [companySearchQ, setCompanySearchQ] = useState('');
  const [companyHits, setCompanyHits] = useState([]);
  const [companySearchBusy, setCompanySearchBusy] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crmAPI.list();
      setLeads(res.crm_leads || []);
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not load CRM',
        message: e.message || 'Failed to load records',
        variant: 'error',
      });
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await crmAPI.get(id);
      setDetail(res);
      const c = res.crm_lead;
      setForm({
        name: c.name || '',
        contact_name: c.contact_name || '',
        email: c.email || '',
        phone: c.phone || '',
        website: c.website || '',
        company_types: c.company_types || [],
        status: c.status || 'lead',
        notes: c.notes || '',
        linked_user_id: c.linked_user_id ?? null,
        linked_company_profile_id: c.linked_company_profile_id ?? null,
      });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not load record',
        message: e.message || 'Failed to load',
        variant: 'error',
      });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCreating) {
      setDetail(null);
      setForm({
        name: '',
        contact_name: '',
        email: '',
        phone: '',
        website: '',
        company_types: [],
        status: 'lead',
        notes: '',
        linked_user_id: null,
        linked_company_profile_id: null,
      });
      return;
    }
    if (selectedId) loadDetail(selectedId);
    else {
      setDetail(null);
      setForm({});
    }
  }, [selectedId, isCreating, loadDetail]);

  useEffect(() => {
    if (companySearchTimer.current) clearTimeout(companySearchTimer.current);
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    companySearchTimer.current = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const res = await crmAPI.searchCompanyAccounts(q);
        setSearchHits(res.users || []);
      } catch {
        setSearchHits([]);
      } finally {
        setSearchBusy(false);
      }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQ]);

  useEffect(() => {
    if (!provisionModalOpen) return undefined;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = companySearchQ.trim();
    if (provisionMode !== 'existing' || q.length < 2) {
      setCompanyHits([]);
      return undefined;
    }
    searchTimer.current = setTimeout(async () => {
      setCompanySearchBusy(true);
      try {
        const res = await crmAPI.searchCompanies(q);
        setCompanyHits(res.companies || []);
      } catch {
        setCompanyHits([]);
      } finally {
        setCompanySearchBusy(false);
      }
    }, 300);
    return () => clearTimeout(companySearchTimer.current);
  }, [companySearchQ, provisionMode, provisionModalOpen]);

  useEffect(() => {
    const modalOpen = provisionModalOpen || newCompanyModalOpen;
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (provisionModalOpen && !provisionSaving) setProvisionModalOpen(false);
      if (newCompanyModalOpen && !saving) {
        setNewCompanyModalOpen(false);
        setIsCreating(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [provisionModalOpen, newCompanyModalOpen, provisionSaving, saving]);

  const openCreate = () => {
    setProvisionModalOpen(false);
    setSelectedId(null);
    setIsCreating(true);
    setNewCompanyModalOpen(true);
    setSearchQ('');
    setSearchHits([]);
  };

  const selectLead = (id) => {
    setIsCreating(false);
    setNewCompanyModalOpen(false);
    setSelectedId(id);
    setSearchQ('');
    setSearchHits([]);
  };

  const saveRecord = async () => {
    const payload = {
      name: form.name?.trim(),
      contact_name: form.contact_name?.trim() || undefined,
      email: form.email?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      website: form.website?.trim() || undefined,
      company_types: form.company_types || [],
      status: form.status || 'lead',
      notes: form.notes || undefined,
      linked_user_id: form.linked_user_id ?? null,
      linked_company_profile_id: form.linked_company_profile_id ?? null,
    };
    if (!payload.name) {
      setAlertModal({
        isOpen: true,
        title: 'Name required',
        message: 'Enter a company or account name.',
        variant: 'error',
      });
      return;
    }
    setSaving(true);
    try {
      if (isCreating) {
        const res = await crmAPI.create(payload);
        await loadList();
        setIsCreating(false);
        setNewCompanyModalOpen(false);
        setSelectedId(res.crm_lead.id);
        setDetail(res);
      } else if (selectedId) {
        const res = await crmAPI.update(selectedId, payload);
        setDetail(res);
        await loadList();
      }
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Save failed',
        message: e.message || 'Could not save',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const provisionCompanyAccount = async (e) => {
    e.preventDefault();
    const email = provision.email?.trim();
    const firstName = provision.first_name?.trim();
    const lastName = provision.last_name?.trim();
    const phone = provision.phone?.trim();
    if (!email) {
      setAlertModal({
        isOpen: true,
        title: 'Email required',
        message: 'Enter the company login email.',
        variant: 'error',
      });
      return;
    }
    if (!firstName || !lastName) {
      setAlertModal({
        isOpen: true,
        title: 'Name required',
        message: 'First name and last name are required.',
        variant: 'error',
      });
      return;
    }
    if (!phone) {
      setAlertModal({
        isOpen: true,
        title: 'Phone required',
        message: 'Phone number is required.',
        variant: 'error',
      });
      return;
    }
    if (provisionMode === 'new' && (!provision.company_name?.trim() || !provision.phone?.trim() || !provision.bio?.trim())) {
      setAlertModal({
        isOpen: true,
        title: 'Missing required fields',
        message: 'Company name, phone number, and bio are required.',
        variant: 'error',
      });
      return;
    }
    if (provisionMode === 'existing' && !selectedCompany?.id) {
      setAlertModal({
        isOpen: true,
        title: 'Company required',
        message: 'Select an existing company first.',
        variant: 'error',
      });
      return;
    }
    setProvisionSaving(true);
    try {
      const payload = {
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
      };
      if (provisionMode === 'existing') {
        payload.company_profile_id = selectedCompany.id;
      } else {
        payload.company_name = provision.company_name.trim();
        payload.industry = provision.industry?.trim() || undefined;
        payload.location = provision.location?.trim() || undefined;
        payload.bio = provision.bio.trim();
      }
      await crmAPI.createCompanyAccount(payload);
      setProvision({ email: '', first_name: '', last_name: '', company_name: '', phone: '', industry: '', location: '', bio: '' });
      setProvisionMode('new');
      setCompanySearchQ('');
      setCompanyHits([]);
      setSelectedCompany(null);
      setProvisionModalOpen(false);
      setAlertModal({
        isOpen: true,
        title: 'Company account created',
        message:
          'Company account created successfully.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Could not create account',
        message: err.message || 'Request failed',
        variant: 'error',
      });
    } finally {
      setProvisionSaving(false);
    }
  };

  const removeRecord = async () => {
    if (!selectedId) return;
    if (!window.confirm('Delete this CRM record? This does not delete the linked platform account.')) return;
    try {
      await crmAPI.remove(selectedId);
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Delete failed',
        message: e.message || 'Could not delete',
        variant: 'error',
      });
    }
  };

  const toggleCompanyType = (type) => {
    setForm((f) => {
      const selected = f.company_types || [];
      const next = selected.includes(type) ? selected.filter((t) => t !== type) : [...selected, type];
      return { ...f, company_types: next };
    });
  };

  const importCsvFile = async (file) => {
    if (!file) return;
    const content = await file.text();
    const parsed = parseCsv(content);
    if (parsed.length < 2) {
      setAlertModal({
        isOpen: true,
        title: 'Import failed',
        message: 'CSV needs a header row plus at least one data row.',
        variant: 'error',
      });
      return;
    }

    const headers = parsed[0].map((h) => h.trim().toLowerCase());
    const missing = CRM_IMPORT_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      setAlertModal({
        isOpen: true,
        title: 'Import failed',
        message: `Missing required columns: ${missing.join(', ')}`,
        variant: 'error',
      });
      return;
    }

    const rows = parsed
      .slice(1)
      .map((cells) => {
        const rowObj = {};
        headers.forEach((header, idx) => {
          rowObj[header] = (cells[idx] || '').trim();
        });
        return rowObj;
      })
      .filter((rowObj) => rowObj.name);

    if (rows.length === 0) {
      setAlertModal({
        isOpen: true,
        title: 'Import failed',
        message: 'No valid rows found. Ensure each row has a company name.',
        variant: 'error',
      });
      return;
    }

    setImportBusy(true);
    try {
      const res = await crmAPI.importRows(rows);
      setImportSummary({
        importedCount: res.imported_count || 0,
        failedCount: res.failed_count || 0,
        errors: res.errors || [],
      });
      await loadList();
      setAlertModal({
        isOpen: true,
        title: 'Import completed',
        message: `Imported ${res.imported_count || 0} rows. Failed ${res.failed_count || 0}.`,
        variant: (res.failed_count || 0) > 0 ? 'error' : 'success',
      });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Import failed',
        message: e.message || 'Could not import CSV',
        variant: 'error',
      });
    } finally {
      setImportBusy(false);
    }
  };

  const c = detail?.crm_lead;
  const metrics = detail?.linked_metrics;
  const activity = detail?.activity;
  const recentJobs = detail?.recent_jobs || [];
  const filteredLeads = leads.filter((row) => {
    const nameOk =
      pipelineNameFilter.trim() === '' || (row.name || '').toLowerCase().includes(pipelineNameFilter.trim().toLowerCase());
    const statusOk = pipelineStatusFilter.trim() === '' || (row.status || '').toLowerCase() === pipelineStatusFilter.trim().toLowerCase();
    return nameOk && statusOk;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="crm" emailVariant="crm" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">Company CRM</h1>
            <p className="text-sm text-gray-500 mt-1">
              Track prospects and link records to company accounts for jobs, spend, and activity.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setImportSummary(null);
                setImportModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 shadow-sm"
            >
              <FaFileUpload className="w-4 h-4" aria-hidden />
              Import CSV
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm"
            >
              <FaPlus className="w-4 h-4" aria-hidden />
              Add company
            </button>
            <button
              type="button"
              onClick={() => {
                setNewCompanyModalOpen(false);
                setIsCreating(false);
                setProvisionMode('new');
                setCompanySearchQ('');
                setCompanyHits([]);
                setSelectedCompany(null);
                setProvisionModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm"
            >
              <FaUserPlus className="w-4 h-4" aria-hidden />
              Create platform account
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Pipeline</h2>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <input
                  type="search"
                  value={pipelineNameFilter}
                  onChange={(e) => setPipelineNameFilter(e.target.value)}
                  placeholder="Filter prospect/company name"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                />
                <select
                  value={pipelineStatusFilter}
                  onChange={(e) => setPipelineStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white capitalize"
                >
                  <option value="">All statuses</option>
                  {CRM_STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loading ? (
                <p className="p-6 text-gray-500 text-sm">Loading…</p>
              ) : filteredLeads.length === 0 ? (
                <p className="p-6 text-gray-500 text-sm">No companies yet. Click &quot;Add company&quot; to start.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredLeads.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => selectLead(row.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-blue-50/60 transition-colors ${
                          selectedId === row.id && !isCreating ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'
                        }`}
                      >
                        <div className="font-medium text-gray-900">{row.name}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                          <span className="capitalize px-2 py-0.5 rounded bg-gray-100 text-gray-700">{row.status}</span>
                          {row.linked_account && (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <FaLink className="text-emerald-600" /> Linked
                            </span>
                          )}
                          {row.email && <span>{row.email}</span>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            {!selectedId && (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500">
                Select a company on the left or use the buttons above to add a CRM record or create a platform account.
              </div>
            )}

            {selectedId && !isCreating && (
              <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit record</h2>
                {detailLoading && (
                  <p className="text-sm text-gray-500 mb-4">Loading details…</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company name *</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Contact</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.contact_name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                    <select
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize"
                      value={form.status ?? 'lead'}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      {CRM_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Email</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      type="email"
                      value={form.email ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Phone</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.phone ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Website</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.website ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    />
                  </label>
                  <div className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company types</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CRM_COMPANY_TYPES.map((type) => {
                        const active = (form.company_types || []).includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => toggleCompanyType(type)}
                            className={`px-2.5 py-1 rounded-full border text-xs capitalize ${
                              active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                            }`}
                          >
                            {type.replace(/_/g, ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Notes</span>
                    <textarea
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[88px]"
                      value={form.notes ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <FaBuilding className="text-amber-600" /> Link platform account
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Search by company login email, then select the account. Only company accounts can be linked. One CRM
                    record links to a company, which can have multiple logins.
                  </p>
                  <div className="relative">
                    <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                      <FaSearch className="text-gray-400 shrink-0" />
                      <input
                        className="flex-1 text-sm outline-none"
                        placeholder="Type at least 2 characters of email…"
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                      />
                      {searchBusy && <span className="text-xs text-gray-400">Searching…</span>}
                    </div>
                    {searchHits.length > 0 && (
                      <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                        {searchHits.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-gray-50"
                              onClick={() => {
                                setForm((f) => ({ ...f, linked_user_id: u.id, linked_company_profile_id: u.company_profile_id ?? null }));
                                setSearchQ('');
                                setSearchHits([]);
                              }}
                            >
                              <span className="font-medium text-gray-900">{u.email}</span>
                              {u.company_name && <span className="text-gray-500"> — {u.company_name}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {form.linked_user_id != null && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-emerald-700 font-medium">
                        Linked company user id {form.linked_user_id}
                        {c?.linked_account?.email && ` (${c.linked_account.email})`}
                        {c?.linked_account?.company_user_count ? ` - ${c.linked_account.company_user_count} company users` : ''}
                      </span>
                      <button
                        type="button"
                        className="text-red-600 hover:underline inline-flex items-center gap-1"
                        onClick={() => setForm((f) => ({ ...f, linked_user_id: null, linked_company_profile_id: null }))}
                      >
                        Unlink
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveRecord}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={removeRecord}
                    className="px-5 py-2 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 font-medium inline-flex items-center gap-2"
                  >
                    <FaTrash /> Delete record
                  </button>
                </div>
              </div>
            )}

            {!isCreating && selectedId && c?.linked_account && metrics && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <FaChartLine className="text-blue-600" /> Account metrics
                  </h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Same aggregates as the company dashboard for{' '}
                    {c.linked_account.company_profile_id ? (
                      <Link
                        to={`/companies/${c.linked_account.company_profile_id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {c.linked_account.company_name || c.linked_account.email}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-800">{c.linked_account.company_name || c.linked_account.email}</span>
                    )}
                    .
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                      <div className="text-xs text-emerald-800 font-medium flex items-center gap-1">
                        <FaDollarSign /> Total spent (finished jobs)
                      </div>
                      <div className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(metrics.total_spent_cents)}</div>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-4">
                      <div className="text-xs text-gray-500 font-medium">Jobs posted</div>
                      <div className="text-xl font-bold text-gray-900 mt-1">{metrics.jobs_posted ?? 0}</div>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-4">
                      <div className="text-xs text-gray-500 font-medium">Completed</div>
                      <div className="text-xl font-bold text-gray-900 mt-1">{metrics.jobs_completed ?? 0}</div>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-4">
                      <div className="text-xs text-gray-500 font-medium">Open</div>
                      <div className="text-xl font-bold text-gray-900 mt-1">{metrics.jobs_open ?? 0}</div>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-4">
                      <div className="text-xs text-gray-500 font-medium">Active</div>
                      <div className="text-xl font-bold text-gray-900 mt-1">{metrics.jobs_active ?? 0}</div>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-4">
                      <div className="text-xs text-gray-500 font-medium">Technicians hired</div>
                      <div className="text-xl font-bold text-gray-900 mt-1">{metrics.unique_technicians_hired ?? 0}</div>
                    </div>
                  </div>
                </div>

                {activity && (
                  <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <FaComments className="text-indigo-600" /> Activity
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-700">
                        <FaCommentDots className="text-orange-500" />
                        <span>Feedback submissions: {activity.feedback_submissions_count}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <FaComments className="text-indigo-500" />
                        <span>Conversations: {activity.conversations_count}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <FaComments className="text-teal-600" />
                        <span>Messages: {activity.messages_count}</span>
                      </div>
                    </div>
                  </div>
                )}

                {recentJobs.length > 0 && (
                  <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                      <FaBriefcase className="text-blue-600" />
                      <h2 className="text-lg font-semibold text-gray-900">Recent jobs</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                          <tr>
                            <th className="px-4 py-2">Title</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Created</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {recentJobs.map((j) => (
                            <tr key={j.id}>
                              <td className="px-4 py-2 font-medium text-gray-900">{j.title}</td>
                              <td className="px-4 py-2 capitalize text-gray-600">{j.status}</td>
                              <td className="px-4 py-2 text-gray-500">
                                {j.created_at ? new Date(j.created_at).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-4 py-2">
                                <Link to={`/jobs/${j.id}`} className="text-blue-600 hover:underline">
                                  View
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {importModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-import-title"
            onClick={() => !importBusy && setImportModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
                <h2 id="crm-import-title" className="text-lg font-semibold text-gray-900">
                  Import CRM companies from CSV
                </h2>
                <button
                  type="button"
                  disabled={importBusy}
                  onClick={() => setImportModalOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label="Close"
                >
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5 space-y-4">
                <p className="text-sm text-gray-600">
                  Build your list in Excel or Google Sheets using this exact header order, then export to CSV and upload.
                </p>
                <code className="block p-3 rounded-lg bg-gray-100 text-xs text-gray-800 break-words">
                  name,contact_name,email,phone,website,company_types,status,notes
                </code>
                <p className="text-xs text-gray-500">
                  Status must be one of: {CRM_STATUSES.join(', ')}. If blank, it defaults to lead.
                </p>
                <p className="text-xs text-gray-500">
                  company_types can include multiple values separated by pipe/comma/semicolon (example:
                  hvac|plumbing|electrical).
                </p>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">CSV file</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={importBusy}
                    className="mt-1 block w-full text-sm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      importCsvFile(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {importSummary && (
                  <div className="rounded-lg border border-gray-200 p-3 text-sm">
                    <p className="font-medium text-gray-900">
                      Imported {importSummary.importedCount}, failed {importSummary.failedCount}.
                    </p>
                    {importSummary.errors.length > 0 && (
                      <ul className="mt-2 text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto">
                        {importSummary.errors.map((err) => (
                          <li key={`${err.row}-${err.name || 'row'}`}>
                            Row {err.row} ({err.name || 'Unnamed'}): {(err.errors || []).join(', ')}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {provisionModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-provision-title"
            onClick={() => !provisionSaving && setProvisionModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
                <h2 id="crm-provision-title" className="text-lg font-semibold text-gray-900">
                  Create platform company account
                </h2>
                <button
                  type="button"
                  disabled={provisionSaving}
                  onClick={() => setProvisionModalOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label="Close"
                >
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                <p className="text-sm text-gray-500 mb-4">
                  Create a login for a new company profile or add another login to an existing company.
                </p>
                <form onSubmit={provisionCompanyAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Account target</span>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setProvisionMode('new');
                          setSelectedCompany(null);
                        }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                          provisionMode === 'new' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700'
                        }`}
                      >
                        New company
                      </button>
                      <button
                        type="button"
                        onClick={() => setProvisionMode('existing')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                          provisionMode === 'existing' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700'
                        }`}
                      >
                        Existing company
                      </button>
                    </div>
                  </div>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Login email *</span>
                    <input
                      type="email"
                      required
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={provision.email}
                      onChange={(e) => setProvision((p) => ({ ...p, email: e.target.value }))}
                      placeholder="contact@theirbusiness.com"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">First name *</span>
                    <input
                      required
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={provision.first_name}
                      onChange={(e) => setProvision((p) => ({ ...p, first_name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Last name *</span>
                    <input
                      required
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={provision.last_name}
                      onChange={(e) => setProvision((p) => ({ ...p, last_name: e.target.value }))}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Phone *</span>
                    <input
                      type="tel"
                      required
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={provision.phone}
                      onChange={(e) => setProvision((p) => ({ ...p, phone: e.target.value }))}
                    />
                  </label>
                  {provisionMode === 'existing' && (
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Find company *</span>
                      <div className="relative mt-1">
                        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                          <FaSearch className="text-gray-400 shrink-0" />
                          <input
                            className="flex-1 text-sm outline-none"
                            placeholder="Search company name..."
                            value={companySearchQ}
                            onChange={(e) => setCompanySearchQ(e.target.value)}
                          />
                          {companySearchBusy && <span className="text-xs text-gray-400">Searching...</span>}
                        </div>
                        {companyHits.length > 0 && (
                          <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                            {companyHits.map((cp) => (
                              <li key={cp.id}>
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                                  onClick={() => {
                                    setSelectedCompany(cp);
                                    setCompanySearchQ(cp.company_name || `Company #${cp.id}`);
                                    setCompanyHits([]);
                                  }}
                                >
                                  <span className="font-medium text-gray-900">{cp.company_name || `Company #${cp.id}`}</span>
                                  <span className="text-gray-500">{` - ${cp.company_users_count || 0} users`}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {selectedCompany && (
                        <p className="mt-2 text-xs text-emerald-700">
                          Selected: {selectedCompany.company_name || `Company #${selectedCompany.id}`}
                        </p>
                      )}
                    </div>
                  )}
                  {provisionMode === 'new' && (
                  <>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company display name *</span>
                    <input
                      required
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={provision.company_name}
                      onChange={(e) => setProvision((p) => ({ ...p, company_name: e.target.value }))}
                      placeholder="Registered business or DBA"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Industry</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={provision.industry}
                      onChange={(e) => setProvision((p) => ({ ...p, industry: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Location</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={provision.location}
                      onChange={(e) => setProvision((p) => ({ ...p, location: e.target.value }))}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Bio *</span>
                    <textarea
                      rows={2}
                      required
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={provision.bio}
                      onChange={(e) => setProvision((p) => ({ ...p, bio: e.target.value }))}
                    />
                  </label>
                  </>
                  )}
                  <div className="sm:col-span-2 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={provisionSaving}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50"
                    >
                      {provisionSaving ? 'Creating…' : 'Create account & send email'}
                    </button>
                    <button
                      type="button"
                      disabled={provisionSaving}
                      onClick={() => setProvisionModalOpen(false)}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : null}

        {newCompanyModalOpen && isCreating ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-new-company-title"
            onClick={() => {
              if (!saving) {
                setNewCompanyModalOpen(false);
                setIsCreating(false);
              }
            }}
          >
            <div
              className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
                <h2 id="crm-new-company-title" className="text-lg font-semibold text-gray-900">
                  New company
                </h2>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setNewCompanyModalOpen(false);
                    setIsCreating(false);
                  }}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label="Close"
                >
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company name *</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Contact</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.contact_name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                    <select
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize"
                      value={form.status ?? 'lead'}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      {CRM_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Email</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      type="email"
                      value={form.email ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Phone</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.phone ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Website</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.website ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    />
                  </label>
                  <div className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company types</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CRM_COMPANY_TYPES.map((type) => {
                        const active = (form.company_types || []).includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => toggleCompanyType(type)}
                            className={`px-2.5 py-1 rounded-full border text-xs capitalize ${
                              active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                            }`}
                          >
                            {type.replace(/_/g, ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Notes</span>
                    <textarea
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[88px]"
                      value={form.notes ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <FaBuilding className="text-amber-600" /> Link platform account
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Search by company login email, then select the account. Only company accounts can be linked. One CRM
                    record links to a company, which can have multiple logins.
                  </p>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                      <FaSearch className="text-gray-400 shrink-0" />
                      <input
                        className="flex-1 text-sm outline-none"
                        placeholder="Type at least 2 characters of email…"
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                      />
                      {searchBusy && <span className="text-xs text-gray-400">Searching…</span>}
                    </div>
                    {searchHits.length > 0 && (
                      <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                        {searchHits.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-gray-50"
                              onClick={() => {
                                setForm((f) => ({ ...f, linked_user_id: u.id, linked_company_profile_id: u.company_profile_id ?? null }));
                                setSearchQ('');
                                setSearchHits([]);
                              }}
                            >
                              <span className="font-medium text-gray-900">{u.email}</span>
                              {u.company_name && <span className="text-gray-500"> — {u.company_name}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {form.linked_user_id != null && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-emerald-700 font-medium">Linked company user id {form.linked_user_id}</span>
                      <button
                        type="button"
                        className="text-red-600 hover:underline inline-flex items-center gap-1"
                        onClick={() => setForm((f) => ({ ...f, linked_user_id: null, linked_company_profile_id: null }))}
                      >
                        Unlink
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveRecord}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setNewCompanyModalOpen(false);
                      setIsCreating(false);
                    }}
                    className="px-5 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
};

export default CrmPage;
