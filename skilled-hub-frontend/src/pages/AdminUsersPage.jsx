import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { adminUsersAPI, adminLocationAPI } from '../api/api';
import AlertModal from '../components/AlertModal';
import { FaBuilding, FaSearch, FaTimes, FaUserPlus, FaWrench } from 'react-icons/fa';

const ROLE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'company', label: 'Companies' },
  { id: 'technician', label: 'Technicians' },
];

/** Canonical labels; matching is case-insensitive (hvac → HVAC). */
const CANONICAL_INDUSTRIES = [
  'HVAC',
  'Plumbing',
  'Electrical',
  'General Contracting',
  'Construction',
  'Commercial',
  'Residential',
  'Roofing',
  'Landscaping',
  'Painting',
  'Carpentry',
  'Welding',
  'Masonry',
  'Concrete',
  'Solar',
  'Pool & Spa',
  'Restoration',
  'Handyman',
  'Mechanical',
  'Fire Protection',
  'Low Voltage',
  'Demolition',
  'Excavation',
];

function resolveIndustryToken(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = CANONICAL_INDUSTRIES.find((o) => o.toLowerCase() === q);
  if (exact) return exact;
  const starts = CANONICAL_INDUSTRIES.find((o) => o.toLowerCase().startsWith(q));
  if (starts) return starts;
  return CANONICAL_INDUSTRIES.find((o) => o.toLowerCase().includes(q)) || null;
}

function filterIndustrySuggestions(query, selected) {
  const taken = new Set(selected.map((s) => s.toLowerCase()));
  const q = query.trim().toLowerCase();
  const pool = CANONICAL_INDUSTRIES.filter((opt) => !taken.has(opt.toLowerCase()));
  if (!q) return pool.slice(0, 14);
  return pool
    .filter((opt) => {
      const ol = opt.toLowerCase();
      return ol.includes(q) || ol.startsWith(q);
    })
    .slice(0, 14);
}

