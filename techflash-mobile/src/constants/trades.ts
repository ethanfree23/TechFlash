/**
 * Canonical trade labels — mirror skilled-hub-frontend/src/constants/trades.js
 * when updating either file.
 *
 * Used by admin create user (trade picker) and any mobile flows that need the same list.
 */
export const TRADE_OPTIONS = [
  'Electrician',
  'HVAC Technician',
  'Plumber',
  'Automobile Technician',
  'Roofer',
  'Carpenter',
  'Machine Technician (Industrial Maintenance)',
  'Welder',
  'Refrigeration Technician',
  'Pipefitter',
  'Sheet Metal Worker',
  'Mason / Concrete Worker',
  'Drywall / Painter',
  'Glazier',
  'Insulation Installer',
  'Boilermaker',
  'Fire Protection / Sprinkler Tech',
  'Solar Installer',
  'Low-Voltage / Telecom Tech',
  'Locksmith',
  'Appliance Repair Tech',
  'Equipment Operator',
  'General Laborer / Helper',
] as const;

export const COMPANY_INDUSTRY_LABELS: Record<string, string> = {
  'Automobile Technician': 'Auto Shop',
};

export function companyIndustryLabel(trade: string | null | undefined): string {
  const key = TRADE_OPTIONS.find((opt) => opt.toLowerCase() === String(trade || '').toLowerCase());
  if (key && COMPANY_INDUSTRY_LABELS[key]) return COMPANY_INDUSTRY_LABELS[key];
  const byLabel = Object.values(COMPANY_INDUSTRY_LABELS).find(
    (label) => label.toLowerCase() === String(trade || '').toLowerCase()
  );
  return byLabel || key || String(trade || '').trim();
}

export const COMPANY_INDUSTRY_OPTIONS = TRADE_OPTIONS.map((trade) => ({
  trade,
  label: companyIndustryLabel(trade),
}));

export function companyIndustrySelectValue(industry: string | null | undefined): string {
  const raw = String(industry || '').trim();
  if (!raw) return '';
  const match = COMPANY_INDUSTRY_OPTIONS.find(
    (opt) => opt.trade.toLowerCase() === raw.toLowerCase() || opt.label.toLowerCase() === raw.toLowerCase()
  );
  return match ? match.label : raw;
}
