import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { crmAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import { formatPhoneInput } from '../utils/phone';
import {
  buildImportDraftRows,
  autoFixDraftRows as autoFixImportDraftRows,
  makeDraftRow,
  inferSingleImportRowFromUnstructuredText,
} from '../utils/crmImport';
import {
  emptyNoteDraft,
  noteDraftForReply,
  noteDraftForEdit,
  noteWasEdited,
} from '../utils/crmNotes';
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

const CRM_NOTE_CONTACT_METHODS = ['call', 'text', 'email', 'in_person', 'note'];

const formatCurrency = (cents) => {
  if (cents == null || cents === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
};

const normalizeContactEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const name = String(entry.name || '').trim();
  const email = String(entry.email || '').trim();
  const phone = formatPhoneInput(String(entry.phone || '').trim());
  if (!name && !email && !phone) return null;
  return { name, email, phone };
};

const normalizeContactDraftEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return { name: '', email: '', phone: '' };
  return {
    name: String(entry.name || '').trim(),
    email: String(entry.email || '').trim(),
    phone: formatPhoneInput(String(entry.phone || '').trim()),
  };
};

const hasContactValue = (entry) => Boolean(entry?.name || entry?.email || entry?.phone);

const normalizeContacts = (contacts, fallback = null) => {
  const normalized = Array.isArray(contacts)
    ? contacts.map((entry) => normalizeContactEntry(entry)).filter(Boolean)
    : [];
  if (normalized.length > 0) return normalized;
  const fallbackNormalized = normalizeContactEntry(fallback);
  return fallbackNormalized ? [fallbackNormalized] : [];
};

