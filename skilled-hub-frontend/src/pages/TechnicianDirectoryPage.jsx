import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { profilesAPI } from '../api/api';

export default function TechnicianDirectoryPage({ user, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [technicians, setTechnicians] = useState([]);
  const [filters, setFilters] = useState({
    q: '',
    trade_type: '',
    min_rating: '',
    background_verified: false,
    identity_verified: false,
    references_verified: false,
    insurance_verified: false,
    certification: '',
  });

  const load = async (nextFilters = filters) => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...nextFilters,
        background_verified: nextFilters.background_verified ? 'true' : '',
        identity_verified: nextFilters.identity_verified ? 'true' : '',
        references_verified: nextFilters.references_verified ? 'true' : '',
        insurance_verified: nextFilters.insurance_verified ? 'true' : '',
      };
      const rows = await profilesAPI.listTechnicians(payload);
      setTechnicians(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || 'Failed to load technicians.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const applyFilters = (e) => {
    e.preventDefault();
    load(filters);
  };

  const clearFilters = () => {
    const reset = {
      q: '',
      trade_type: '',
      min_rating: '',
      background_verified: false,
      identity_verified: false,
      references_verified: false,
      insurance_verified: false,
      certification: '',
    };
    setFilters(reset);
    load(reset);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="technicians" emailVariant="welcome" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Technician Discovery</h1>
          <p className="text-sm text-gray-600 mt-1">Filter by trust verification, rating, trade, and certifications.</p>
        </div>

        <form onSubmit={applyFilters} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm" name="q" value={filters.q} onChange={onChange} placeholder="Search by name, email, trade..." />
            <input className="border rounded-lg px-3 py-2 text-sm" name="trade_type" value={filters.trade_type} onChange={onChange} placeholder="Trade (e.g. Electrician)" />
            <input className="border rounded-lg px-3 py-2 text-sm" type="number" min="0" max="5" step="0.1" name="min_rating" value={filters.min_rating} onChange={onChange} placeholder="Min rating" />
            <input className="border rounded-lg px-3 py-2 text-sm" name="certification" value={filters.certification} onChange={onChange} placeholder="Certification (e.g. OSHA 10)" />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Checkbox name="background_verified" checked={filters.background_verified} onChange={onChange} label="Background verified" />
            <Checkbox name="identity_verified" checked={filters.identity_verified} onChange={onChange} label="Identity verified" />
            <Checkbox name="references_verified" checked={filters.references_verified} onChange={onChange} label="References verified" />
            <Checkbox name="insurance_verified" checked={filters.insurance_verified} onChange={onChange} label="Insurance verified" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Apply filters</button>
            <button type="button" onClick={clearFilters} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Clear</button>
          </div>
        </form>

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">Loading technicians...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        ) : technicians.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">No technicians match these filters.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {technicians.map((tech) => (
              <article key={tech.id} className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {tech.user?.first_name || tech.user?.email || `Technician #${tech.id}`}
                  </h2>
                  <p className="text-sm text-gray-600">{tech.trade_type || 'General'}</p>
                  {tech.average_rating != null && (
                    <p className="text-sm text-amber-700 font-medium">★ {Number(tech.average_rating).toFixed(1)} average</p>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {tech.background_verified ? 'Background verified' : 'Background not verified'} · {tech.experience_years ?? 0} years
                </div>
                {Array.isArray(tech.verification_badges) && tech.verification_badges.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tech.verification_badges.slice(0, 4).map((badge) => (
                      <span key={`${tech.id}-${badge}`} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
                        {String(badge).replaceAll('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto">
                  <Link to={`/technicians/${tech.id}`} className="inline-flex px-3 py-2 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800">
                    View profile
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Checkbox({ name, checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" name={name} checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