function IndustryMultiSelect({ value, onChange, inputId }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const suggestions = useMemo(() => filterIndustrySuggestions(query, value), [query, value]);

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const add = (label) => {
    if (!label) return;
    if (value.some((v) => v.toLowerCase() === label.toLowerCase())) return;
    onChange([...value, label]);
    setQuery('');
    setOpen(false);
  };

  const remove = (label) => {
    onChange(value.filter((v) => v !== label));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const resolved = resolveIndustryToken(query);
      if (resolved) add(resolved);
      else if (suggestions[0]) add(suggestions[0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && value.length) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div ref={wrapRef} className="relative mt-1">
      <div className="flex flex-wrap gap-1.5 items-center min-h-[42px] w-full border border-gray-300 rounded-lg px-2 py-1.5 focus-within:ring-2 focus-within:ring-[#3A7CA5] focus-within:border-[#3A7CA5] bg-white">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-900 text-sm pl-2.5 pr-1 py-0.5 border border-sky-200/90 max-w-full"
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              className="shrink-0 p-0.5 rounded-full hover:bg-sky-200/80 text-sky-800"
              onClick={() => remove(tag)}
              aria-label={`Remove ${tag}`}
            >
              <FaTimes className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          className="flex-1 min-w-[10rem] border-0 focus:ring-0 text-sm py-1 text-[#2E2E2E] placeholder:text-gray-400"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? 'Add another industry…' : 'Type e.g. hvac, plumbing…'}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-30 mt-1 w-full max-h-52 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm py-1"
          role="listbox"
        >
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-sky-50 text-gray-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** US cities via admin API (OpenStreetMap Nominatim); values are always "City, ST" from the dropdown only. */
function ServiceCityPicker({ value, onChange, inputId }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    setHighlight(-1);
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await adminLocationAPI.citySuggestions(q);
        const list = Array.isArray(res.suggestions) ? res.suggestions : [];
        setSuggestions(list);
        setOpen(list.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const pick = (item) => {
    const label = item && (item.label ?? item);
    if (!label) return;
    if (value.some((v) => v.toLowerCase() === String(label).toLowerCase())) return;
    onChange([...value, String(label)]);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setHighlight(-1);
  };

  const remove = (label) => {
    onChange(value.filter((v) => v !== label));
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!suggestions.length) return;
      setOpen(true);
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!suggestions.length) return;
      setOpen(true);
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!suggestions.length) return;
      const idx = highlight >= 0 ? highlight : 0;
      pick(suggestions[idx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && value.length) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div ref={wrapRef} className="relative mt-1">
      <p className="text-xs text-gray-500 mb-1">
        Type at least 2 letters, then pick a suggestion so the city includes state (US). Typed text alone is not added.
      </p>
      <div className="flex flex-wrap gap-1.5 items-center min-h-[42px] w-full border border-gray-300 rounded-lg px-2 py-1.5 focus-within:ring-2 focus-within:ring-[#3A7CA5] focus-within:border-[#3A7CA5] bg-white">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-900 text-sm pl-2.5 pr-1 py-0.5 border border-sky-200/90 max-w-full"
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              className="shrink-0 p-0.5 rounded-full hover:bg-sky-200/80 text-sky-800"
              onClick={() => remove(tag)}
              aria-label={`Remove ${tag}`}
            >
              <FaTimes className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          className="flex-1 min-w-[10rem] border-0 focus:ring-0 text-sm py-1 text-[#2E2E2E] placeholder:text-gray-400"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length >= 2 && suggestions.length) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={value.length ? 'Search another city…' : 'Start typing a US city…'}
        />
        {loading ? <span className="text-xs text-gray-400 whitespace-nowrap">Searching…</span> : null}
      </div>
      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-30 mt-1 w-full max-h-52 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm py-1"
          role="listbox"
        >
          {suggestions.map((s, i) => {
            const lab = s.label ?? s;
            return (
              <li key={`${lab}-${i}`}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-gray-800 ${
                    i === highlight ? 'bg-sky-100' : 'hover:bg-sky-50'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(s)}
                >
                  {lab}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AdminUsersPage({ user, onLogout }) {
  const [roleTab, setRoleTab] = useState('all');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const searchTimer = useRef(null);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'success',
  });
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [createRole, setCreateRole] = useState('company');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    company_name: '',
    contact_name: '',
    phone: '',
    bio: '',
    website_url: '',
    facebook_url: '',
    instagram_url: '',
    linkedin_url: '',
    trade_type: '',
    experience_years: '',
    availability: '',
    location: '',
  });
  const [serviceCities, setServiceCities] = useState([]);
  const [selectedIndustries, setSelectedIndustries] = useState([]);
  const [logoFile, setLogoFile] = useState(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQ]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminUsersAPI.list({
        q: debouncedQ || undefined,
        role: roleTab === 'all' ? 'all' : roleTab,
      });
      setList(res.users || []);
    } catch (e) {
      setAlertModal({
        isOpen: true,
        title: 'Could not load users',
        message: e.message || 'Failed',
        variant: 'error',
      });
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, roleTab]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!createModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !creating) setCreateModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createModalOpen, creating]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const email = createForm.email?.trim();
    if (!email) {
      setAlertModal({
        isOpen: true,
        title: 'Email required',
        message: 'Enter an email for the new account.',
        variant: 'error',
      });
      return;
    }
    setCreating(true);
    try {
      if (createRole === 'company') {
        if (!createForm.company_name?.trim() || !createForm.phone?.trim() || !createForm.bio?.trim()) {
          setAlertModal({
            isOpen: true,
            title: 'Missing required fields',
            message: 'Company name, phone number, and bio are required.',
            variant: 'error',
          });
          setCreating(false);
          return;
        }
        const fd = new FormData();
        fd.append('role', 'company');
        fd.append('email', email);
        fd.append('company_name', createForm.company_name.trim());
        if (createForm.contact_name?.trim()) fd.append('contact_name', createForm.contact_name.trim());
        fd.append('phone', createForm.phone.trim());
        if (selectedIndustries.length) fd.append('industry', selectedIndustries.join(', '));
        fd.append('bio', createForm.bio.trim());
        if (createForm.website_url?.trim()) fd.append('website_url', createForm.website_url.trim());
        if (createForm.facebook_url?.trim()) fd.append('facebook_url', createForm.facebook_url.trim());
        if (createForm.instagram_url?.trim()) fd.append('instagram_url', createForm.instagram_url.trim());
        if (createForm.linkedin_url?.trim()) fd.append('linkedin_url', createForm.linkedin_url.trim());
        serviceCities.map((c) => c.trim()).filter(Boolean).forEach((c) => fd.append('service_cities[]', c));
        if (logoFile) fd.append('logo', logoFile);
        await adminUsersAPI.create(fd);
      } else {
        await adminUsersAPI.create({
          role: 'technician',
          email,
          trade_type: createForm.trade_type?.trim() || undefined,
          location: createForm.location?.trim() || undefined,
          experience_years:
            createForm.experience_years === '' ? undefined : parseInt(createForm.experience_years, 10),
          availability: createForm.availability?.trim() || undefined,
          bio: createForm.bio?.trim() || undefined,
        });
      }
      setCreateForm({
        email: '',
        company_name: '',
        contact_name: '',
        phone: '',
        bio: '',
        website_url: '',
        facebook_url: '',
        instagram_url: '',
        linkedin_url: '',
        trade_type: '',
        experience_years: '',
        availability: '',
        location: '',
      });
      setServiceCities([]);
      setSelectedIndustries([]);
      setLogoFile(null);
      setCreateModalOpen(false);
      await loadUsers();
      setAlertModal({
        isOpen: true,
        title: 'User created',
        message:
          createRole === 'company'
            ? 'Company user created. A CRM record was added as Prospect until they post their first job (then it becomes Customer). They were emailed “Welcome aboard” with a link to set a secure password.'
            : 'They receive an email with a link to set their password. Until then they can sign in using their email-derived temporary password.',
        variant: 'success',
      });
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Create failed',
        message: err.message || 'Could not create user',
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="users" emailVariant="crm" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse technicians and companies, or open analytics for any account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 shrink-0 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm"
          >
            <FaUserPlus className="w-4 h-4" aria-hidden />
            Create user
          </button>
        </div>

        {createModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-create-user-title"
            onClick={() => !creating && setCreateModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <FaUserPlus className="text-emerald-600 shrink-0 w-5 h-5" aria-hidden />
                  <h2 id="admin-create-user-title" className="text-lg font-semibold text-gray-900 truncate">
                    Create user
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setCreateModalOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label="Close"
                >
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
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
                <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Email *</span>
              <input
                type="email"
                required
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="login@company.com"
              />
            </label>
            {createRole === 'company' ? (
              <>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Company name *</span>
                  <input
                    required
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.company_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, company_name: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Contact name (CRM)</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.contact_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, contact_name: e.target.value }))}
                    placeholder="Primary contact"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Phone *</span>
                  <input
                    type="tel"
                    required
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </label>
                <div className="block sm:col-span-2">
                  <label htmlFor="admin-industry-input" className="text-xs font-medium text-gray-500 uppercase">
                    Industry
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5 mb-1">
                    Type to search (any casing). Press Enter or pick from the list to add a tag.
                  </p>
                  <IndustryMultiSelect
                    inputId="admin-industry-input"
                    value={selectedIndustries}
                    onChange={setSelectedIndustries}
                  />
                </div>
                <div className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">Service cities</span>
                  <ServiceCityPicker
                    inputId="admin-service-cities-input"
                    value={serviceCities}
                    onChange={setServiceCities}
                  />
                </div>
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
            ) : (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Trade</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.trade_type}
                    onChange={(e) => setCreateForm((f) => ({ ...f, trade_type: e.target.value }))}
                  />
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
                  <span className="text-xs font-medium text-gray-500 uppercase">Availability</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.availability}
                    onChange={(e) => setCreateForm((f) => ({ ...f, availability: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase">Location</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={createForm.location}
                    onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </label>
              </>
            )}
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-500 uppercase">
                Bio{createRole === 'company' ? ' *' : ''}
              </span>
              <textarea
                rows={2}
                required={createRole === 'company'}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={createForm.bio}
                onChange={(e) => setCreateForm((f) => ({ ...f, bio: e.target.value }))}
              />
            </label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create & email'}
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => setCreateModalOpen(false)}
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

        <div className="flex flex-wrap gap-2 mb-4">
          {ROLE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRoleTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                roleTab === t.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative mb-4">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          <input
            type="search"
            placeholder="Search by email…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Label</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Joined</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Analytics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                      Loading…
                    </td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                      No users match.
                    </td>
                  </tr>
                ) : (
                  list.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{row.email}</div>
                        <div className="text-xs text-gray-500">#{row.id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm capitalize text-gray-700">{row.role}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.label}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/admin/users/${row.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
        onClose={() => setAlertModal((m) => ({ ...m, isOpen: false }))}
      />
    </div>
  );
}
