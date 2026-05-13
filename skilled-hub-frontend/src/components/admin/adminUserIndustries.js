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

export function filterIndustrySuggestions(query, selected) {
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
