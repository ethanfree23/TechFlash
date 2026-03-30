/** Value 50 means "50+" in UI and API (minimum_years_experience integer). */

export const EXPERIENCE_ANY = '';

export const EXPERIENCE_YEAR_OPTIONS = (() => {
  const opts = [{ value: EXPERIENCE_ANY, label: 'Any' }];
  for (let i = 0; i <= 49; i += 1) {
    opts.push({
      value: String(i),
      label: i === 0 ? '0 years' : `${i} ${i === 1 ? 'year' : 'years'}`,
    });
  }
  opts.push({ value: '50', label: '50+ years' });
  return opts;
})();

export function formatExperienceShort(n) {
  if (n == null) return '';
  if (n >= 50) return '50+';
  return `${n}+`;
}

export function formatExperienceLong(n) {
  if (n == null) return '';
  if (n >= 50) return '50+ years';
  return `${n}+ years`;
}
