import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FaTimes } from 'react-icons/fa';
import { adminLocationAPI } from '../../api/api';

/** Canonical labels; matching is case-insensitive (hvac → HVAC). */
export const CANONICAL_INDUSTRIES = [
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

export function resolveIndustryToken(query) {
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

export function IndustryMultiSelect({ value, onChange, inputId }) {
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
export function ServiceCityPicker({ value, onChange, inputId }) {
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
