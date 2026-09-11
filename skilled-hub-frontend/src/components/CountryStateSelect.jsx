import React, { useState, useRef, useEffect } from 'react';
import { getStatesForCountry } from '../data/statesByCountry';

/**
 * Searchable dropdown - type to filter, click to select.
 */
const SearchableSelect = ({ options, value, onChange, placeholder, className = '', required = false, inputClassName = '' }) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef(null);

  const displayValue = options.find((o) => o.value === value)?.label || value || '';
  const searchTerm = (open ? filter : displayValue).toLowerCase();
  const filtered = options.filter((o) => o.label.toLowerCase().includes(searchTerm));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (opt) => {
    onChange(opt.value);
    setFilter('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={open ? filter : displayValue}
        onChange={(e) => {
          setFilter(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        required={required}
        className={`w-full border px-3 py-2 rounded bg-white ${inputClassName}`}
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full border border-gray-300 rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-500 text-sm">No matches</li>
          ) : (
            filtered.map((opt) => (
              <li
                key={opt.value}
                onClick={() => handleSelect(opt)}
                className={`px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm ${opt.value === value ? 'bg-blue-50 font-medium' : ''}`}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

/**
 * US state select. TechFlash only operates in the United States.
 */
const CountryStateSelect = ({ country, state, onCountryChange, onStateChange, required = false, highlightMissing = false }) => {
  const stateOptions = getStatesForCountry('US').map((s) => ({ value: s, label: s }));
  const stateInputClassName = highlightMissing && !String(state || '').trim() ? 'border-amber-400 bg-amber-50' : '';

  useEffect(() => {
    if (!country && onCountryChange) onCountryChange('United States');
  }, [country, onCountryChange]);

  return (
    <div>
      <label className="block font-medium mb-1 text-sm">State</label>
      {stateOptions.length > 0 ? (
        <SearchableSelect
          options={stateOptions}
          value={state}
          onChange={onStateChange}
          placeholder="Type or scroll to select"
          className="bg-white"
          required={required}
          inputClassName={stateInputClassName}
        />
      ) : (
        <input
          type="text"
          value={state}
          onChange={(e) => onStateChange(e.target.value)}
          placeholder="Enter state"
          required={required}
          className={`w-full border px-3 py-2 rounded bg-white ${stateInputClassName}`}
        />
      )}
    </div>
  );
};

export default CountryStateSelect;
