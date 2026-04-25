import React, { useState, useEffect, useRef, useCallback } from 'react';
import CountryStateSelect from './CountryStateSelect';
import { addressesAPI } from '../api/api';

/**
 * Paste a full address, pick a Google Maps / Places match (when API key is configured)
 * or OpenStreetMap suggestions, or expand to manual street + city + state fields.
 */
const JobAddressFields = ({
  address,
  city,
  state,
  zipCode,
  country,
  onChange,
  sectionTitle = 'Job Location',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [manualExpanded, setManualExpanded] = useState(false);
  const [pickedLabel, setPickedLabel] = useState('');
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  const usingText =
    pickedLabel ||
    (String(address || '').trim() && String(city || '').trim()
      ? [address, city, state, zipCode, country].filter(Boolean).join(', ')
      : '');

  const applyResolved = useCallback(
    (row) => {
      if (!row) return;
      onChange({
        address: row.address ?? '',
        city: row.city ?? '',
        state: row.state ?? '',
        zip_code: row.zip_code ?? '',
        country: row.country ?? 'United States',
      });
      setPickedLabel(row.formatted || row.label || [row.address, row.city, row.state].filter(Boolean).join(', '));
      setSearchQuery('');
      setSuggestions([]);
      setOpen(false);
      setManualExpanded(false);
    },
    [onChange]
  );

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (manualExpanded) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return undefined;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await addressesAPI.suggestions(q);
        setProvider(res?.provider ?? null);
        const list = Array.isArray(res?.suggestions) ? res.suggestions : [];
        setSuggestions(list);
        setOpen(list.length > 0);
        setHighlight(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, manualExpanded]);

  const pickSuggestion = async (item) => {
    if (!item) return;
    if (item.source === 'google' && item.place_id) {
      setLoading(true);
      try {
        const row = await addressesAPI.resolve(item.place_id);
        applyResolved({ ...row, label: item.label });
      } catch {
        setManualExpanded(true);
        setPickedLabel('');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (item.source === 'nominatim') {
      applyResolved({
        address: item.address,
        city: item.city,
        state: item.state,
        zip_code: item.zip_code,
        country: item.country,
        label: item.label,
      });
    }
  };

  const onSearchKeyDown = (e) => {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = highlight >= 0 ? highlight : 0;
      pickSuggestion(suggestions[idx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const clearSelection = () => {
    setPickedLabel('');
    onChange({ address: '', city: '', state: 'Texas', zip_code: '', country: 'United States' });
    setSearchQuery('');
    setSuggestions([]);
    setManualExpanded(false);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
      <h3 className="font-medium text-gray-900">{sectionTitle}</h3>

      {!manualExpanded && (
        <div ref={wrapRef} className="space-y-2">
          <label className="block font-medium mb-1 text-sm">Search address</label>
          <p className="text-xs text-gray-500">
            Paste a full address in one line, then choose a match below.
            {provider === 'google'
              ? ' Suggestions use Google Places.'
              : ' Suggestions use OpenStreetMap (enable GOOGLE_MAPS_API_KEY on the server for Google Maps results).'}
          </p>
          <div className="relative">
            <input
              type="text"
              autoComplete="off"
              className="w-full border px-3 py-2 rounded bg-white"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                if (suggestions.length) setOpen(true);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="e.g. 1600 Amphitheatre Parkway, Mountain View, CA 94043"
            />
            {loading && (
              <span className="absolute right-3 top-2.5 text-xs text-gray-400">Searching…</span>
            )}
            {open && suggestions.length > 0 && (
              <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm py-1">
                {suggestions.map((s, idx) => (
                  <li key={`${s.source}-${s.place_id || s.label}-${idx}`}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 hover:bg-blue-50 ${idx === highlight ? 'bg-blue-50' : ''}`}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => pickSuggestion(s)}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="text-sm font-medium text-blue-700 hover:text-blue-900 underline"
            onClick={() => setManualExpanded(true)}
          >
            Fill out form manually
          </button>

          {usingText && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
              <span className="font-medium">Using:</span> {usingText}
              <button
                type="button"
                className="ml-3 text-blue-700 font-medium hover:underline"
                onClick={clearSelection}
              >
                Change address
              </button>
            </div>
          )}
        </div>
      )}

      {manualExpanded && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-sm font-medium text-blue-700 hover:underline"
              onClick={() => {
                setManualExpanded(false);
                setSearchQuery('');
                setSuggestions([]);
              }}
            >
              Back to address search
            </button>
          </div>
          <div>
            <label className="block font-medium mb-1 text-sm">Street address</label>
            <input
              className="w-full border px-3 py-2 rounded bg-white"
              value={address}
              onChange={(e) => onChange({ address: e.target.value })}
              placeholder="e.g. 123 Main St"
              required
            />
          </div>
          <div>
            <label className="block font-medium mb-1 text-sm">City</label>
            <input
              className="w-full border px-3 py-2 rounded bg-white"
              value={city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="e.g. Houston"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CountryStateSelect
              country={country}
              state={state}
              onCountryChange={(v) => onChange({ country: v })}
              onStateChange={(v) => onChange({ state: v })}
              required
            />
          </div>
          <div>
            <label className="block font-medium mb-1 text-sm">Zip Code</label>
            <input
              className="w-full border px-3 py-2 rounded bg-white"
              value={zipCode}
              onChange={(e) => onChange({ zip_code: e.target.value })}
              placeholder="e.g. 77007"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default JobAddressFields;
