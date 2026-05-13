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
