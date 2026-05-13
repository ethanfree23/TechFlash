import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { crmAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import { useTableColumnPreferences } from '../hooks/useTableColumnPreferences';
import { TABLE_COLUMN_IDS } from '../utils/tableColumnPrefs';
import { formatPhoneInput } from '../utils/phone';
import {
  buildImportDraftRows,
  autoFixDraftRows as autoFixImportDraftRows,
  makeDraftRow,
  inferSingleImportRowFromUnstructuredText,
  lineLooksLikeContactBlob,
} from '../utils/crmImport';
import {
  emptyNoteDraft,
  noteDraftForReply,
  noteDraftForEdit,
  noteWasEdited,
} from '../utils/crmNotes';
import { US_STATES } from '../data/statesByCountry';
import { normalizeToUsStateName } from '../utils/crmUsState';
import {
  CRM_STATUSES,
  CRM_PIPELINE_STORAGE_KEY,
  CRM_PIPELINE_DEFAULT_COLUMNS,
  CRM_COMPANY_TYPES,
  CRM_NOTE_CONTACT_METHODS,
  CRM_MERGE_FIELDS,
  CRM_QUICK_PIPELINE_FILTERS,
  CRM_SORT_OPTIONS,
  CRM_NOTE_QUICK_TEMPLATES,
  CONTACT_JOB_TITLE_SUGGESTIONS,
} from '../utils/crmConstants';
import {
  filterSidebarLeads,
  sortLeads,
  computeCrmStatsStrip,
  exportLeadsToCsv,
  filterNotesForTimeline,
  getOperationalInsights,
  getOutreachSnapshot,
  isValidEmail,
  isValidPhoneLoose,
  isValidUrlLoose,
  getPrimaryContactPreview,
} from '../utils/crmDisplayAdapter';
import CrmCommandHeader from '../components/crm/CrmCommandHeader';
import CompanyRecordHeader from '../components/crm/CompanyRecordHeader';
import CrmRightRail from '../components/crm/CrmRightRail';
import PipelineStageTracker from '../components/crm/PipelineStageTracker';
import CrmBioReadMore from '../components/crm/CrmBioReadMore';
import { CrmStatusBadge, CompanyTypeBadges } from '../components/crm/CrmBadges';
import AdminCreateUserModal from '../components/AdminCreateUserModal';
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
  FaCog,
  FaChevronDown,
  FaChevronRight,
} from 'react-icons/fa';

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

const defaultSameAsCompany = () => ({ email: false, phone: false, socials: false });

const normalizeSameAsCompany = (raw) => {
  if (!raw || typeof raw !== 'object') return defaultSameAsCompany();
  return {
    email: Boolean(raw.email),
    phone: Boolean(raw.phone),
    socials: Boolean(raw.socials),
  };
};

const normalizeContactEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const name = String(entry.name || '').trim();
  const email = String(entry.email || '').trim();
  const phone = formatPhoneInput(String(entry.phone || '').trim());
  const jobTitle = String(entry.job_title || '').trim();
  const extension = String(entry.extension || '').trim();
  const instagramUrl = String(entry.instagram_url || '').trim();
  const facebookUrl = String(entry.facebook_url || '').trim();
  const linkedinUrl = String(entry.linkedin_url || '').trim();
  const sameAs = normalizeSameAsCompany(entry.same_as_company);
  if (!name && !email && !phone) return null;
  const out = { name, email, phone, job_title: jobTitle, extension };
  if (instagramUrl) out.instagram_url = instagramUrl;
  if (facebookUrl) out.facebook_url = facebookUrl;
  if (linkedinUrl) out.linkedin_url = linkedinUrl;
  if (sameAs.email || sameAs.phone || sameAs.socials) {
    out.same_as_company = {
      ...(sameAs.email ? { email: true } : {}),
      ...(sameAs.phone ? { phone: true } : {}),
      ...(sameAs.socials ? { socials: true } : {}),
    };
  }
  const lid = entry.linked_user_id ?? entry.linked_userId;
  if (lid != null && lid !== '') {
    const n = Number(lid);
    if (Number.isFinite(n) && n > 0) out.linked_user_id = n;
  }
  return out;
};

const normalizeContactDraftEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return {
      name: '',
      email: '',
      phone: '',
      job_title: '',
      extension: '',
      instagram_url: '',
      facebook_url: '',
      linkedin_url: '',
      same_as_company: defaultSameAsCompany(),
      linked_user_id: '',
    };
  }
  return {
    name: String(entry.name || '').trim(),
    email: String(entry.email || '').trim(),
    phone: formatPhoneInput(String(entry.phone || '').trim()),
    job_title: String(entry.job_title || '').trim(),
    extension: String(entry.extension || '').trim(),
    instagram_url: String(entry.instagram_url || '').trim(),
    facebook_url: String(entry.facebook_url || '').trim(),
    linkedin_url: String(entry.linkedin_url || '').trim(),
    same_as_company: normalizeSameAsCompany(entry.same_as_company),
    linked_user_id:
      entry?.linked_user_id != null && entry.linked_user_id !== ''
        ? Number(entry.linked_user_id)
        : '',
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

const mergeFieldDisplayValue = (lead, key) => {
  if (!lead) return '—';
  const value = lead[key];
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  return String(value);
};

/** Resolved values for read-only CRM UI (mirrors save payload resolution). */
const resolveContactForDisplay = (entry, f) => {
  if (!entry || typeof entry !== 'object') {
    return {
      email: '',
      phone: '',
      instagram_url: '',
      facebook_url: '',
      linkedin_url: '',
      same_as_company: defaultSameAsCompany(),
    };
  }
  const sac = normalizeSameAsCompany(entry.same_as_company);
  const ce = (f.company_email || '').trim();
  const cp = formatPhoneInput((f.company_phone || '').trim());
  const email = sac.email && ce ? ce : String(entry.email || '').trim();
  const phone = sac.phone && cp ? cp : formatPhoneInput(String(entry.phone || '').trim());
  const fig = (f.instagram_url || '').trim();
  const ffb = (f.facebook_url || '').trim();
  const fli = (f.linkedin_url || '').trim();
  const ig = sac.socials ? fig || String(entry.instagram_url || '').trim() : String(entry.instagram_url || '').trim();
  const fb = sac.socials ? ffb || String(entry.facebook_url || '').trim() : String(entry.facebook_url || '').trim();
  const li = sac.socials ? fli || String(entry.linkedin_url || '').trim() : String(entry.linkedin_url || '').trim();
  return { email, phone, instagram_url: ig, facebook_url: fb, linkedin_url: li, same_as_company: sac };
};

function normalizeCrmImportMatchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCrmImportPhoneMatch(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeCrmImportWebsiteMatch(value) {
  const normalized = normalizeCrmImportMatchValue(value);
  if (!normalized) return '';
  return normalized.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

function buildCrmImportRowSignatures(row) {
  const signatures = [];
  const name = normalizeCrmImportMatchValue(row.name);
  const email = normalizeCrmImportMatchValue(row.email);
  const phone = normalizeCrmImportPhoneMatch(row.phone);
  const website = normalizeCrmImportWebsiteMatch(row.website);
  if (name) signatures.push({ key: `name:${name}`, label: 'name' });
  if (email) signatures.push({ key: `email:${email}`, label: 'email' });
  if (phone) signatures.push({ key: `phone:${phone}`, label: 'phone' });
  if (website) signatures.push({ key: `website:${website}`, label: 'website' });
  return signatures;
}

const CrmPage = ({ user, onLogout, onUserUpdate }) => {
  const navigate = useNavigate();
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
  const handlePipelineColumnSaveError = useCallback(() => {
    setAlertModal({
      isOpen: true,
      title: 'Could not save column settings',
      message: 'Your pipeline layout was kept on this device only. Try again later.',
      variant: 'error',
    });
  }, []);
  const [pipelineColumns, setPipelineColumns] = useTableColumnPreferences({
    tableId: TABLE_COLUMN_IDS.crmPipeline,
    defaultColumns: CRM_PIPELINE_DEFAULT_COLUMNS,
    user,
    onUserUpdate,
    onSaveError: handlePipelineColumnSaveError,
    localStorageKey: CRM_PIPELINE_STORAGE_KEY,
  });
  const [showPipelineColumnConfig, setShowPipelineColumnConfig] = useState(false);
  const [draggingPipelineColumnKey, setDraggingPipelineColumnKey] = useState(null);
  const [pipelineNameFilter, setPipelineNameFilter] = useState('');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState('');
  const [pipelineExpandedByProfileId, setPipelineExpandedByProfileId] = useState({});
  const [crmCompanyInfoOpen, setCrmCompanyInfoOpen] = useState(true);
  const [crmUsersSectionOpen, setCrmUsersSectionOpen] = useState(true);
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
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeDirection, setMergeDirection] = useState('into_current');
  const [mergeFieldSources, setMergeFieldSources] = useState(() =>
    Object.fromEntries(CRM_MERGE_FIELDS.map((field) => [field.key, 'current'])),
  );
  const [mergeOptions, setMergeOptions] = useState({
    combine_contacts: true,
    combine_company_types: true,
    combine_notes: true,
    combine_timeline_notes: true,
  });
  const [crmDateRange, setCrmDateRange] = useState('all');
  const [crmMarketFilter, setCrmMarketFilter] = useState('all');
  const [crmTradeFilter, setCrmTradeFilter] = useState('all');
  const [crmSidebarSort, setCrmSidebarSort] = useState('updated_desc');
  const [crmQuickPipeline, setCrmQuickPipeline] = useState('all');
  const [crmLinkedFilter, setCrmLinkedFilter] = useState('all');
  const [crmHasNotesFilter, setCrmHasNotesFilter] = useState('all');
  const [crmHasContactFilter, setCrmHasContactFilter] = useState('all');
  const [crmHasPhoneFilter, setCrmHasPhoneFilter] = useState('all');
  const [timelineFilter, setTimelineFilter] = useState('all');
  const pendingAdditionalContactFocusIdx = useRef(null);
  const crmAddUserContactIdxRef = useRef(null);
  const [crmContactUserModalOpen, setCrmContactUserModalOpen] = useState(false);
  const [crmAddUserPrefill, setCrmAddUserPrefill] = useState(null);

  const hydrateFormFromCrmLead = useCallback((c) => {
    if (!c) return;
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
      state: normalizeToUsStateName(c.state || ''),
      zip: c.zip || '',
      instagram_url: c.instagram_url || '',
      facebook_url: c.facebook_url || '',
      linkedin_url: c.linkedin_url || '',
      company_types: c.company_types || [],
      status: c.status || 'lead',
      notes: c.notes || '',
      bio: c.bio || '',
      company_email: c.company_email || '',
      company_phone: c.company_phone || '',
      linked_user_id: c.linked_user_id ?? null,
      linked_company_profile_id: c.linked_company_profile_id ?? null,
    });
  }, []);

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
      hydrateFormFromCrmLead(res.crm_lead);
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
  }, [hydrateFormFromCrmLead]);

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
        bio: '',
        company_email: '',
        company_phone: '',
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
    setTimelineFilter('all');
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

  const openProvisionFromCrmRecord = useCallback(() => {
    const pc = getPrimaryContactPreview({
      ...form,
      contact_name: form.contact_name,
      contacts: form.contacts,
    });
    const tokens = String(pc.name || form.contact_name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let firstName = '';
    let lastName = '';
    if (tokens.length === 1) {
      firstName = tokens[0];
    } else if (tokens.length > 1) {
      firstName = tokens[0];
      lastName = tokens.slice(1).join(' ');
    }
    const loc = [form.city, form.state]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .join(', ');
    const industryFirst = (form.company_types || [])[0];
    setProvisionMode('new');
    setSelectedCompany(null);
    setCompanySearchQ('');
    setCompanyHits([]);
    setNewCompanyHits([]);
    setProvision({
      email: String(pc.email || form.company_email || form.email || '').trim(),
      first_name: firstName,
      last_name: lastName,
      company_name: String(form.name || '').trim(),
      phone: formatPhoneInput(String(pc.phone || form.company_phone || form.phone || '')),
      industry: industryFirst ? String(industryFirst).replace(/_/g, ' ') : '',
      location: loc,
      bio:
        String(form.bio || '').trim() ||
        'Company profile pending — update from CRM record or complete during onboarding.',
    });
    setProfileImportOpen(false);
    setNewCompanyModalOpen(false);
    setIsCreating(false);
    setProvisionModalOpen(true);
  }, [form]);

  const selectLead = (id) => {
    const row = leads.find((l) => Number(l.id) === Number(id));
    const pid = row?.linked_company_profile_id;
    if (pid != null && pid !== '') {
      const k = String(pid);
      const mates = leads.filter((r) => String(r.linked_company_profile_id) === k);
      if (mates.length > 1) {
        setPipelineExpandedByProfileId((p) => ({ ...p, [k]: true }));
      }
    }
    setIsCreating(false);
    setNewCompanyModalOpen(false);
    setProfileImportOpen(false);
    setSelectedId(id);
    setSearchQ('');
    setSearchHits([]);
  };

  const resolveContactRowForPayload = (entry, f) => {
    const sac = normalizeSameAsCompany(entry.same_as_company);
    const companyEmail = (f.company_email || '').trim();
    const companyPhone = formatPhoneInput((f.company_phone || '').trim());
    const email = sac.email && companyEmail ? companyEmail : String(entry.email || '').trim();
    const phone = sac.phone && companyPhone ? companyPhone : formatPhoneInput(String(entry.phone || '').trim());
    let ig = String(entry.instagram_url || '').trim();
    let fb = String(entry.facebook_url || '').trim();
    let li = String(entry.linkedin_url || '').trim();
    if (sac.socials) {
      ig = (f.instagram_url || '').trim() || ig;
      fb = (f.facebook_url || '').trim() || fb;
      li = (f.linkedin_url || '').trim() || li;
    }
    const row = {
      name: String(entry.name || '').trim(),
      email,
      phone,
      job_title: String(entry.job_title || '').trim() || undefined,
      extension: String(entry.extension || '').trim() || undefined,
      instagram_url: ig || undefined,
      facebook_url: fb || undefined,
      linkedin_url: li || undefined,
    };
    Object.keys(row).forEach((k) => {
      if (row[k] === undefined || row[k] === '') delete row[k];
    });
    if (sac.email || sac.phone || sac.socials) {
      row.same_as_company = {
        ...(sac.email ? { email: true } : {}),
        ...(sac.phone ? { phone: true } : {}),
        ...(sac.socials ? { socials: true } : {}),
      };
    }
    const lid = entry.linked_user_id ?? entry.linked_userId;
    if (lid != null && lid !== '') {
      const n = Number(lid);
      if (Number.isFinite(n) && n > 0) row.linked_user_id = n;
    }
    return row;
  };

  const saveRecord = async () => {
    const base = normalizeContacts(form.contacts, {
      name: form.contact_name || '',
      email: form.email || '',
      phone: form.phone || '',
      job_title: '',
      extension: '',
    });
    const normalizedContacts = base.map((c) => resolveContactRowForPayload(c, form));
    const primaryContact = normalizedContacts[0] || {};
    const payload = {
      name: form.name?.trim(),
      contact_name: (primaryContact.name || form.contact_name || '').trim() || undefined,
      email: (primaryContact.email || form.email || '').trim() || undefined,
      phone: formatPhoneInput(String(primaryContact.phone || form.phone || '').trim()) || undefined,
      company_email: form.company_email?.trim() || undefined,
      company_phone: formatPhoneInput((form.company_phone || '').trim()) || undefined,
      bio: form.bio?.trim() || undefined,
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
    const pe = String(primaryContact.email || form.email || '').trim();
    const pph = String(primaryContact.phone || form.phone || '').trim();
    if (pe && !isValidEmail(pe)) {
      setAlertModal({ isOpen: true, title: 'Invalid email', message: 'Primary contact email does not look valid.', variant: 'error' });
      return;
    }
    if (form.company_email?.trim() && !isValidEmail(form.company_email.trim())) {
      setAlertModal({ isOpen: true, title: 'Invalid email', message: 'Company email format is invalid.', variant: 'error' });
      return;
    }
    if (pph && !isValidPhoneLoose(pph)) {
      setAlertModal({
        isOpen: true,
        title: 'Invalid phone',
        message: 'Primary phone should include at least 10 digits.',
        variant: 'error',
      });
      return;
    }
    if (form.website?.trim() && !isValidUrlLoose(form.website)) {
      setAlertModal({ isOpen: true, title: 'Invalid website', message: 'Enter a valid website URL.', variant: 'error' });
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
        hydrateFormFromCrmLead(res.crm_lead);
      } else if (selectedId) {
        const res = await crmAPI.update(selectedId, payload);
        setDetail(res);
        hydrateFormFromCrmLead(res.crm_lead);
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

    const knownCompanyName = String(form.name || '').trim();
    const inferred = inferSingleImportRowFromUnstructuredText(
      profileImportText,
      CRM_STATUSES,
      CRM_COMPANY_TYPES,
      { includeDiagnostics: true, knownCompanyName },
    );
    const draft = buildImportDraftRows(profileImportText, CRM_STATUSES, CRM_COMPANY_TYPES, { knownCompanyName });
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
        job_title: '',
        extension: '',
      });
      const importedPrimary = normalizeContactEntry({
        name: row.contact_name,
        email: row.email,
        phone: row.phone,
      });
      const mergedContacts = importedPrimary
        ? [importedPrimary, ...existingContacts.slice(1)]
        : existingContacts;
      const incomingCompany = String(row.name || '').trim();
      const incomingCompanyIsContactShaped =
        Boolean(incomingCompany) &&
        (lineLooksLikeContactBlob(incomingCompany) || incomingCompany.includes('@'));
      const existingCompany = String(f.name || '').trim();
      const nextCompanyName =
        incomingCompanyIsContactShaped && existingCompany
          ? existingCompany
          : incomingCompany || existingCompany || '';
      return {
        ...f,
        name: nextCompanyName,
        contact_name: importedPrimary?.name || f.contact_name || '',
        email: importedPrimary?.email || f.email || '',
        phone: importedPrimary?.phone || f.phone || '',
        website: row.website || f.website || '',
        bio: (row.bio && String(row.bio).trim()) || f.bio || '',
        company_email: (row.company_email && String(row.company_email).trim()) || f.company_email || '',
        company_phone: row.company_phone && String(row.company_phone).trim() ? formatPhoneInput(String(row.company_phone).trim()) : f.company_phone || '',
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

  const openMergeModal = () => {
    const defaults = Object.fromEntries(CRM_MERGE_FIELDS.map((field) => [field.key, 'current']));
    setMergeFieldSources(defaults);
    setMergeOptions({
      combine_contacts: true,
      combine_company_types: true,
      combine_notes: true,
      combine_timeline_notes: true,
    });
    setMergeDirection('into_current');
    setMergeTargetId('');
    setMergeModalOpen(true);
  };

  const mergeRecord = async () => {
    if (!selectedId || !mergeTargetId) {
      setAlertModal({
        isOpen: true,
        title: 'Merge target required',
        message: 'Choose the CRM company record to merge with first.',
        variant: 'error',
      });
      return;
    }

    const target = leads.find((lead) => Number(lead.id) === Number(mergeTargetId));
    const currentLabel = form.name || c?.name || `CRM #${selectedId}`;
    const targetLabel = target?.name || `CRM #${mergeTargetId}`;
    const confirmText = mergeDirection === 'into_current'
      ? `Merge "${targetLabel}" into "${currentLabel}"? This deletes "${targetLabel}" after merge.`
      : `Merge "${currentLabel}" into "${targetLabel}"? This deletes "${currentLabel}" after merge.`;
    if (!window.confirm(confirmText)) return;

    setMergeSaving(true);
    try {
      const res = await crmAPI.merge(selectedId, {
        target_crm_lead_id: Number(mergeTargetId),
        merge_direction: mergeDirection,
        field_sources: mergeFieldSources,
        ...mergeOptions,
      });
      setDetail(res);
      setCrmNotes(res.crm_notes || []);
      const mergedLead = res.crm_lead;
      hydrateFormFromCrmLead(mergedLead);
      setSelectedId(mergedLead.id);
      setIsRecordEditing(false);
      setMergeModalOpen(false);
      await loadList();
      setAlertModal({
        isOpen: true,
        title: 'Merge complete',
        message: 'CRM company records were merged successfully.',
        variant: 'success',
      });
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Merge failed',
        message: e.message || 'Could not merge CRM records.',
        variant: 'error',
      });
    } finally {
      setMergeSaving(false);
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
        job_title: '',
        extension: '',
      });
      const first = contacts[0] || normalizeContactDraftEntry({});
      const socialKeys = ['instagram_url', 'facebook_url', 'linkedin_url'];
      if (socialKeys.includes(field)) {
        const nextContacts = [{ ...first, [field]: value }, ...contacts.slice(1)];
        return { ...f, contacts: nextContacts };
      }
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

  const updatePrimaryContactNamePart = (part, value) => {
    setForm((f) => {
      const contacts = editableContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
        job_title: '',
        extension: '',
      });
      const first = contacts[0] || normalizeContactDraftEntry({});
      const tokens = String(first.name || '').trim().split(/\s+/).filter(Boolean);
      const current = {
        firstName: tokens.length > 0 ? tokens[0] : '',
        lastName: tokens.length > 1 ? tokens.slice(1).join(' ') : '',
      };
      const next = { ...current, [part]: value };
      const combinedName = [next.firstName, next.lastName].filter(Boolean).join(' ').trim();
      const nextContacts = [{ ...first, name: combinedName }, ...contacts.slice(1)];
      return {
        ...f,
        contacts: nextContacts,
        contact_name: combinedName,
      };
    });
  };

  const addAdditionalContact = () => {
    setForm((f) => {
      const contacts = editableContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
        job_title: '',
        extension: '',
      });
      const baseContacts = contacts.length > 0 ? contacts : [normalizeContactDraftEntry({})];
      pendingAdditionalContactFocusIdx.current = baseContacts.length;
      return {
        ...f,
        contacts: [...baseContacts, normalizeContactDraftEntry({})],
      };
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
        job_title: '',
        extension: '',
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
        job_title: '',
        extension: '',
      });
      if (contactIdx <= 0 || contactIdx >= contacts.length) return f;
      return { ...f, contacts: contacts.filter((_, idx) => idx !== contactIdx) };
    });
  };

  const updateAdditionalContactNamePart = (contactIdx, part, value) => {
    setForm((f) => {
      const contacts = editableContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
        job_title: '',
        extension: '',
      });
      if (contactIdx <= 0 || contactIdx >= contacts.length) return f;

      const current = splitContactName(contacts[contactIdx]?.name);
      const next = {
        ...current,
        [part]: value,
      };
      const combinedName = [next.firstName, next.lastName].filter(Boolean).join(' ').trim();
      const nextContacts = contacts.map((contact, idx) =>
        idx === contactIdx ? { ...contact, name: combinedName } : contact,
      );
      return { ...f, contacts: nextContacts };
    });
  };

  const setPrimaryContactFromDirectory = (serializedContact) => {
    if (!serializedContact) return;
    try {
      const chosen = JSON.parse(serializedContact);
      setForm((f) => {
        const contacts = editableContacts(f.contacts, {
          name: f.contact_name || '',
          email: f.email || '',
          phone: f.phone || '',
          job_title: '',
          extension: '',
        });
        const first = contacts[0] || normalizeContactDraftEntry({});
        const nextPrimary = {
          ...first,
          name: String(chosen.name || '').trim(),
          email: String(chosen.email || '').trim(),
          phone: formatPhoneInput(String(chosen.phone || '').trim()),
          job_title: String(chosen.job_title || '').trim(),
          extension: String(chosen.extension || '').trim(),
        };
        return {
          ...f,
          contact_name: nextPrimary.name,
          email: nextPrimary.email,
          phone: nextPrimary.phone,
          contacts: [nextPrimary, ...contacts.slice(1)],
        };
      });
    } catch {
      // ignore malformed contact option payloads
    }
  };

  const updateContactSameAsCompany = (contactIdx, flagKey, checked) => {
    setForm((f) => {
      const contacts = editableContacts(f.contacts, {
        name: f.contact_name || '',
        email: f.email || '',
        phone: f.phone || '',
        job_title: '',
        extension: '',
      });
      if (contactIdx < 0 || contactIdx >= contacts.length) return f;
      const cur = contacts[contactIdx];
      const sac = normalizeSameAsCompany(cur.same_as_company);
      const nextSac = { ...sac, [flagKey]: Boolean(checked) };
      const nextContacts = contacts.map((c, idx) =>
        idx === contactIdx ? { ...c, same_as_company: nextSac } : c,
      );
      return { ...f, contacts: nextContacts };
    });
  };

  const withDuplicateMetadata = useCallback((rows) => {
    if (!rows.length) return [];

    const crmSignatureMap = new Map();
    leads.forEach((lead) => {
      buildCrmImportRowSignatures(lead).forEach((sig) => {
        const entries = crmSignatureMap.get(sig.key) || [];
        entries.push(sig.label);
        crmSignatureMap.set(sig.key, entries);
      });
    });

    const batchSignatureMap = new Map();
    rows.forEach((row, idx) => {
      buildCrmImportRowSignatures(row).forEach((sig) => {
        const entries = batchSignatureMap.get(sig.key) || [];
        entries.push(idx);
        batchSignatureMap.set(sig.key, entries);
      });
    });

    return rows.map((row) => {
      const duplicateReasons = [];
      buildCrmImportRowSignatures(row).forEach((sig) => {
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
    job_title: '',
    extension: '',
  });
  const platformCompanyUsers = useMemo(() => {
    const list = c?.platform_company_users;
    return Array.isArray(list) ? list : [];
  }, [c?.platform_company_users]);

  const crmContactsWithPlatformMatch = useMemo(() => {
    const matchedIds = new Set();
    const rows = displayContacts.map((contact, idx) => {
      const resolved = resolveContactForDisplay(contact, form);
      let platformUser = null;
      const lid = contact.linked_user_id;
      if (lid != null && lid !== '') {
        const n = Number(lid);
        if (Number.isFinite(n) && n > 0) {
          platformUser = platformCompanyUsers.find((u) => u.id === n) || null;
        }
      }
      if (!platformUser && resolved.email) {
        const em = resolved.email.trim().toLowerCase();
        platformUser = platformCompanyUsers.find((u) => u.email && String(u.email).trim().toLowerCase() === em) || null;
      }
      if (platformUser) matchedIds.add(platformUser.id);
      return { contact, idx, resolved, platformUser };
    });
    const orphanPlatform = platformCompanyUsers.filter((u) => !matchedIds.has(u.id));
    return { rows, orphanPlatform };
  }, [displayContacts, form, platformCompanyUsers]);

  const startAddCrmContactFromReadMode = useCallback(() => {
    setForm((f) => {
      const fb = { name: f.contact_name, email: f.email, phone: f.phone || '', job_title: '', extension: '' };
      const contacts = editableContacts(f.contacts, fb);
      const baseContacts = contacts.length > 0 ? contacts : [normalizeContactDraftEntry({})];
      return { ...f, contacts: [...baseContacts, normalizeContactDraftEntry({})] };
    });
    setIsRecordEditing(true);
    setTimeout(() => document.getElementById('crm-contacts-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, []);

  const openCreateCompanyLoginForContact = useCallback((idx, contact, resolved) => {
    if (!form.linked_company_profile_id) return;
    crmAddUserContactIdxRef.current = idx;
    setCrmAddUserPrefill({
      name: contact.name || '',
      email: resolved.email || contact.email || '',
      phone: resolved.phone || contact.phone || '',
    });
    setCrmContactUserModalOpen(true);
  }, [form.linked_company_profile_id]);

  const handleCrmContactUserModalCompleted = useCallback(
    async ({ kind, createdUser }) => {
      setCrmContactUserModalOpen(false);
      setCrmAddUserPrefill(null);
      if (kind !== 'company_link' || !createdUser?.id || selectedId == null) return;
      const idx = crmAddUserContactIdxRef.current;
      crmAddUserContactIdxRef.current = null;
      if (idx == null || idx < 0) {
        await loadDetail(selectedId);
        return;
      }
      const fb = { name: form.contact_name, email: form.email, phone: form.phone || '', job_title: '', extension: '' };
      const list = editableContacts(form.contacts, fb);
      const nextList = list.map((row, i) =>
        i === idx ? { ...row, linked_user_id: createdUser.id, email: row.email || createdUser.email || '' } : row,
      );
      const mergedForm = { ...form, contacts: nextList };
      const base = normalizeContacts(nextList, fb);
      const normalizedContacts = base.map((row) => resolveContactRowForPayload(row, mergedForm));
      try {
        await crmAPI.update(selectedId, {
          name: form.name?.trim(),
          contacts: normalizedContacts,
        });
        await loadDetail(selectedId);
      } catch (e) {
        setAlertModal({
          isOpen: true,
          title: 'Could not link contact',
          message: e.message || 'Update failed',
          variant: 'error',
        });
      }
    },
    [form, selectedId, loadDetail],
  );

  const primaryContactDraft = displayContacts[0] || normalizeContactDraftEntry({});
  const primarySameAs = normalizeSameAsCompany(primaryContactDraft.same_as_company);
  const normalizedFormState = normalizeToUsStateName(form.state || '');
  const stateSelectValue = US_STATES.includes(normalizedFormState) ? normalizedFormState : '';
  const fullAddress = [form.street_address, form.city, form.state, form.zip].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  const mapsAddressUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : '';
  const sidebarFilterPayload = useMemo(
    () => ({
      searchText: pipelineNameFilter,
      statusSelect: pipelineStatusFilter,
      quickPipeline: crmQuickPipeline,
      linkedFilter: crmLinkedFilter,
      hasNotes: crmHasNotesFilter,
      hasContact: crmHasContactFilter,
      hasPhone: crmHasPhoneFilter,
      dateRange: crmDateRange,
      market: crmMarketFilter,
      trade: crmTradeFilter,
    }),
    [
      pipelineNameFilter,
      pipelineStatusFilter,
      crmQuickPipeline,
      crmLinkedFilter,
      crmHasNotesFilter,
      crmHasContactFilter,
      crmHasPhoneFilter,
      crmDateRange,
      crmMarketFilter,
      crmTradeFilter,
    ],
  );

  const filteredLeads = useMemo(() => {
    const raw = filterSidebarLeads(leads, sidebarFilterPayload);
    return sortLeads(raw, crmSidebarSort);
  }, [leads, sidebarFilterPayload, crmSidebarSort]);

  const statsForHeader = useMemo(
    () => computeCrmStatsStrip(leads, { dateRange: crmDateRange, market: crmMarketFilter, trade: crmTradeFilter }),
    [leads, crmDateRange, crmMarketFilter, crmTradeFilter],
  );

  const lastListRefreshLabel = useMemo(() => {
    const ts = (Array.isArray(leads) ? leads : []).map((l) => new Date(l.updated_at || l.created_at || 0).getTime());
    const max = Math.max(0, ...ts);
    if (!max) return '';
    return formatDateTime(new Date(max).toISOString());
  }, [leads]);

  const exportVisibleCsv = () => {
    const csv = exportLeadsToCsv(filteredLeads);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `techflash-crm-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setAlertModal({
      isOpen: true,
      title: 'Export ready',
      message: `Downloaded ${filteredLeads.length} visible record(s).`,
      variant: 'success',
    });
  };

  const handleRailAction = (id) => {
    if (id === 'add_phone' || id === 'add_contact' || id === 'trade' || id === 'contact') {
      setIsRecordEditing(true);
      return;
    }
    if (id === 'provision_account') {
      openProvisionFromCrmRecord();
      return;
    }
    if (id === 'link') {
      setIsRecordEditing(true);
      setTimeout(() => document.getElementById('crm-link-platform')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    }
    if (id === 'first_job') {
      navigate('/create-job');
      return;
    }
    if (id === 'note') {
      setTimeout(() => document.getElementById('crm-notes-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      startAddNote();
      return;
    }
    if (id === 'call') {
      const tel = String(form.phone || form.company_phone || '').replace(/\D/g, '');
      if (tel) window.location.href = `tel:${tel}`;
      return;
    }
  };

  const pipelineDisplayGroups = useMemo(() => {
    const emitted = new Set();
    const out = [];
    filteredLeads.forEach((row) => {
      const pid = row.linked_company_profile_id;
      if (pid == null || pid === '') {
        out.push({ kind: 'single', lead: row });
        return;
      }
      const k = String(pid);
      if (emitted.has(k)) return;
      emitted.add(k);
      const groupLeads = filteredLeads.filter((r) => String(r.linked_company_profile_id) === k);
      if (groupLeads.length === 1) {
        out.push({ kind: 'single', lead: groupLeads[0] });
      } else {
        const displayName =
          groupLeads[0].linked_account?.company_name?.trim() ||
          groupLeads[0].name ||
          'Company';
        out.push({ kind: 'group', profileId: pid, displayName, leads: groupLeads });
      }
    });
    return out;
  }, [filteredLeads]);

  const togglePipelineGroupHeader = (group) => {
    const k = String(group.profileId);
    const next = !pipelineExpandedByProfileId[k];
    setPipelineExpandedByProfileId((prev) => ({ ...prev, [k]: next }));
    if (next) selectLead(group.leads[0].id);
  };

  const visiblePipelineColumns = useMemo(() => pipelineColumns.filter((c) => c.visible), [pipelineColumns]);

  const renderPipelineLeadMeta = (row) => {
    const pc = getPrimaryContactPreview(row);
    const nc = Number(row.notes_count) || 0;
    const warn = !pc.name && !pc.email ? 'text-amber-600' : 'text-slate-500';
    return (
      <div className="mt-1 space-y-1">
        {visiblePipelineColumns.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {visiblePipelineColumns.map((col) => {
              if (col.key === 'status') {
                return (
                  <span key={col.key} className="capitalize px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    {row.status}
                  </span>
                );
              }
              if (col.key === 'linked_account') {
                if (!row.linked_account) return null;
                return (
                  <span key={col.key} className="inline-flex items-center gap-1 text-emerald-700">
                    <FaLink className="text-emerald-600" aria-hidden /> Linked
                  </span>
                );
              }
              if (col.key === 'contact_email') {
                if (!row.email) return null;
                return <span key={col.key}>{row.email}</span>;
              }
              return null;
            })}
          </div>
        )}
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${warn}`}>
          <span className="font-medium text-slate-700">{pc.name || 'No contact'}</span>
          {(row.city || row.state) && (
            <span className="text-slate-400">
              · {String(row.city || '').trim()}
              {row.city && row.state ? ', ' : ''}
              {String(row.state || '').trim()}
            </span>
          )}
          <span className="text-slate-400">· {nc} notes</span>
          {!row.linked_account && <span className="text-amber-600 font-medium">· Unlinked</span>}
        </div>
      </div>
    );
  };

  const movePipelineColumn = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setPipelineColumns((prev) => {
      const fromIdx = prev.findIndex((c) => c.key === fromKey);
      const toIdx = prev.findIndex((c) => c.key === toKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const togglePipelineColumnVisible = (key) => {
    setPipelineColumns((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };

  const crmContactOptions = useMemo(() => {
    const unique = new Map();
    leads.forEach((lead) => {
      const normalized = normalizeContacts(lead.contacts, {
        name: lead.contact_name || '',
        email: lead.email || '',
        phone: '',
      });
      normalized.forEach((contact) => {
        const key = [
          String(contact.name || '').trim().toLowerCase(),
          String(contact.email || '').trim().toLowerCase(),
          String(contact.phone || '').replace(/\D/g, ''),
        ].join('|');
        if (!key || unique.has(key)) return;
        unique.set(key, {
          ...contact,
          company_name: lead.name || '',
        });
      });
    });
    return Array.from(unique.values());
  }, [leads]);
  const mergeTargetLead = leads.find((lead) => Number(lead.id) === Number(mergeTargetId));
  const currentMergeLead = {
    ...c,
    ...form,
    contacts: editableContacts(form.contacts, {
      name: form.contact_name || '',
      email: form.email || '',
      phone: '',
      job_title: '',
      extension: '',
    }),
  };

  const outreachSnapshot = useMemo(() => getOutreachSnapshot(crmNotes, c), [crmNotes, c]);
  const operationalInsights = useMemo(
    () =>
      getOperationalInsights({
        form,
        metrics,
        activity,
        isLinked: Boolean(form.linked_user_id || form.linked_company_profile_id),
        crmNotes,
      }),
    [form, metrics, activity, crmNotes],
  );
  const filteredTimelineNotes = useMemo(() => filterNotesForTimeline(crmNotes, timelineFilter), [crmNotes, timelineFilter]);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader user={user} onLogout={onLogout} activePage="crm" emailVariant="crm" />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <datalist id="crm-contact-job-titles">
          {CONTACT_JOB_TITLE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <CrmCommandHeader
          stats={statsForHeader}
          dateRange={crmDateRange}
          onDateRange={setCrmDateRange}
          market={crmMarketFilter}
          onMarket={setCrmMarketFilter}
          trade={crmTradeFilter}
          onTrade={setCrmTradeFilter}
          lastUpdatedLabel={lastListRefreshLabel}
          onImport={() => {
            setImportSummary(null);
            setPasteImportText('');
            setImportDraftRows([]);
            setImportRowFilter('all');
            setImportModalOpen(true);
          }}
          onAddCompany={openCreate}
          onCreatePlatform={() => {
            setNewCompanyModalOpen(false);
            setIsCreating(false);
            setProvisionMode('new');
            setCompanySearchQ('');
            setCompanyHits([]);
            setSelectedCompany(null);
            setProvisionModalOpen(true);
          }}
          onMerge={openMergeModal}
          onExport={exportVisibleCsv}
        />

        {(() => {
          const missingPhone = filteredLeads.filter((l) => {
            const p = [l.phone, l.company_phone, ...(l.contacts || []).map((c) => c.phone)].map((x) => String(x || '').trim()).filter(Boolean);
            return p.length === 0;
          }).length;
          const missingEmail = filteredLeads.filter((l) => {
            const e = [l.email, l.company_email, ...(l.contacts || []).map((c) => c.email)].map((x) => String(x || '').trim()).filter(Boolean);
            return e.length === 0;
          }).length;
          const unlinked = filteredLeads.filter((l) => !l.linked_user_id && !l.linked_company_profile_id).length;
          return (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-2">
              <span>
                <strong className="text-slate-800">In view — missing phone:</strong> {missingPhone}
              </span>
              <span>
                <strong className="text-slate-800">Missing email:</strong> {missingEmail}
              </span>
              <span>
                <strong className="text-slate-800">Unlinked:</strong> {unlinked}
              </span>
              <span className="text-slate-400">Filters apply to this prospect list and export.</span>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden xl:col-span-4">
            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 tracking-tight">Prospect command list</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">{filteredLeads.length} in view · {leads.length} total</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowPipelineColumnConfig((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-700"
                    >
                      <FaCog className="w-3.5 h-3.5" aria-hidden />
                      Columns
                    </button>
                  {showPipelineColumnConfig && (
                    <div className="absolute right-0 top-8 z-30 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
                      <div className="text-xs text-gray-500 mb-2">
                        Toggle visibility and drag to reorder pipeline fields.
                      </div>
                      <ul className="space-y-2 max-h-56 overflow-auto">
                        {pipelineColumns.map((col) => (
                          <li
                            key={col.key}
                            draggable
                            onDragStart={() => setDraggingPipelineColumnKey(col.key)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              movePipelineColumn(draggingPipelineColumnKey, col.key);
                              setDraggingPipelineColumnKey(null);
                            }}
                            className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2 py-1.5 bg-gray-50"
                          >
                            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={col.visible}
                                onChange={() => togglePipelineColumnVisible(col.key)}
                              />
                              <span>{col.label}</span>
                            </label>
                            <span className="text-gray-400 text-xs">drag</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CRM_QUICK_PIPELINE_FILTERS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setCrmQuickPipeline(chip.id);
                      if (CRM_STATUSES.includes(chip.id)) setPipelineStatusFilter('');
                    }}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                      crmQuickPipeline === chip.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase col-span-2">Sort</label>
                <select
                  value={crmSidebarSort}
                  onChange={(e) => setCrmSidebarSort(e.target.value)}
                  className="col-span-2 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-800"
                >
                  {CRM_SORT_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={crmLinkedFilter}
                  onChange={(e) => setCrmLinkedFilter(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="all">Linked: any</option>
                  <option value="linked">Linked only</option>
                  <option value="unlinked">Unlinked only</option>
                </select>
                <select
                  value={crmHasNotesFilter}
                  onChange={(e) => setCrmHasNotesFilter(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="all">Notes: any</option>
                  <option value="yes">Has notes</option>
                  <option value="no">No notes</option>
                </select>
                <select
                  value={crmHasContactFilter}
                  onChange={(e) => setCrmHasContactFilter(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="all">Contact: any</option>
                  <option value="yes">Has contact</option>
                  <option value="no">Missing contact</option>
                </select>
                <select
                  value={crmHasPhoneFilter}
                  onChange={(e) => setCrmHasPhoneFilter(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="all">Phone: any</option>
                  <option value="yes">Has phone</option>
                  <option value="no">Missing phone</option>
                </select>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <input
                  type="search"
                  value={pipelineNameFilter}
                  onChange={(e) => setPipelineNameFilter(e.target.value)}
                  placeholder="Search name, email, phone, city, trade…"
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
                <div className="p-4 space-y-3 animate-pulse" aria-busy="true">
                  {[1, 2, 3, 4, 5].map((k) => (
                    <div key={k} className="h-14 rounded-lg bg-slate-100" />
                  ))}
                </div>
              ) : pipelineDisplayGroups.length === 0 ? (
                <div className="p-8 text-center">
                  {leads.length === 0 ? (
                    <>
                      <p className="text-sm font-semibold text-slate-800">Start building your company pipeline</p>
                      <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
                        Import contractor lists, add local companies manually, create platform accounts, and track calls and follow-ups.
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white"
                          onClick={() => {
                            setImportSummary(null);
                            setPasteImportText('');
                            setImportDraftRows([]);
                            setImportRowFilter('all');
                            setImportModalOpen(true);
                          }}
                        >
                          Import prospects
                        </button>
                        <button type="button" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white" onClick={openCreate}>
                          Add company
                        </button>
                      </div>
                      <p className="mt-4 text-[10px] text-slate-400 font-mono break-all">
                        name,contact_name,email,phone,website,company_types,status,notes
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-slate-800">No companies match filters</p>
                      <p className="text-xs text-slate-500 mt-2">Try clearing search, pipeline chips, or advanced filters.</p>
                    </>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {pipelineDisplayGroups.map((item) => {
                    if (item.kind === 'single') {
                      const row = item.lead;
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => selectLead(row.id)}
                            className={`w-full text-left px-4 py-3 hover:bg-blue-50/60 transition-colors ${
                              selectedId === row.id && !isCreating ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'
                            }`}
                          >
                            <div className="font-medium text-gray-900">{row.name}</div>
                            {renderPipelineLeadMeta(row)}
                          </button>
                        </li>
                      );
                    }
                    const group = item;
                    const k = String(group.profileId);
                    const isExpanded = Boolean(pipelineExpandedByProfileId[k]);
                    const groupHasSelection = group.leads.some((l) => Number(l.id) === Number(selectedId));
                    return (
                      <li key={`grp-${k}`}>
                        <button
                          type="button"
                          onClick={() => togglePipelineGroupHeader(group)}
                          className={`w-full text-left px-4 py-3 hover:bg-blue-50/60 transition-colors ${
                            groupHasSelection && !isCreating ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 text-gray-500 mt-0.5" aria-hidden>
                              {isExpanded ? <FaChevronDown className="w-3 h-3" /> : <FaChevronRight className="w-3 h-3" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-gray-900">{group.displayName}</span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                  {group.leads.length} accounts
                                </span>
                              </div>
                              {!isExpanded && (
                                <p className="mt-1 text-xs text-gray-500">Click to expand and choose a linked account.</p>
                              )}
                            </div>
                          </div>
                        </button>
                        {isExpanded && (
                          <ul className="border-t border-gray-100 bg-slate-50/60">
                            {group.leads.map((row) => (
                              <li key={row.id}>
                                <button
                                  type="button"
                                  onClick={() => selectLead(row.id)}
                                  className={`w-full text-left pl-10 pr-4 py-2.5 text-sm hover:bg-blue-50/60 transition-colors ${
                                    selectedId === row.id && !isCreating ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'
                                  }`}
                                >
                                  <div className="font-medium text-gray-900">
                                    {row.linked_account?.email || row.email || row.name || `CRM #${row.id}`}
                                  </div>
                                  {renderPipelineLeadMeta(row)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="xl:col-span-5 space-y-6">
            {!selectedId && (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500">
                Select a company on the left or use the buttons above to add a CRM record or create a platform account.
              </div>
            )}

            {selectedId && !isCreating && (
              <CompanyRecordHeader
                form={form}
                detailLead={c}
                onCall={() => {
                  const tel = String(form.phone || form.company_phone || '').replace(/\D/g, '');
                  if (tel) window.location.href = `tel:${tel}`;
                }}
                onEmail={() => {
                  const e = String(form.email || form.company_email || '').trim();
                  if (e) window.location.href = `mailto:${e}`;
                }}
                onWebsite={() => {
                  const w = String(form.website || '').trim();
                  if (!w) return;
                  const u = /^https?:\/\//i.test(w) ? w : `https://${w}`;
                  window.open(u, '_blank', 'noopener,noreferrer');
                }}
                onAddNote={startAddNote}
                onEdit={() => setIsRecordEditing(true)}
                onMerge={openMergeModal}
                onDelete={removeRecord}
                onCreateJob={() => navigate('/create-job')}
                onCreatePlatformAccount={openProvisionFromCrmRecord}
                onLinkAccount={() => {
                  setIsRecordEditing(true);
                  setTimeout(() => document.getElementById('crm-link-platform')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
                onChangeStatus={() => {
                  setIsRecordEditing(true);
                  setTimeout(() => document.getElementById('crm-status-select')?.focus(), 50);
                }}
              />
            )}

            {selectedId && !isCreating && (
              <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Company record</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {isRecordEditing ? (
                        <span className="text-amber-700 font-semibold">Editing — save or cancel before leaving.</span>
                      ) : (
                        'Read mode — fields are display-only until you click Edit.'
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openMergeModal}
                      className="px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 text-sm font-medium"
                    >
                      Merge
                    </button>
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
                {detailLoading ? (
                  <div className="space-y-3 mb-6 animate-pulse" aria-busy="true">
                    <div className="h-10 bg-slate-100 rounded-xl" />
                    <div className="h-24 bg-slate-100 rounded-xl" />
                    <div className="h-32 bg-slate-100 rounded-xl" />
                  </div>
                ) : (
                  <div className="space-y-4 mb-6">
                    <PipelineStageTracker currentStatus={form.status} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Outreach snapshot</h3>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
                          <dt className="text-slate-500">First touch</dt>
                          <dd>{outreachSnapshot.firstContactDate ? formatDateTime(outreachSnapshot.firstContactDate) : '—'}</dd>
                          <dt className="text-slate-500">Last touch</dt>
                          <dd>{outreachSnapshot.lastContactDate ? formatDateTime(outreachSnapshot.lastContactDate) : '—'}</dd>
                          <dt className="text-slate-500">Calls / emails</dt>
                          <dd>
                            {outreachSnapshot.calls} / {outreachSnapshot.emails}
                          </dd>
                          <dt className="text-slate-500">Notes</dt>
                          <dd>{outreachSnapshot.notesCount}</dd>
                          <dt className="text-slate-500">Outreach status</dt>
                          <dd className="font-semibold">{outreachSnapshot.outreachStatus}</dd>
                        </dl>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Operational insight</h3>
                        {operationalInsights.length === 0 ? (
                          <p className="text-xs text-slate-500">No automated insights for this record yet.</p>
                        ) : (
                          <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700">
                            {operationalInsights.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {isRecordEditing ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                        onClick={() => setCrmCompanyInfoOpen((o) => !o)}
                      >
                        {crmCompanyInfoOpen ? (
                          <FaChevronDown className="text-gray-500 w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <FaChevronRight className="text-gray-500 w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-gray-900">Company information</span>
                      </button>
                      {crmCompanyInfoOpen && (
                        <div className="px-4 pb-4 pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/30">
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Company name *</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={form.name ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-gray-500 uppercase">Company email</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              type="email"
                              value={form.company_email ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, company_email: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-gray-500 uppercase">Company phone</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={form.company_phone ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, company_phone: formatPhoneInput(e.target.value) }))}
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Website</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={form.website ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                            <select
                              id="crm-status-select"
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize bg-white"
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
                          <div className="hidden sm:block" aria-hidden />
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Company bio</span>
                            <textarea
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[88px] bg-white"
                              value={form.bio ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Street address</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={form.street_address ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, street_address: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-gray-500 uppercase">City</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={form.city ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-gray-500 uppercase">State (US)</span>
                            <select
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={stateSelectValue}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, state: e.target.value ? normalizeToUsStateName(e.target.value) : '' }))
                              }
                            >
                              <option value="">Select state</option>
                              {US_STATES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-gray-500 uppercase">ZIP</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={form.zip ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                            />
                          </label>
                          <div className="hidden sm:block" aria-hidden />
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Instagram URL</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={form.instagram_url ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, instagram_url: e.target.value }))}
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">Facebook URL</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                              value={form.facebook_url ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, facebook_url: e.target.value }))}
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-gray-500 uppercase">LinkedIn URL</span>
                            <input
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
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
                              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[88px] bg-white"
                              value={form.notes ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                        onClick={() => setCrmUsersSectionOpen((o) => !o)}
                      >
                        {crmUsersSectionOpen ? (
                          <FaChevronDown className="text-gray-500 w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <FaChevronRight className="text-gray-500 w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-gray-900">Contacts &amp; platform users</span>
                      </button>
                      {crmUsersSectionOpen && (
                        <div id="crm-contacts-editor" className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-4 bg-slate-50/30">
                          <div className="rounded-lg border border-gray-200 p-3 bg-white space-y-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase">Primary contact</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">First name</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                  value={splitContactName(form.contact_name).firstName}
                                  onChange={(e) => updatePrimaryContactNamePart('firstName', e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">Last name</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                  value={splitContactName(form.contact_name).lastName}
                                  onChange={(e) => updatePrimaryContactNamePart('lastName', e.target.value)}
                                />
                              </label>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={primarySameAs.email}
                                  onChange={(e) => updateContactSameAsCompany(0, 'email', e.target.checked)}
                                />
                                Same as company email
                              </label>
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={primarySameAs.phone}
                                  onChange={(e) => updateContactSameAsCompany(0, 'phone', e.target.checked)}
                                />
                                Same as company phone
                              </label>
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={primarySameAs.socials}
                                  onChange={(e) => updateContactSameAsCompany(0, 'socials', e.target.checked)}
                                />
                                Same as company socials
                              </label>
                            </div>
                            {(primarySameAs.email || primarySameAs.phone || primarySameAs.socials) && (
                              <p className="text-xs text-gray-500 -mt-1">
                                When enabled, fields follow the company values above; the saved CRM record stores the
                                resolved values.
                              </p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">Email</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600"
                                  type="email"
                                  disabled={primarySameAs.email}
                                  value={primarySameAs.email ? (form.company_email ?? '') : (form.email ?? '')}
                                  onChange={(e) => updatePrimaryContactField('email', e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">Phone</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600"
                                  disabled={primarySameAs.phone}
                                  value={primarySameAs.phone ? (form.company_phone ?? '') : (form.phone ?? '')}
                                  onChange={(e) => updatePrimaryContactField('phone', e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">Extension</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                  value={primaryContactDraft.extension || ''}
                                  onChange={(e) => updatePrimaryContactField('extension', e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">Job title</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                  list="crm-contact-job-titles"
                                  value={primaryContactDraft.job_title || ''}
                                  onChange={(e) => updatePrimaryContactField('job_title', e.target.value)}
                                />
                              </label>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">Instagram URL</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600"
                                  disabled={primarySameAs.socials}
                                  value={
                                    primarySameAs.socials ? (form.instagram_url ?? '') : (primaryContactDraft.instagram_url || '')
                                  }
                                  onChange={(e) => updatePrimaryContactField('instagram_url', e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">Facebook URL</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600"
                                  disabled={primarySameAs.socials}
                                  value={
                                    primarySameAs.socials ? (form.facebook_url ?? '') : (primaryContactDraft.facebook_url || '')
                                  }
                                  onChange={(e) => updatePrimaryContactField('facebook_url', e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-gray-500 uppercase">LinkedIn URL</span>
                                <input
                                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600"
                                  disabled={primarySameAs.socials}
                                  value={
                                    primarySameAs.socials ? (form.linkedin_url ?? '') : (primaryContactDraft.linkedin_url || '')
                                  }
                                  onChange={(e) => updatePrimaryContactField('linkedin_url', e.target.value)}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-gray-500 uppercase">Additional contacts</span>
                            </div>
                            {displayContacts.slice(1).map((contact, idx) => {
                              const contactIndex = idx + 1;
                              const sac = normalizeSameAsCompany(contact.same_as_company);
                              const splitName = splitContactName(contact.name);
                              return (
                                <details
                                  key={`extra-contact-${contactIndex}`}
                                  className="mt-3 rounded-lg border border-gray-200 bg-white overflow-hidden group"
                                  open={idx === 0}
                                >
                                  <summary className="list-none flex flex-wrap items-center justify-between gap-2 px-3 py-2 cursor-pointer text-xs font-semibold text-gray-600 uppercase bg-gray-50 border-b border-gray-100 hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
                                    <span className="select-none">
                                      {contact.name?.trim() || `Contact ${contactIndex + 1}`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        removeAdditionalContact(contactIndex);
                                      }}
                                      className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 normal-case font-medium"
                                    >
                                      Remove
                                    </button>
                                  </summary>
                                  <div className="p-3 space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                                      placeholder="First name"
                                      value={splitName.firstName}
                                      ref={focusAdditionalContactNameInput(contactIndex)}
                                      onChange={(e) => updateAdditionalContactNamePart(contactIndex, 'firstName', e.target.value)}
                                    />
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                                      placeholder="Last name"
                                      value={splitName.lastName}
                                      onChange={(e) => updateAdditionalContactNamePart(contactIndex, 'lastName', e.target.value)}
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={sac.email}
                                        onChange={(e) => updateContactSameAsCompany(contactIndex, 'email', e.target.checked)}
                                      />
                                      Same as company email
                                    </label>
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={sac.phone}
                                        onChange={(e) => updateContactSameAsCompany(contactIndex, 'phone', e.target.checked)}
                                      />
                                      Same as company phone
                                    </label>
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={sac.socials}
                                        onChange={(e) => updateContactSameAsCompany(contactIndex, 'socials', e.target.checked)}
                                      />
                                      Same as company socials
                                    </label>
                                  </div>
                                  {(sac.email || sac.phone || sac.socials) && (
                                    <p className="text-xs text-gray-500">
                                      When enabled, fields follow company values; the saved record stores resolved
                                      values.
                                    </p>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100"
                                      placeholder="Email"
                                      type="email"
                                      disabled={sac.email}
                                      value={sac.email ? (form.company_email ?? '') : (contact.email || '')}
                                      onChange={(e) => updateAdditionalContactField(contactIndex, 'email', e.target.value)}
                                    />
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100"
                                      placeholder="Phone"
                                      disabled={sac.phone}
                                      value={sac.phone ? (form.company_phone ?? '') : (contact.phone || '')}
                                      onChange={(e) => updateAdditionalContactField(contactIndex, 'phone', e.target.value)}
                                    />
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                                      placeholder="Extension"
                                      value={contact.extension || ''}
                                      onChange={(e) => updateAdditionalContactField(contactIndex, 'extension', e.target.value)}
                                    />
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                                      placeholder="Job title"
                                      value={contact.job_title || ''}
                                      onChange={(e) => updateAdditionalContactField(contactIndex, 'job_title', e.target.value)}
                                    />
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100"
                                      placeholder="Instagram URL"
                                      disabled={sac.socials}
                                      value={sac.socials ? (form.instagram_url ?? '') : (contact.instagram_url || '')}
                                      onChange={(e) => updateAdditionalContactField(contactIndex, 'instagram_url', e.target.value)}
                                    />
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100"
                                      placeholder="Facebook URL"
                                      disabled={sac.socials}
                                      value={sac.socials ? (form.facebook_url ?? '') : (contact.facebook_url || '')}
                                      onChange={(e) => updateAdditionalContactField(contactIndex, 'facebook_url', e.target.value)}
                                    />
                                    <input
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100"
                                      placeholder="LinkedIn URL"
                                      disabled={sac.socials}
                                      value={sac.socials ? (form.linkedin_url ?? '') : (contact.linkedin_url || '')}
                                      onChange={(e) => updateAdditionalContactField(contactIndex, 'linkedin_url', e.target.value)}
                                    />
                                  </div>
                                  </div>
                                </details>
                              );
                            })}
                            {displayContacts.length <= 1 && (
                              <p className="mt-2 text-xs text-gray-500">No additional contacts yet.</p>
                            )}
                            <button
                              type="button"
                              onClick={addAdditionalContact}
                              className="mt-2 text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              Add contact
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <details className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm" open>
                      <summary className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-slate-50 list-none [&::-webkit-details-marker]:hidden">
                        <FaChevronDown className="text-gray-500 w-3.5 h-3.5 shrink-0" />
                        Company information
                      </summary>
                      <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase">Company name</div>
                          <div className="mt-1 text-sm text-gray-900 font-medium">{form.name || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase">Status</div>
                          <div className="mt-1">
                            <CrmStatusBadge status={form.status} />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase">Company email</div>
                          <div className="mt-1 text-sm text-gray-900">
                            {form.company_email ? (
                              <a href={`mailto:${form.company_email}`} className="text-blue-700 hover:underline break-all">
                                {form.company_email}
                              </a>
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase">Company phone</div>
                          <div className="mt-1 text-sm text-gray-900">{form.company_phone || '—'}</div>
                        </div>
                        <div className="md:col-span-2">
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
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>
                        {form.bio ? (
                          <div className="md:col-span-2">
                            <div className="text-xs font-medium text-gray-500 uppercase">Company bio</div>
                            <CrmBioReadMore text={form.bio} className="mt-1" />
                          </div>
                        ) : null}
                        <div className="md:col-span-2">
                          <div className="text-xs font-medium text-gray-500 uppercase">Company address</div>
                          <div className="mt-1 text-sm text-gray-900">
                            {fullAddress ? (
                              <a href={mapsAddressUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-words">
                                {fullAddress}
                              </a>
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <div className="text-xs font-medium text-gray-500 uppercase">Social</div>
                          <div className="mt-1 text-sm text-gray-900 space-y-1">
                            <div>Instagram: {form.instagram_url || '—'}</div>
                            <div>Facebook: {form.facebook_url || '—'}</div>
                            <div>LinkedIn: {form.linkedin_url || '—'}</div>
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <div className="text-xs font-medium text-gray-500 uppercase">Company types</div>
                          <div className="mt-1">
                            <CompanyTypeBadges types={form.company_types} />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <div className="text-xs font-medium text-gray-500 uppercase">Notes</div>
                          <div className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{form.notes || '—'}</div>
                        </div>
                      </div>
                      </div>
                    </details>

                    <details className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm" open>
                      <summary className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-slate-50 list-none [&::-webkit-details-marker]:hidden">
                        <FaChevronDown className="text-gray-500 w-3.5 h-3.5 shrink-0" />
                        Contacts &amp; platform users
                      </summary>
                      <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-white" id="crm-contacts-section">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <p className="text-xs text-gray-500 max-w-xl">
                            {form.linked_company_profile_id
                              ? 'CRM contacts and live company logins for this linked account.'
                              : 'CRM contacts. Link this record to a company to create additional platform logins from here.'}
                          </p>
                          <button
                            type="button"
                            onClick={startAddCrmContactFromReadMode}
                            className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                          >
                            <FaPlus className="h-3 w-3" aria-hidden />
                            Add contact
                          </button>
                        </div>
                        {crmContactsWithPlatformMatch.rows.length === 0 &&
                        crmContactsWithPlatformMatch.orphanPlatform.length === 0 ? (
                          <div className="text-sm text-gray-500">No contacts yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {crmContactsWithPlatformMatch.rows.map(({ contact, idx, resolved, platformUser }) => {
                              const sac = resolved.same_as_company;
                              const flags = [sac.email && 'company email', sac.phone && 'company phone', sac.socials && 'company socials']
                                .filter(Boolean)
                                .join(', ');
                              const displayName =
                                [platformUser?.first_name, platformUser?.last_name].filter(Boolean).join(' ').trim() ||
                                contact.name ||
                                `Contact ${idx + 1}`;
                              return (
                                <details
                                  key={`view-contact-${idx}`}
                                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                                  open={idx === 0}
                                >
                                  <summary className="list-none cursor-pointer flex flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                                    <span className="text-sm font-medium text-gray-900 min-w-0 break-words">{displayName}</span>
                                    <span className="flex flex-wrap items-center gap-2 shrink-0">
                                      {platformUser ? (
                                        <Link
                                          to={`/admin/users/${platformUser.id}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-xs font-semibold text-blue-700 hover:underline"
                                        >
                                          User profile
                                        </Link>
                                      ) : (
                                        <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                          No platform login
                                        </span>
                                      )}
                                    </span>
                                  </summary>
                                  <div className="mt-2 space-y-2 text-sm">
                                    {flags ? <div className="text-xs text-gray-500">Uses {flags}.</div> : null}
                                    {contact.name && contact.name !== displayName ? (
                                      <div className="text-xs text-gray-600">
                                        CRM name: <span className="font-medium text-gray-800">{contact.name}</span>
                                      </div>
                                    ) : null}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <div>
                                        <span className="text-gray-500">Email:</span>{' '}
                                        {resolved.email ? (
                                          <a href={`mailto:${resolved.email}`} className="text-blue-700 hover:underline break-words">
                                            {resolved.email}
                                          </a>
                                        ) : (
                                          '—'
                                        )}
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Phone:</span> {resolved.phone || '—'}
                                      </div>
                                      {contact.job_title ? (
                                        <div>
                                          <span className="text-gray-500">Job title:</span> {contact.job_title}
                                        </div>
                                      ) : null}
                                      {contact.extension ? (
                                        <div>
                                          <span className="text-gray-500">Extension:</span> {contact.extension}
                                        </div>
                                      ) : null}
                                    </div>
                                    {!platformUser && form.linked_company_profile_id ? (
                                      <button
                                        type="button"
                                        onClick={() => openCreateCompanyLoginForContact(idx, contact, resolved)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                      >
                                        <FaUserPlus className="h-3 w-3" aria-hidden />
                                        Create company login
                                      </button>
                                    ) : null}
                                    {!platformUser && !form.linked_company_profile_id ? (
                                      <p className="text-xs text-gray-500">
                                        Link this CRM record to a company (below) to create a platform login for this person.
                                      </p>
                                    ) : null}
                                    <div className="grid grid-cols-1 gap-1 text-sm">
                                      <div>
                                        <span className="text-gray-500">Instagram:</span>{' '}
                                        {resolved.instagram_url ? (
                                          <a
                                            href={resolved.instagram_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-700 hover:underline break-all"
                                          >
                                            {resolved.instagram_url}
                                          </a>
                                        ) : (
                                          '—'
                                        )}
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Facebook:</span>{' '}
                                        {resolved.facebook_url ? (
                                          <a
                                            href={resolved.facebook_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-700 hover:underline break-all"
                                          >
                                            {resolved.facebook_url}
                                          </a>
                                        ) : (
                                          '—'
                                        )}
                                      </div>
                                      <div>
                                        <span className="text-gray-500">LinkedIn:</span>{' '}
                                        {resolved.linkedin_url ? (
                                          <a
                                            href={resolved.linkedin_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-700 hover:underline break-all"
                                          >
                                            {resolved.linkedin_url}
                                          </a>
                                        ) : (
                                          '—'
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </details>
                              );
                            })}
                            {crmContactsWithPlatformMatch.orphanPlatform.map((u) => (
                              <div
                                key={`orphan-platform-${u.id}`}
                                className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2"
                              >
                                <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
                                  Company login (not in CRM contacts)
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-900 break-words">
                                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || `User #${u.id}`}
                                    </div>
                                    <div className="text-xs text-gray-600 break-all">{u.email}</div>
                                  </div>
                                  <Link
                                    to={`/admin/users/${u.id}`}
                                    className="text-xs font-semibold text-blue-700 hover:underline shrink-0"
                                  >
                                    User profile
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}

                <div id="crm-link-platform" className="mt-6 pt-6 border-t border-slate-100">
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
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Unlink this CRM record from the platform company account? This does not delete the company account on TechFlash.',
                            )
                          ) {
                            return;
                          }
                          setForm((f) => ({ ...f, linked_user_id: null, linked_company_profile_id: null }));
                        }}
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
              <div id="crm-notes-section" className="bg-white rounded-2xl shadow border border-gray-100 p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Activity &amp; notes</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-gray-500 flex items-center gap-1">
                      Filter
                      <select
                        value={timelineFilter}
                        onChange={(e) => setTimelineFilter(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
                      >
                        <option value="all">All activity</option>
                        <option value="calls">Calls</option>
                        <option value="emails">Emails</option>
                        <option value="notes">Notes</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={startAddNote}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                    >
                      <FaPlus className="w-3.5 h-3.5" /> Add note
                    </button>
                  </div>
                </div>

                {noteComposerOpen ? (
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50 mb-4">
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="text-[10px] font-semibold uppercase text-gray-500 w-full">Quick templates</span>
                    {CRM_NOTE_QUICK_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-50"
                        onClick={() =>
                          setNoteDraft((n) => ({
                            ...n,
                            contact_method: tpl.method,
                            title: tpl.title,
                            body: tpl.body,
                          }))
                        }
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
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
                  <p className="text-sm text-gray-500">No notes yet. Click &quot;Add note&quot; to log the first activity.</p>
                ) : filteredTimelineNotes.length === 0 ? (
                  <p className="text-sm text-gray-500">No items match this filter.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredTimelineNotes.map((note) => {
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

          {selectedId && !isCreating ? (
            <div className="hidden xl:block xl:col-span-3">
              <CrmRightRail
                form={form}
                metrics={metrics}
                crmNotesLength={crmNotes.length}
                isLinked={Boolean(form.linked_user_id || form.linked_company_profile_id)}
                onAction={handleRailAction}
              />
            </div>
          ) : null}
        </div>

        {profileImportOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-profile-import-title"
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-xl w-full overflow-hidden">
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
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
                  <div className="sm:col-span-2">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Company info</h3>
                  </div>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company name *</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company email</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      type="email"
                      value={form.company_email ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, company_email: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company phone</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={form.company_phone ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, company_phone: formatPhoneInput(e.target.value) }))}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Company bio</span>
                    <textarea
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[72px]"
                      value={form.bio ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
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
                  <div className="hidden sm:block" aria-hidden />
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
                  <div className="sm:col-span-2 border-t border-gray-100 pt-4 mt-1">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Primary contact</h3>
                    <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="primary-contact-mode"
                          checked={form.primary_contact_mode !== 'existing'}
                          onChange={() => setForm((f) => ({ ...f, primary_contact_mode: 'new' }))}
                        />
                        New contact
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="primary-contact-mode"
                          checked={form.primary_contact_mode === 'existing'}
                          onChange={() => setForm((f) => ({ ...f, primary_contact_mode: 'existing' }))}
                        />
                        Use existing CRM contact
                      </label>
                    </div>
                    {form.primary_contact_mode === 'existing' && (
                      <label className="block mb-3">
                        <span className="text-xs font-medium text-gray-500 uppercase">Select existing contact</span>
                        <select
                          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          defaultValue=""
                          onChange={(e) => setPrimaryContactFromDirectory(e.target.value)}
                        >
                          <option value="">Choose a contact…</option>
                          {crmContactOptions.map((contact, idx) => (
                            <option key={`${contact.name}-${contact.email}-${idx}`} value={JSON.stringify(contact)}>
                              {[contact.name || 'Unnamed', contact.company_name ? `(${contact.company_name})` : '', contact.email || contact.phone || '']
                                .filter(Boolean)
                                .join(' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">First name</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={splitContactName(form.contact_name).firstName}
                      onChange={(e) => updatePrimaryContactNamePart('firstName', e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Last name</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={splitContactName(form.contact_name).lastName}
                      onChange={(e) => updatePrimaryContactNamePart('lastName', e.target.value)}
                    />
                  </label>
                  <div className="sm:col-span-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={primarySameAs.email}
                        onChange={(e) => updateContactSameAsCompany(0, 'email', e.target.checked)}
                      />
                      Same as company email
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={primarySameAs.phone}
                        onChange={(e) => updateContactSameAsCompany(0, 'phone', e.target.checked)}
                      />
                      Same as company phone
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={primarySameAs.socials}
                        onChange={(e) => updateContactSameAsCompany(0, 'socials', e.target.checked)}
                      />
                      Same as company socials
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Email</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600"
                      type="email"
                      disabled={primarySameAs.email}
                      value={primarySameAs.email ? (form.company_email ?? '') : (form.email ?? '')}
                      onChange={(e) => updatePrimaryContactField('email', e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Personal phone</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600"
                      disabled={primarySameAs.phone}
                      value={primarySameAs.phone ? (form.company_phone ?? '') : (form.phone ?? '')}
                      onChange={(e) => updatePrimaryContactField('phone', e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Extension</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={primaryContactDraft.extension || ''}
                      onChange={(e) => updatePrimaryContactField('extension', e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Job title</span>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={primaryContactDraft.job_title || ''}
                      onChange={(e) => updatePrimaryContactField('job_title', e.target.value)}
                    />
                  </label>
                  <div className="sm:col-span-2 grid grid-cols-1 gap-2">
                    <input
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
                      placeholder="Instagram URL"
                      disabled={primarySameAs.socials}
                      value={primarySameAs.socials ? (form.instagram_url ?? '') : (primaryContactDraft.instagram_url || '')}
                      onChange={(e) => updatePrimaryContactField('instagram_url', e.target.value)}
                    />
                    <input
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
                      placeholder="Facebook URL"
                      disabled={primarySameAs.socials}
                      value={primarySameAs.socials ? (form.facebook_url ?? '') : (primaryContactDraft.facebook_url || '')}
                      onChange={(e) => updatePrimaryContactField('facebook_url', e.target.value)}
                    />
                    <input
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
                      placeholder="LinkedIn URL"
                      disabled={primarySameAs.socials}
                      value={primarySameAs.socials ? (form.linkedin_url ?? '') : (primaryContactDraft.linkedin_url || '')}
                      onChange={(e) => updatePrimaryContactField('linkedin_url', e.target.value)}
                    />
                  </div>
                  <div className="block sm:col-span-2 rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Additional contacts</span>
                    </div>
                    {editableContacts(form.contacts, { name: form.contact_name, email: form.email, phone: form.phone || '' })
                      .slice(1)
                      .map((contact, idx) => {
                        const contactIndex = idx + 1;
                        const splitName = splitContactName(contact.name);
                        return (
                          <div key={`new-extra-contact-${contactIndex}`} className="mt-2 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                            <input
                              className="sm:col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              placeholder="First name"
                              value={splitName.firstName}
                              ref={focusAdditionalContactNameInput(contactIndex)}
                              onChange={(e) => updateAdditionalContactNamePart(contactIndex, 'firstName', e.target.value)}
                            />
                            <input
                              className="sm:col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              placeholder="Last name"
                              value={splitName.lastName}
                              onChange={(e) => updateAdditionalContactNamePart(contactIndex, 'lastName', e.target.value)}
                            />
                            <input
                              className="sm:col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              placeholder="Email"
                              value={contact.email || ''}
                              onChange={(e) => updateAdditionalContactField(contactIndex, 'email', e.target.value)}
                            />
                            <input
                              className="sm:col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              placeholder="Phone"
                              value={contact.phone || ''}
                              onChange={(e) => updateAdditionalContactField(contactIndex, 'phone', e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => removeAdditionalContact(contactIndex)}
                              className="sm:col-span-1 h-[34px] px-2 rounded border border-red-300 text-red-700 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    {editableContacts(form.contacts, { name: form.contact_name, email: form.email, phone: form.phone || '' }).length <= 1 && (
                      <p className="mt-2 text-xs text-gray-500">No additional contacts yet.</p>
                    )}
                    <button
                      type="button"
                      onClick={addAdditionalContact}
                      className="mt-2 text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                    >
                      Add contact
                    </button>
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
                    <span className="text-xs font-medium text-gray-500 uppercase">State (US)</span>
                    <select
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={stateSelectValue}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, state: e.target.value ? normalizeToUsStateName(e.target.value) : '' }))
                      }
                    >
                      <option value="">Select state</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
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
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Unlink this CRM record from the platform company account? This does not delete the company account on TechFlash.',
                            )
                          ) {
                            return;
                          }
                          setForm((f) => ({ ...f, linked_user_id: null, linked_company_profile_id: null }));
                        }}
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

        {mergeModalOpen && selectedId ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-merge-title"
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
                <h2 id="crm-merge-title" className="text-lg font-semibold text-gray-900">Merge CRM companies</h2>
                <button
                  type="button"
                  disabled={mergeSaving}
                  onClick={() => setMergeModalOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label="Close"
                >
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Merge direction</span>
                    <select
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={mergeDirection}
                      onChange={(e) => setMergeDirection(e.target.value)}
                    >
                      <option value="into_current">Keep current record (delete selected)</option>
                      <option value="into_target">Keep selected record (delete current)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 uppercase">Merge with record</span>
                    <select
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={mergeTargetId}
                      onChange={(e) => setMergeTargetId(e.target.value)}
                    >
                      <option value="">Select CRM record</option>
                      {leads.filter((lead) => Number(lead.id) !== Number(selectedId)).map((lead) => (
                        <option key={lead.id} value={String(lead.id)}>
                          {lead.name || `CRM #${lead.id}`} (ID {lead.id})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={mergeOptions.combine_contacts}
                      onChange={(e) => setMergeOptions((prev) => ({ ...prev, combine_contacts: e.target.checked }))}
                    />
                    Combine contacts
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={mergeOptions.combine_company_types}
                      onChange={(e) => setMergeOptions((prev) => ({ ...prev, combine_company_types: e.target.checked }))}
                    />
                    Combine company types
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={mergeOptions.combine_notes}
                      onChange={(e) => setMergeOptions((prev) => ({ ...prev, combine_notes: e.target.checked }))}
                    />
                    Combine notes field
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={mergeOptions.combine_timeline_notes}
                      onChange={(e) => setMergeOptions((prev) => ({ ...prev, combine_timeline_notes: e.target.checked }))}
                    />
                    Combine timeline notes
                  </label>
                </div>

                {mergeTargetLead ? (
                  <div className="rounded-lg border border-gray-200 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 text-left">Field</th>
                          <th className="px-2 py-2 text-left">Current ({currentMergeLead.name || `#${selectedId}`})</th>
                          <th className="px-2 py-2 text-left">Selected ({mergeTargetLead.name || `#${mergeTargetLead.id}`})</th>
                          <th className="px-2 py-2 text-left">Use</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CRM_MERGE_FIELDS.map((field) => (
                          <tr key={field.key} className="border-t border-gray-100 align-top">
                            <td className="px-2 py-2 font-medium text-gray-800">{field.label}</td>
                            <td className="px-2 py-2 text-gray-700 break-words">{mergeFieldDisplayValue(currentMergeLead, field.key)}</td>
                            <td className="px-2 py-2 text-gray-700 break-words">{mergeFieldDisplayValue(mergeTargetLead, field.key)}</td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-2">
                                <label className="inline-flex items-center gap-1">
                                  <input
                                    type="radio"
                                    name={`merge-source-${field.key}`}
                                    checked={mergeFieldSources[field.key] === 'current'}
                                    onChange={() => setMergeFieldSources((prev) => ({ ...prev, [field.key]: 'current' }))}
                                  />
                                  Current
                                </label>
                                <label className="inline-flex items-center gap-1">
                                  <input
                                    type="radio"
                                    name={`merge-source-${field.key}`}
                                    checked={mergeFieldSources[field.key] === 'selected'}
                                    onChange={() => setMergeFieldSources((prev) => ({ ...prev, [field.key]: 'selected' }))}
                                  />
                                  Selected
                                </label>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Pick a target CRM record to configure field-level merge choices.</p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  disabled={mergeSaving}
                  onClick={() => setMergeModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={mergeSaving || !mergeTargetId}
                  onClick={mergeRecord}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {mergeSaving ? 'Merging…' : 'Merge CRM records'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <AdminCreateUserModal
        isOpen={crmContactUserModalOpen}
        onClose={() => {
          setCrmContactUserModalOpen(false);
          setCrmAddUserPrefill(null);
          crmAddUserContactIdxRef.current = null;
        }}
        presetCompanyProfile={
          form.linked_company_profile_id
            ? {
                id: form.linked_company_profile_id,
                company_name: form.name,
                company_users_count: platformCompanyUsers.length,
              }
            : null
        }
        prefillContact={crmAddUserPrefill}
        onCompleted={handleCrmContactUserModalCompleted}
        onError={(msg) =>
          setAlertModal({
            isOpen: true,
            title: 'Create user',
            message: msg,
            variant: 'error',
          })
        }
      />

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