const editableContacts = (contacts, fallback = null) => {
  const normalized = Array.isArray(contacts)
    ? contacts.filter((entry) => entry && typeof entry === 'object').map((entry) => normalizeContactDraftEntry(entry))
    : [];
  if (normalized.length > 0) return normalized;
  const fallbackNormalized = normalizeContactDraftEntry(fallback);
  return hasContactValue(fallbackNormalized) ? [fallbackNormalized] : [];
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
  const [pasteImportText, setPasteImportText] = useState('');
  const [importDraftRows, setImportDraftRows] = useState([]);
  const [importRowFilter, setImportRowFilter] = useState('all');

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
  const [newCompanyHits, setNewCompanyHits] = useState([]);
  const [newCompanySearchBusy, setNewCompanySearchBusy] = useState(false);
  const [crmNotes, setCrmNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState(emptyNoteDraft());
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [isRecordEditing, setIsRecordEditing] = useState(false);
  const [profileImportOpen, setProfileImportOpen] = useState(false);
  const [profileImportText, setProfileImportText] = useState('');
  const pendingAdditionalContactFocusIdx = useRef(null);

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
      setCrmNotes(res.crm_notes || []);
      const c = res.crm_lead;
      const contacts = normalizeContacts(c.contacts, {
        name: c.contact_name || '',
        email: c.email || '',
        phone: c.phone || '',
      });
      const primaryContact = contacts[0] || { name: '', email: '', phone: '' };
      setForm({
        name: c.name || '',
        contact_name: primaryContact.name || '',
        email: primaryContact.email || '',
        phone: primaryContact.phone || '',
        contacts,
        website: c.website || '',
        street_address: c.street_address || '',
        city: c.city || '',
        state: c.state || '',
        zip: c.zip || '',
        instagram_url: c.instagram_url || '',
        facebook_url: c.facebook_url || '',
        linkedin_url: c.linkedin_url || '',
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
      setCrmNotes([]);
      setForm({
        name: '',
        contact_name: '',
        email: '',
        phone: '',
        contacts: [],
        website: '',
        street_address: '',
        city: '',
        state: '',
        zip: '',
        instagram_url: '',
        facebook_url: '',
        linkedin_url: '',
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
      setCrmNotes([]);
    }
  }, [selectedId, isCreating, loadDetail]);

  useEffect(() => {
    resetNoteDraft();
    setNoteComposerOpen(false);
  }, [selectedId, isCreating]);

  useEffect(() => {
    if (!isCreating) setIsRecordEditing(false);
  }, [selectedId, isCreating]);

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
    if (!provisionModalOpen || provisionMode !== 'new') return undefined;
    const q = provision.company_name?.trim() || '';
    if (q.length < 2) {
      setNewCompanyHits([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setNewCompanySearchBusy(true);
      try {
        const res = await crmAPI.searchCompanies(q);
        if (!cancelled) setNewCompanyHits(res.companies || []);
      } catch {
        if (!cancelled) setNewCompanyHits([]);
      } finally {
        if (!cancelled) setNewCompanySearchBusy(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [provision.company_name, provisionMode, provisionModalOpen]);

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
    setProfileImportOpen(false);
    setSelectedId(null);
    setIsCreating(true);
    setNewCompanyModalOpen(true);
    setSearchQ('');
    setSearchHits([]);
  };

  const selectLead = (id) => {
    setIsCreating(false);
    setNewCompanyModalOpen(false);
    setProfileImportOpen(false);
    setSelectedId(id);
    setSearchQ('');
    setSearchHits([]);
  };

  const saveRecord = async () => {
    const normalizedContacts = normalizeContacts(form.contacts, {
      name: form.contact_name || '',
      email: form.email || '',
      phone: form.phone || '',
    });
    const primaryContact = normalizedContacts[0] || {};
    const payload = {
      name: form.name?.trim(),
      contact_name: (primaryContact.name || form.contact_name || '').trim() || undefined,
      email: (primaryContact.email || form.email || '').trim() || undefined,
      phone: formatPhoneInput((primaryContact.phone || form.phone || '').trim()) || undefined,
      contacts: normalizedContacts,
      website: form.website?.trim() || undefined,
      street_address: form.street_address?.trim() || undefined,
      city: form.city?.trim() || undefined,
      state: form.state?.trim() || undefined,
      zip: form.zip?.trim() || undefined,
      instagram_url: form.instagram_url?.trim() || undefined,
      facebook_url: form.facebook_url?.trim() || undefined,
      linkedin_url: form.linkedin_url?.trim() || undefined,
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
        setIsRecordEditing(false);
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

  const applyProfileImportFromText = () => {
    if (!profileImportText.trim()) {
      setAlertModal({
        isOpen: true,
        title: 'Nothing to import',
        message: 'Paste company/contact details first.',
        variant: 'error',
      });
      return;
    }

    const inferred = inferSingleImportRowFromUnstructuredText(
      profileImportText,
      CRM_STATUSES,
      CRM_COMPANY_TYPES,
      { includeDiagnostics: true },
    );
    const draft = buildImportDraftRows(profileImportText, CRM_STATUSES, CRM_COMPANY_TYPES);
    if (!draft.length) {
      setAlertModal({
        isOpen: true,
        title: 'Could not map details',
        message: 'Try adding at least a company name, email, website, or phone.',
        variant: 'error',
      });
      return;
    }

    const row = draft[0];
    setForm((f) => {
      const existingContacts = normalizeContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
      });
      const importedPrimary = normalizeContactEntry({
        name: row.contact_name,
        email: row.email,
        phone: row.phone,
      });
      const mergedContacts = importedPrimary
        ? [importedPrimary, ...existingContacts.slice(1)]
        : existingContacts;
      return {
        ...f,
        name: row.name || f.name || '',
        contact_name: importedPrimary?.name || f.contact_name || '',
        email: importedPrimary?.email || f.email || '',
        phone: importedPrimary?.phone || f.phone || '',
        website: row.website || f.website || '',
        company_types: row.company_types
          ? Array.from(new Set([...(f.company_types || []), ...row.company_types.split(/[,|;]/).map((t) => t.trim()).filter(Boolean)]))
          : (f.company_types || []),
        status: row.status || f.status || 'lead',
        notes: [f.notes, row.notes].filter(Boolean).join('\n').trim(),
        contacts: mergedContacts,
      };
    });
    setProfileImportOpen(false);
    setProfileImportText('');
    if (!isRecordEditing) setIsRecordEditing(true);

    const warnings = inferred?.diagnostics?.warnings || [];
    if (warnings.length > 0) {
      setAlertModal({
        isOpen: true,
        title: 'Imported with review suggestions',
        message: `${warnings.join('. ')}.`,
        variant: inferred?.diagnostics?.confidence === 'low' ? 'error' : 'success',
      });
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
      setNewCompanyHits([]);
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

  const updatePrimaryContactField = (field, value) => {
    setForm((f) => {
      const contacts = editableContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
      });
      const first = contacts[0] || { name: '', email: '', phone: '' };
      const formattedValue = field === 'phone' ? formatPhoneInput(value) : value;
      const nextContacts = [{ ...first, [field]: formattedValue }, ...contacts.slice(1)];
      return {
        ...f,
        contacts: nextContacts,
        contact_name: field === 'name' ? formattedValue : f.contact_name,
        email: field === 'email' ? formattedValue : f.email,
        phone: field === 'phone' ? formattedValue : f.phone,
      };
    });
  };

  const addAdditionalContact = () => {
    setForm((f) => {
      const contacts = editableContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
      });
      const baseContacts = contacts.length > 0 ? contacts : [{ name: '', email: '', phone: '' }];
      pendingAdditionalContactFocusIdx.current = baseContacts.length;
      return { ...f, contacts: [...baseContacts, { name: '', email: '', phone: '' }] };
    });
  };

  const focusAdditionalContactNameInput = (contactIdx) => (node) => {
    if (!node) return;
    if (pendingAdditionalContactFocusIdx.current !== contactIdx) return;
    node.focus();
    pendingAdditionalContactFocusIdx.current = null;
  };

  const updateAdditionalContactField = (contactIdx, field, value) => {
    setForm((f) => {
      const contacts = editableContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
      });
      if (contactIdx <= 0 || contactIdx >= contacts.length) return f;
      const formattedValue = field === 'phone' ? formatPhoneInput(value) : value;
      const nextContacts = contacts.map((contact, idx) =>
        idx === contactIdx ? { ...contact, [field]: formattedValue } : contact,
      );
      return { ...f, contacts: nextContacts };
    });
  };

  const removeAdditionalContact = (contactIdx) => {
    setForm((f) => {
      const contacts = editableContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
      });
      if (contactIdx <= 0 || contactIdx >= contacts.length) return f;
      return { ...f, contacts: contacts.filter((_, idx) => idx !== contactIdx) };
    });
  };

  const normalizeMatchValue = (value) => String(value || '').trim().toLowerCase();

  const normalizePhoneMatch = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  const normalizeWebsiteMatch = (value) => {
    const normalized = normalizeMatchValue(value);
    if (!normalized) return '';
    return normalized.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  };

  const buildRowSignatures = (row) => {
    const signatures = [];
    const name = normalizeMatchValue(row.name);
    const email = normalizeMatchValue(row.email);
    const phone = normalizePhoneMatch(row.phone);
    const website = normalizeWebsiteMatch(row.website);
    if (name) signatures.push({ key: `name:${name}`, label: 'name' });
    if (email) signatures.push({ key: `email:${email}`, label: 'email' });
    if (phone) signatures.push({ key: `phone:${phone}`, label: 'phone' });
    if (website) signatures.push({ key: `website:${website}`, label: 'website' });
    return signatures;
  };

  const withDuplicateMetadata = useCallback((rows) => {
    if (!rows.length) return [];

    const crmSignatureMap = new Map();
    leads.forEach((lead) => {
      buildRowSignatures(lead).forEach((sig) => {
        const entries = crmSignatureMap.get(sig.key) || [];
        entries.push(sig.label);
        crmSignatureMap.set(sig.key, entries);
      });
    });

    const batchSignatureMap = new Map();
    rows.forEach((row, idx) => {
      buildRowSignatures(row).forEach((sig) => {
        const entries = batchSignatureMap.get(sig.key) || [];
        entries.push(idx);
        batchSignatureMap.set(sig.key, entries);
      });
    });

    return rows.map((row) => {
      const duplicateReasons = [];
      buildRowSignatures(row).forEach((sig) => {
        const batchHits = batchSignatureMap.get(sig.key) || [];
        if (batchHits.length > 1) {
          duplicateReasons.push(`Duplicate ${sig.label} in this import list`);
        }
        if (crmSignatureMap.has(sig.key)) {
          duplicateReasons.push(`Matches existing CRM record by ${sig.label}`);
        }
      });

      const isDuplicate = duplicateReasons.length > 0;
      return {
        ...row,
        _isDuplicate: isDuplicate,
        _duplicateReasons: [...new Set(duplicateReasons)],
        _duplicateVerified: isDuplicate ? Boolean(row._duplicateVerified) : false,
      };
    });
  }, [leads]);

  const setImportRowsWithDuplicateMetadata = useCallback(
    (nextRowsOrUpdater) => {
      setImportDraftRows((prevRows) => {
        const nextRows = typeof nextRowsOrUpdater === 'function' ? nextRowsOrUpdater(prevRows) : nextRowsOrUpdater;
        return withDuplicateMetadata(nextRows);
      });
    },
    [withDuplicateMetadata],
  );

  useEffect(() => {
    setImportDraftRows((rows) => withDuplicateMetadata(rows));
  }, [withDuplicateMetadata]);

  const summarizeDuplicateBreakdown = (rows) => {
    return rows.reduce(
      (acc, row) => {
        const reasons = row._duplicateReasons || [];
        if (reasons.some((reason) => reason.includes('in this import list'))) acc.withinList += 1;
        if (reasons.some((reason) => reason.includes('existing CRM record'))) acc.inCrm += 1;
        return acc;
      },
      { withinList: 0, inCrm: 0 },
    );
  };

  const draftDuplicateStats = summarizeDuplicateBreakdown(importDraftRows);

  const importRows = async (rows, duplicateStats = { withinList: 0, inCrm: 0 }) => {
    if (!rows.length) {
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
        importedLeadIds: (res.crm_leads || []).map((lead) => lead.id).filter(Boolean),
      });
      await loadList();
      setAlertModal({
        isOpen: true,
        title: 'Import completed',
        message:
          `${res.imported_count || 0} successes. ${res.failed_count || 0} failures. ` +
          `${duplicateStats.withinList}:${duplicateStats.inCrm} duplicates (list:crm).`,
        variant: (res.failed_count || 0) > 0 ? 'error' : 'success',
      });
      return res;
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Import failed',
        message: e.message || 'Could not import CSV',
        variant: 'error',
      });
      return null;
    } finally {
      setImportBusy(false);
    }
  };

  const parseCsvTextToDraft = (content) => {
    return buildImportDraftRows(content, CRM_STATUSES, CRM_COMPANY_TYPES);
  };

  const importCsvFile = async (file) => {
    if (!file) return;
    const content = await file.text();
    const draft = parseCsvTextToDraft(content);
    if (!draft.length) {
      setAlertModal({
        isOpen: true,
        title: 'Import failed',
        message: 'Could not parse rows from this file.',
        variant: 'error',
      });
      return;
    }
    setImportRowsWithDuplicateMetadata(draft);
    setImportSummary(null);
  };

  const parsePastedData = async () => {
    if (!pasteImportText.trim()) {
      setAlertModal({
        isOpen: true,
        title: 'Nothing to import',
        message: 'Paste CSV-like rows first.',
        variant: 'error',
      });
      return;
    }
    const draft = parseCsvTextToDraft(pasteImportText);
    if (!draft.length) {
      setAlertModal({
        isOpen: true,
        title: 'Import failed',
        message: 'Could not parse rows from pasted text.',
        variant: 'error',
      });
      return;
    }
    setImportRowsWithDuplicateMetadata(draft);
    setImportSummary(null);
  };

  const updateDraftRow = (idx, key, value) => {
    setImportRowsWithDuplicateMetadata((rows) =>
      rows.map((row, i) => {
        if (i !== idx) return row;
        const updated = makeDraftRow({ ...row, [key]: value }, row._rowNum - 1, CRM_STATUSES, CRM_COMPANY_TYPES);
        return { ...updated, _rowNum: row._rowNum, _duplicateVerified: row._duplicateVerified };
      }),
    );
  };

  const splitContactName = (fullName) => {
    const tokens = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { firstName: '', lastName: '' };
    if (tokens.length === 1) return { firstName: tokens[0], lastName: '' };
    return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') };
  };

  const updateDraftContactNamePart = (idx, part, value) => {
    setImportRowsWithDuplicateMetadata((rows) =>
      rows.map((row, i) => {
        if (i !== idx) return row;
        const current = splitContactName(row.contact_name);
        const next = {
          ...current,
          [part]: value,
        };
        const contactName = [next.firstName, next.lastName].filter(Boolean).join(' ').trim();
        const updated = makeDraftRow({ ...row, contact_name: contactName }, row._rowNum - 1, CRM_STATUSES, CRM_COMPANY_TYPES);
        return { ...updated, _rowNum: row._rowNum, _duplicateVerified: row._duplicateVerified };
      }),
    );
  };

  const removeDraftRow = (idx) => {
    setImportRowsWithDuplicateMetadata((rows) => rows.filter((_, i) => i !== idx));
  };

  const autoFixDraftRows = () => {
    setImportRowsWithDuplicateMetadata((rows) => autoFixImportDraftRows(rows, CRM_STATUSES, CRM_COMPANY_TYPES));
  };

  const importCleanedRows = async () => {
    if (!importDraftRows.length) {
      setAlertModal({
        isOpen: true,
        title: 'No rows to import',
        message: 'Parse pasted text or upload a file first.',
        variant: 'error',
      });
      return;
    }

    const errorCount = importDraftRows.reduce((sum, r) => sum + (r._errors?.length || 0), 0);
    if (errorCount > 0) {
      setAlertModal({
        isOpen: true,
        title: 'Fix data first',
        message: `There are ${errorCount} data issues in preview rows. Use auto-fix or edit rows before import.`,
        variant: 'error',
      });
      return;
    }

    const unverifiedDuplicateCount = importDraftRows.filter((r) => r._isDuplicate && !r._duplicateVerified).length;
    if (unverifiedDuplicateCount > 0) {
      setAlertModal({
        isOpen: true,
        title: 'Review duplicate rows first',
        message:
          `${unverifiedDuplicateCount} duplicate row(s) still need verification. Verify in-line or filter to "Unverified duplicates" and review those rows first.`,
        variant: 'error',
      });
      return;
    }

    const submitRows = [];
    const submitDraftRows = [];
    const submitDraftIndexes = [];
    importDraftRows.forEach((row, draftIdx) => {
      if (!row.name) return;
      submitDraftRows.push(row);
      const payload = { ...row };
      delete payload._errors;
      delete payload._rowNum;
      delete payload._isDuplicate;
      delete payload._duplicateReasons;
      delete payload._duplicateVerified;
      submitRows.push(payload);
      submitDraftIndexes.push(draftIdx);
    });

    const duplicateStats = summarizeDuplicateBreakdown(submitDraftRows);
    const result = await importRows(submitRows, duplicateStats);
    if (!result) return;

    if ((result.failed_count || 0) === 0) {
      setImportRowsWithDuplicateMetadata([]);
      setPasteImportText('');
      return;
    }

    const failedRowNumbers = new Set((result.errors || []).map((err) => Number(err.row)).filter((n) => Number.isFinite(n) && n > 0));
    const importedDraftIndexes = submitDraftIndexes.filter((_, submitIdx) => !failedRowNumbers.has(submitIdx + 1));
    if (importedDraftIndexes.length > 0) {
      const importedSet = new Set(importedDraftIndexes);
      setImportRowsWithDuplicateMetadata((rows) => rows.filter((_, idx) => !importedSet.has(idx)));
    }
  };

  const undoImportedRows = async () => {
    const importedLeadIds = importSummary?.importedLeadIds || [];
    if (!importedLeadIds.length) {
      setAlertModal({
        isOpen: true,
        title: 'Nothing to undo',
        message: 'No imported CRM records are available for rollback in this session.',
        variant: 'error',
      });
      return;
    }
    if (!window.confirm(`Undo last import by deleting ${importedLeadIds.length} imported CRM record(s)?`)) return;

    setImportBusy(true);
    try {
      const res = await crmAPI.bulkDelete(importedLeadIds);
      await loadList();
      setImportSummary((prev) => ({
        ...(prev || {}),
        importedLeadIds: [],
        importedCount: 0,
        undoResult: {
          deletedCount: res?.deleted_count || 0,
          requestedCount: res?.requested_count || importedLeadIds.length,
          alreadyRemovedCount: (res?.not_found_ids || []).length,
        },
      }));
      const alreadyRemovedCount = (res?.not_found_ids || []).length;
      setAlertModal({
        isOpen: true,
        title: 'Import rollback complete',
        message:
          alreadyRemovedCount > 0
            ? `Deleted ${res?.deleted_count || 0} CRM record(s). ${alreadyRemovedCount} were already removed earlier, so they were skipped automatically.`
            : `Deleted ${res?.deleted_count || 0} CRM record(s) from the last import batch.`,
        variant: 'success',
      });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not undo import',
        message: e.message || 'Rollback failed',
        variant: 'error',
      });
    } finally {
      setImportBusy(false);
    }
  };

  function resetNoteDraft() {
    setNoteDraft(emptyNoteDraft());
  }

  const startAddNote = () => {
    resetNoteDraft();
    setNoteComposerOpen(true);
  };

  const startReply = (parentNoteId) => {
    setNoteDraft(noteDraftForReply(parentNoteId));
    setNoteComposerOpen(true);
  };

  const startEditNote = (note) => {
    setNoteDraft(noteDraftForEdit(note));
    setNoteComposerOpen(true);
  };

  const saveNote = async () => {
    if (!selectedId) return;
    if (!noteDraft.body?.trim()) {
      setAlertModal({
        isOpen: true,
        title: 'Note required',
        message: 'Enter note details before saving.',
        variant: 'error',
      });
      return;
    }
    setNoteSaving(true);
    try {
      const payload = {
        contact_method: noteDraft.contact_method || 'note',
        made_contact: Boolean(noteDraft.made_contact),
        title: noteDraft.title?.trim() || undefined,
        body: noteDraft.body.trim(),
        parent_note_id: noteDraft.parent_note_id ?? undefined,
      };
      const res = noteDraft.id
        ? await crmAPI.updateNote(selectedId, noteDraft.id, payload)
        : await crmAPI.createNote(selectedId, payload);
      setCrmNotes(res.crm_notes || []);
      resetNoteDraft();
      setNoteComposerOpen(false);
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not save note',
        message: e.message || 'Save failed',
        variant: 'error',
      });
    } finally {
      setNoteSaving(false);
    }
  };

  const c = detail?.crm_lead;
  const metrics = detail?.linked_metrics;
  const activity = detail?.activity;
  const recentJobs = detail?.recent_jobs || [];
  const displayContacts = editableContacts(form.contacts, {
    name: form.contact_name || '',
    email: form.email || '',
    phone: form.phone || '',
  });
  const fullAddress = [form.street_address, form.city, form.state, form.zip].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  const mapsAddressUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : '';
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
                setPasteImportText('');
                setImportDraftRows([]);
                setImportRowFilter('all');
                setImportModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 shadow-sm"
            >
              <FaFileUpload className="w-4 h-4" aria-hidden />
              Import
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
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">Edit record</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setProfileImportOpen(true)}
                      className="px-3 py-1.5 border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-50 text-sm font-medium inline-flex items-center gap-1"
                    >
                      <FaFileUpload className="w-3.5 h-3.5" />
                      Import
                    </button>
                    {isRecordEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsRecordEditing(false);
                          if (selectedId) loadDetail(selectedId);
                        }}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsRecordEditing((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                        isRecordEditing ? 'bg-gray-800 text-white hover:bg-gray-900' : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isRecordEditing ? 'DONE' : 'EDIT'}
                    </button>
                  </div>
                </div>
                {detailLoading && (
                  <p className="text-sm text-gray-500 mb-4">Loading details…</p>
                )}
                {isRecordEditing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company name *</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Contact</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.contact_name ?? ''}
                      onChange={(e) => updatePrimaryContactField('name', e.target.value)}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                    <select
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize"
                      value={form.status ?? 'lead'}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      disabled={!isRecordEditing}
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
                      onChange={(e) => updatePrimaryContactField('email', e.target.value)}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Phone</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.phone ?? ''}
                      onChange={(e) => updatePrimaryContactField('phone', e.target.value)}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <div className="block sm:col-span-2 rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Additional contacts</span>
                      <button
                        type="button"
                        disabled={!isRecordEditing}
                        onClick={addAdditionalContact}
                        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Add contact
                      </button>
                    </div>
                    {editableContacts(form.contacts, { name: form.contact_name, email: form.email, phone: form.phone })
                      .slice(1)
                      .map((contact, idx) => {
                        const contactIndex = idx + 1;
                        return (
                          <div key={`extra-contact-${contactIndex}`} className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              placeholder="Name"
                              value={contact.name || ''}
                              ref={focusAdditionalContactNameInput(contactIndex)}
                              onChange={(e) => updateAdditionalContactField(contactIndex, 'name', e.target.value)}
                              readOnly={!isRecordEditing}
                            />
                            <input
                              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              placeholder="Email"
                              value={contact.email || ''}
                              onChange={(e) => updateAdditionalContactField(contactIndex, 'email', e.target.value)}
                              readOnly={!isRecordEditing}
                            />
                            <div className="flex gap-2">
                              <input
                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                                placeholder="Phone"
                                value={contact.phone || ''}
                                onChange={(e) => updateAdditionalContactField(contactIndex, 'phone', e.target.value)}
                                readOnly={!isRecordEditing}
                              />
                              <button
                                type="button"
                                disabled={!isRecordEditing}
                                onClick={() => removeAdditionalContact(contactIndex)}
                                className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {editableContacts(form.contacts, { name: form.contact_name, email: form.email, phone: form.phone }).length <= 1 && (
                      <p className="mt-2 text-xs text-gray-500">No additional contacts yet.</p>
                    )}
                  </div>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Website</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.website ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Street address</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.street_address ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, street_address: e.target.value }))}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">City</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.city ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">State</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.state ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">ZIP</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.zip ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <div className="hidden sm:block" aria-hidden />
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Instagram URL</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.instagram_url ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, instagram_url: e.target.value }))}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Facebook URL</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.facebook_url ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, facebook_url: e.target.value }))}
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">LinkedIn URL</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.linkedin_url ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                      readOnly={!isRecordEditing}
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
                            disabled={!isRecordEditing}
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
                      readOnly={!isRecordEditing}
                    />
                  </label>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-gray-500 uppercase">Company name</div>
                        <div className="mt-1 text-sm text-gray-900 font-medium">{form.name || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 uppercase">Website</div>
                        <div className="mt-1 text-sm text-gray-900">
                          {form.website ? (
                            <a
                              href={/^https?:\/\//i.test(form.website) ? form.website : `https://${form.website}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 hover:underline break-all"
                            >
                              {form.website}
                            </a>
                          ) : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-gray-500 uppercase">Company phone</div>
                        <div className="mt-1 text-sm text-gray-900">{form.phone || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 uppercase">Company email</div>
                        <div className="mt-1 text-sm text-gray-900">
                          {form.email ? (
                            <a href={`mailto:${form.email}`} className="text-blue-700 hover:underline break-all">
                              {form.email}
                            </a>
                          ) : '—'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase">Company address</div>
                      <div className="mt-1 text-sm text-gray-900">
                        {fullAddress ? (
                          <a href={mapsAddressUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-words">
                            {fullAddress}
                          </a>
                        ) : '—'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                        Contacts ({displayContacts.length})
                      </div>
                      {displayContacts.length === 0 ? (
                        <div className="text-sm text-gray-500">No contacts yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {displayContacts.map((contact, idx) => (
                            <details
                              key={`view-contact-${idx}`}
                              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                              open={idx === 0}
                            >
                              <summary className="cursor-pointer text-sm font-medium text-gray-900">
                                {contact.name || `Contact ${idx + 1}`}
                              </summary>
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-gray-500">Email:</span>{' '}
                                  {contact.email ? (
                                    <a href={`mailto:${contact.email}`} className="text-blue-700 hover:underline break-all">
                                      {contact.email}
                                    </a>
                                  ) : '—'}
                                </div>
                                <div>
                                  <span className="text-gray-500">Phone:</span> {contact.phone || '—'}
                                </div>
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                        readOnly={!isRecordEditing}
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
                    disabled={saving || !isRecordEditing}
                    onClick={saveRecord}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : isRecordEditing ? 'Save' : 'Enable EDIT to save'}
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

            {selectedId && !isCreating && (
              <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Notes Timeline</h2>
                  <button
                    type="button"
                    onClick={startAddNote}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                  >
                    <FaPlus className="w-3.5 h-3.5" /> Add note
                  </button>
                </div>

                {noteComposerOpen ? (
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50 mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 uppercase">Type</span>
                      <select
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize"
                        value={noteDraft.contact_method}
                        onChange={(e) => setNoteDraft((n) => ({ ...n, contact_method: e.target.value }))}
                      >
                        {CRM_NOTE_CONTACT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Title (optional)</span>
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={noteDraft.title}
                        onChange={(e) => setNoteDraft((n) => ({ ...n, title: e.target.value }))}
                        placeholder={noteDraft.parent_note_id ? 'Comment title' : 'Quick summary'}
                      />
                    </label>
                    <label className="block sm:col-span-3">
                      <span className="text-xs font-medium text-gray-500 uppercase">Note details *</span>
                      <textarea
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[96px]"
                        value={noteDraft.body}
                        onChange={(e) => setNoteDraft((n) => ({ ...n, body: e.target.value }))}
                        placeholder={noteDraft.parent_note_id ? 'Add your follow-up comment...' : 'Enter call/email/text/in-person details...'}
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 sm:col-span-3">
                      <input
                        type="checkbox"
                        checked={Boolean(noteDraft.made_contact)}
                        onChange={(e) => setNoteDraft((n) => ({ ...n, made_contact: e.target.checked }))}
                      />
                      I made contact
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={noteSaving}
                      onClick={saveNote}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                    >
                      {noteSaving ? 'Saving…' : noteDraft.id ? 'Update note' : noteDraft.parent_note_id ? 'Save comment' : 'Save note'}
                    </button>
                    <button
                      type="button"
                      disabled={noteSaving}
                      onClick={() => {
                        resetNoteDraft();
                        setNoteComposerOpen(false);
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                ) : null}

                {crmNotes.length === 0 ? (
                  <p className="text-sm text-gray-500">No notes yet. Click "Add note" to log the first activity.</p>
                ) : (
                  <div className="space-y-3">
                    {crmNotes.map((note) => {
                      const wasEdited = noteWasEdited(note);
                      return (
                        <div key={note.id} className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span className="capitalize px-2 py-0.5 rounded bg-gray-100 text-gray-700">{(note.contact_method || 'note').replace(/_/g, ' ')}</span>
                            <span>{note.made_contact ? 'Contact made' : 'No contact made'}</span>
                            <span>Posted {formatDateTime(note.created_at)}</span>
                            {wasEdited && <span className="text-amber-700">Updated {formatDateTime(note.updated_at)}</span>}
                          </div>
                          {note.title && <h4 className="mt-2 font-semibold text-gray-900">{note.title}</h4>}
                          <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{note.body}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => startEditNote(note)} className="text-xs text-blue-700 hover:underline">
                              Edit
                            </button>
                            <button type="button" onClick={() => startReply(note.id)} className="text-xs text-indigo-700 hover:underline">
                              Comment
                            </button>
                          </div>

                          {(note.comments || []).length > 0 && (
                            <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                              {note.comments.map((comment) => {
                                const commentEdited = noteWasEdited(comment);
                                return (
                                  <div key={comment.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                      <span className="capitalize px-2 py-0.5 rounded bg-white text-gray-700">{(comment.contact_method || 'note').replace(/_/g, ' ')}</span>
                                      <span>{comment.made_contact ? 'Contact made' : 'No contact made'}</span>
                                      <span>Posted {formatDateTime(comment.created_at)}</span>
                                      {commentEdited && <span className="text-amber-700">Updated {formatDateTime(comment.updated_at)}</span>}
                                    </div>
                                    {comment.title && <h5 className="mt-1 font-medium text-gray-900">{comment.title}</h5>}
                                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{comment.body}</p>
                                    <button type="button" onClick={() => startEditNote(comment)} className="mt-2 text-xs text-blue-700 hover:underline">
                                      Edit comment
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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

        {profileImportOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-profile-import-title"
            onClick={() => setProfileImportOpen(false)}
          >
            <div
              className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-xl w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
                <h2 id="crm-profile-import-title" className="text-lg font-semibold text-gray-900">
                  Import into this company
                </h2>
                <button
                  type="button"
                  onClick={() => setProfileImportOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close"
                >
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-3">
                <p className="text-sm text-gray-600">
                  Paste any company/contact text. The CRM will detect values like company name, contact, email, phone,
                  website, status, and notes and map them automatically.
                </p>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[180px]"
                  placeholder="Example: Magic Valley Electric / Contact: Jose Garcia / Email: jgarcia@mvec.coop / +1 (956) 555-1050 / https://mvec.coop"
                  value={profileImportText}
                  onChange={(e) => setProfileImportText(e.target.value)}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setProfileImportOpen(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyProfileImportFromText}
                    className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-medium"
                  >
                    Apply import
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

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
                  Build your list in Excel/Google Sheets or paste raw rows, then review and fix data before importing.
                  Rows for the same company are consolidated into one CRM company record.
                </p>
                <p className="text-xs text-gray-500">
                  For a single contact/company, you can also paste disorganized text and the parser will infer likely
                  field mappings automatically.
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
                <p className="text-xs text-gray-500">
                  If the same company appears on multiple rows with different contacts, the first contact stays as the
                  primary contact and additional contacts are saved in notes.
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
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Or paste rows directly</span>
                    <textarea
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[160px] bg-white"
                      placeholder="Paste rows here (with or without header). Wrapped lines are supported."
                      value={pasteImportText}
                      onChange={(e) => setPasteImportText(e.target.value)}
                      disabled={importBusy}
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={importBusy}
                      onClick={parsePastedData}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                    >
                      Parse pasted data
                    </button>
                    <button
                      type="button"
                      disabled={importBusy}
                      onClick={() => setPasteImportText('')}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-medium disabled:opacity-50"
                    >
                      Clear pasted text
                    </button>
                  </div>
                </div>
                {importDraftRows.length > 0 && (
                  <div className="rounded-lg border border-gray-200 p-3 bg-white space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        Parsed rows: {importDraftRows.length} | Issues:{' '}
                        {importDraftRows.reduce((sum, r) => sum + (r._errors?.length || 0), 0)} | Duplicates (list:crm):{' '}
                        <span className="text-amber-700">{draftDuplicateStats.withinList}</span>
                        :
                        <span className="text-red-700">{draftDuplicateStats.inCrm}</span> | Unverified duplicates:{' '}
                        {importDraftRows.filter((r) => r._isDuplicate && !r._duplicateVerified).length}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={importRowFilter}
                          onChange={(e) => setImportRowFilter(e.target.value)}
                          className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 bg-white"
                        >
                          <option value="all">Show all rows</option>
                          <option value="duplicates">Show duplicates only</option>
                          <option value="duplicates_unverified">Unverified duplicates</option>
                          <option value="clean">Show non-duplicates only</option>
                        </select>
                        <button
                          type="button"
                          onClick={autoFixDraftRows}
                          disabled={importBusy}
                          className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        >
                          Auto-fix common issues
                        </button>
                        <button
                          type="button"
                          onClick={importCleanedRows}
                          disabled={importBusy}
                          className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {importBusy ? 'Importing…' : 'Import cleaned rows'}
                        </button>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 text-left">Row</th>
                            <th className="px-2 py-1 text-left">Company</th>
                            <th className="px-2 py-1 text-left">First name</th>
                            <th className="px-2 py-1 text-left">Last name</th>
                            <th className="px-2 py-1 text-left">Email</th>
                            <th className="px-2 py-1 text-left">Phone</th>
                            <th className="px-2 py-1 text-left">Website</th>
                            <th className="px-2 py-1 text-left">Types</th>
                            <th className="px-2 py-1 text-left">Status</th>
                            <th className="px-2 py-1 text-left">Notes</th>
                            <th className="px-2 py-1 text-left min-w-[12rem]">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importDraftRows
                            .map((row, idx) => ({ row, idx }))
                            .filter(({ row }) => {
                              if (importRowFilter === 'duplicates') return row._isDuplicate;
                              if (importRowFilter === 'duplicates_unverified') return row._isDuplicate && !row._duplicateVerified;
                              if (importRowFilter === 'clean') return !row._isDuplicate;
                              return true;
                            })
                            .map(({ row, idx }) => (
                            <tr key={`${row._rowNum}-${idx}`} className="border-t border-gray-100 align-top">
                              <td className="px-2 py-1 text-gray-500">{row._rowNum}</td>
                              <td className="px-2 py-1"><input className="w-44 border rounded px-1 py-0.5" value={row.name} onChange={(e) => updateDraftRow(idx, 'name', e.target.value)} /></td>
                              <td className="px-2 py-1">
                                <input
                                  className="w-32 border rounded px-1 py-0.5"
                                  value={splitContactName(row.contact_name).firstName}
                                  onChange={(e) => updateDraftContactNamePart(idx, 'firstName', e.target.value)}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  className="w-32 border rounded px-1 py-0.5"
                                  value={splitContactName(row.contact_name).lastName}
                                  onChange={(e) => updateDraftContactNamePart(idx, 'lastName', e.target.value)}
                                />
                              </td>
                              <td className="px-2 py-1"><input className="w-44 border rounded px-1 py-0.5" value={row.email} onChange={(e) => updateDraftRow(idx, 'email', e.target.value)} /></td>
                              <td className="px-2 py-1"><input className="w-32 border rounded px-1 py-0.5" value={row.phone} onChange={(e) => updateDraftRow(idx, 'phone', e.target.value)} /></td>
                              <td className="px-2 py-1"><input className="w-40 border rounded px-1 py-0.5" value={row.website} onChange={(e) => updateDraftRow(idx, 'website', e.target.value)} /></td>
                              <td className="px-2 py-1"><input className="w-40 border rounded px-1 py-0.5" value={row.company_types} onChange={(e) => updateDraftRow(idx, 'company_types', e.target.value)} /></td>
                              <td className="px-2 py-1">
                                <select className="w-28 border rounded px-1 py-0.5" value={row.status} onChange={(e) => updateDraftRow(idx, 'status', e.target.value)}>
                                  {CRM_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                                </select>
                              </td>
                              <td className="px-2 py-1"><input className="w-48 border rounded px-1 py-0.5" value={row.notes} onChange={(e) => updateDraftRow(idx, 'notes', e.target.value)} /></td>
                              <td className="px-2 py-1 min-w-[12rem]">
                                <button type="button" onClick={() => removeDraftRow(idx)} className="text-red-700 hover:underline">Remove</button>
                                {row._isDuplicate && (
                                  <div className="mt-1 space-y-1 max-h-24 overflow-auto pr-1">
                                    <div className="text-amber-700 whitespace-normal break-words">{row._duplicateReasons.join('; ')}</div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setImportRowsWithDuplicateMetadata((rows) =>
                                          rows.map((draftRow, rowIdx) =>
                                            rowIdx === idx ? { ...draftRow, _duplicateVerified: !draftRow._duplicateVerified } : draftRow,
                                          ),
                                        );
                                      }}
                                      className={`hover:underline ${row._duplicateVerified ? 'text-emerald-700' : 'text-amber-700'}`}
                                    >
                                      {row._duplicateVerified ? 'Verified duplicate (click to unverify)' : 'Mark duplicate as verified'}
                                    </button>
                                  </div>
                                )}
                                {row._errors?.length > 0 && (
                                  <div className="mt-1 text-red-700 whitespace-normal break-words max-h-20 overflow-auto pr-1">{row._errors.join('; ')}</div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {importSummary && (
                  <div className="rounded-lg border border-gray-200 p-3 text-sm">
                    <p className="font-medium text-gray-900">
                      Imported {importSummary.importedCount}, failed {importSummary.failedCount}.
                    </p>
                    {importSummary.undoResult && (
                      <p className="mt-1 text-xs text-emerald-700">
                        {importSummary.undoResult.alreadyRemovedCount > 0
                          ? `Rollback removed ${importSummary.undoResult.deletedCount} record(s); ${importSummary.undoResult.alreadyRemovedCount} were already deleted and skipped.`
                          : `Rollback removed ${importSummary.undoResult.deletedCount} of ${importSummary.undoResult.requestedCount} imported record(s).`}
                      </p>
                    )}
                    {(importSummary.importedLeadIds || []).length > 0 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          disabled={importBusy}
                          onClick={undoImportedRows}
                          className="px-3 py-1.5 text-xs rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {importBusy ? 'Undoing…' : `Undo last import (${importSummary.importedLeadIds.length})`}
                        </button>
                      </div>
                    )}
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
                          setNewCompanyHits([]);
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
                      onChange={(e) => setProvision((p) => ({ ...p, phone: formatPhoneInput(e.target.value) }))}
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
                    <div className="mt-2 border border-gray-200 rounded-lg max-h-40 overflow-auto bg-white">
                      {newCompanySearchBusy ? (
                        <div className="px-3 py-2 text-xs text-gray-500">Checking for possible duplicates…</div>
                      ) : newCompanyHits.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-500">No likely duplicates found.</div>
                      ) : (
                        newCompanyHits.map((cp) => (
                          <button
                            key={cp.id}
                            type="button"
                            className="w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-amber-50"
                            onClick={() => {
                              setProvisionMode('existing');
                              setSelectedCompany(cp);
                              setCompanySearchQ(cp.company_name || `Company #${cp.id}`);
                              setCompanyHits([]);
                            }}
                          >
                            <div className="text-sm font-medium text-gray-900">{cp.company_name || `Company #${cp.id}`}</div>
                            <div className="text-xs text-amber-700">Possible duplicate - {cp.company_users_count || 0} login account(s)</div>
                          </button>
                        ))
                      )}
                    </div>
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
                      onChange={(e) => updatePrimaryContactField('name', e.target.value)}
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
                      onChange={(e) => updatePrimaryContactField('email', e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Phone</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.phone ?? ''}
                      onChange={(e) => updatePrimaryContactField('phone', e.target.value)}
                    />
                  </label>
                  <div className="block sm:col-span-2 rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Additional contacts</span>
                      <button
                        type="button"
                        onClick={addAdditionalContact}
                        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                      >
                        Add contact
                      </button>
                    </div>
                    {editableContacts(form.contacts, { name: form.contact_name, email: form.email, phone: form.phone })
                      .slice(1)
                      .map((contact, idx) => {
                        const contactIndex = idx + 1;
                        return (
                          <div key={`new-extra-contact-${contactIndex}`} className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              placeholder="Name"
                              value={contact.name || ''}
                              ref={focusAdditionalContactNameInput(contactIndex)}
                              onChange={(e) => updateAdditionalContactField(contactIndex, 'name', e.target.value)}
                            />
                            <input
                              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              placeholder="Email"
                              value={contact.email || ''}
                              onChange={(e) => updateAdditionalContactField(contactIndex, 'email', e.target.value)}
                            />
                            <div className="flex gap-2">
                              <input
                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                                placeholder="Phone"
                                value={contact.phone || ''}
                                onChange={(e) => updateAdditionalContactField(contactIndex, 'phone', e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => removeAdditionalContact(contactIndex)}
                                className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {editableContacts(form.contacts, { name: form.contact_name, email: form.email, phone: form.phone }).length <= 1 && (
                      <p className="mt-2 text-xs text-gray-500">No additional contacts yet.</p>
                    )}
                  </div>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Website</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.website ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Street address</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.street_address ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, street_address: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">City</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.city ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">State</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.state ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">ZIP</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.zip ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                    />
                  </label>
                  <div className="hidden sm:block" aria-hidden />
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Instagram URL</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.instagram_url ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, instagram_url: e.target.value }))}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Facebook URL</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.facebook_url ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, facebook_url: e.target.value }))}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">LinkedIn URL</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.linkedin_url ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
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
