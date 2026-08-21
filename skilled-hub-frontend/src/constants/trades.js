/**
 * Canonical trade labels used across the product. Keep in sync with
 * techflash-mobile/src/constants/trades.ts (manual copy).
 *
 * Consumers include: technician registration (RegisterForm), profile/settings,
 * admin create user (datalist), admin user detail job-alert trade picker,
 * job posting flows that reference trades, etc.
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
];

export const TRADE_OTHER_SENTINEL = '__other__';

/** Company-facing labels for the same catalog trades (routing stays on TRADE_OPTIONS). */
export const COMPANY_INDUSTRY_LABELS = {
  'Automobile Technician': 'Auto Shop',
};

export function companyIndustryLabel(trade) {
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

export function companyIndustrySelectValue(industry) {
  const raw = String(industry || '').trim();
  if (!raw) return '';
  const match = COMPANY_INDUSTRY_OPTIONS.find(
    (opt) => opt.trade.toLowerCase() === raw.toLowerCase() || opt.label.toLowerCase() === raw.toLowerCase()
  );
  return match ? match.label : raw;
}
