/**
 * Canonical technician seniority classes. Keep in sync with
 * techflash-mobile/src/constants/technicianClass.ts and
 * skilled_hub_api TechnicianClassCatalog.
 *
 * Stored / API values are slugs. UI labels are Title Case.
 */
export const TECHNICIAN_CLASS_SLUGS = ['apprentice', 'journeyman', 'master'];

export const TECHNICIAN_CLASS_LABELS = {
  apprentice: 'Apprentice',
  journeyman: 'Journeyman',
  master: 'Master',
};

/** @deprecated Use TECHNICIAN_CLASS_SLUGS. Kept as the select/chip value list. */
export const TECHNICIAN_CLASS_OPTIONS = TECHNICIAN_CLASS_SLUGS;

export function technicianClassSlug(value) {
  const current = String(value || '').trim();
  if (!current) return '';
  const slug = current.toLowerCase().replace(/[\s-]+/g, '_');
  if (TECHNICIAN_CLASS_SLUGS.includes(slug)) return slug;
  const matched = TECHNICIAN_CLASS_SLUGS.find(
    (opt) => TECHNICIAN_CLASS_LABELS[opt].toLowerCase() === current.toLowerCase()
  );
  return matched || current;
}

export function isTechnicianClass(value) {
  return TECHNICIAN_CLASS_SLUGS.includes(technicianClassSlug(value));
}

export function technicianClassLabel(value) {
  const slug = technicianClassSlug(value);
  return TECHNICIAN_CLASS_LABELS[slug] || String(value || '').trim();
}

export function technicianClassSelectOptions(currentValue) {
  const current = String(currentValue || '').trim();
  if (current && !isTechnicianClass(current)) {
    return [current, ...TECHNICIAN_CLASS_SLUGS];
  }
  return TECHNICIAN_CLASS_SLUGS;
}
