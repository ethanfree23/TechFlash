import { adminAPI } from '../api/api';

const INSIGHT_CATEGORIES = [
  'open_jobs',
  'jobs_in_progress',
  'completed',
  'job_applications',
  'technicians',
  'companies',
];

/**
 * Loads all platform insight slices used by the Admin Command Center in parallel.
 * @param {string} period
 * @returns {Promise<Record<string, object|null>>}
 */
export async function fetchAdminCommandCenterInsights(period) {
  const results = await Promise.all(
    INSIGHT_CATEGORIES.map((cat) =>
      adminAPI.getPlatformInsights(cat, period).catch((err) => {
        console.warn(`platform_insights ${cat} failed`, err);
        return null;
      })
    )
  );
  return Object.fromEntries(INSIGHT_CATEGORIES.map((c, i) => [c, results[i]]));
}
