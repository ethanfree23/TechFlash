/**
 * Canonical technician seniority classes — mirror
 * skilled-hub-frontend/src/constants/technicianClass.js
 * when updating either file.
 *
 * Stored / API values are slugs. UI labels are Title Case.
 */
export const TECHNICIAN_CLASS_SLUGS = ['apprentice', 'journeyman', 'master'] as const;

export type TechnicianClass = (typeof TECHNICIAN_CLASS_SLUGS)[number];

export const TECHNICIAN_CLASS_LABELS: Record<TechnicianClass, string> = {
  apprentice: 'Apprentice',
  journeyman: 'Journeyman',
  master: 'Master',
};

/** Select/chip value list (slugs). */
export const TECHNICIAN_CLASS_OPTIONS = TECHNICIAN_CLASS_SLUGS;

export function technicianClassSlug(value: string | null | undefined): string {
  const current = String(value || '').trim();
  if (!current) return '';
  const slug = current.toLowerCase().replace(/[\s-]+/g, '_');
  if ((TECHNICIAN_CLASS_SLUGS as readonly string[]).includes(slug)) return slug;
  const matched = TECHNICIAN_CLASS_SLUGS.find(
    (opt) => TECHNICIAN_CLASS_LABELS[opt].toLowerCase() === current.toLowerCase()
  );
  return matched || current;
}

export function isTechnicianClass(value: string | null | undefined): boolean {
  return (TECHNICIAN_CLASS_SLUGS as readonly string[]).includes(technicianClassSlug(value));
}

export function technicianClassLabel(value: string | null | undefined): string {
  const slug = technicianClassSlug(value);
  return TECHNICIAN_CLASS_LABELS[slug as TechnicianClass] || String(value || '').trim();
}

export function technicianClassSelectOptions(currentValue?: string | null): string[] {
  const current = String(currentValue || '').trim();
  if (current && !isTechnicianClass(current)) {
    return [current, ...TECHNICIAN_CLASS_SLUGS];
  }
  return [...TECHNICIAN_CLASS_SLUGS];
}
