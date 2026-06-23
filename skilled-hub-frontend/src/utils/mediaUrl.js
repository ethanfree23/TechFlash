import { resolveApiBaseUrl } from '../api/apiConfig';

/** API origin without /api/v1 — used for Active Storage blob paths. */
export function resolveApiOrigin() {
  return resolveApiBaseUrl().replace(/\/api\/v1\/?$/, '');
}

/**
 * Active Storage URLs must load from the API host (demo vs prod). Relative paths and
 * mismatched hosts (e.g. production APP_HOST while browsing /demo) break avatars.
 */
export function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  const apiOrigin = resolveApiOrigin();

  if (trimmed.startsWith('/')) {
    return `${apiOrigin}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.includes('/rails/active_storage/')) {
      return `${apiOrigin}${parsed.pathname}${parsed.search}`;
    }
    return trimmed;
  } catch {
    return `${apiOrigin}/${trimmed.replace(/^\//, '')}`;
  }
}

/** Append cache-buster when profile has updated_at (helps after avatar replace). */
export function mediaUrlWithCacheBust(url, updatedAt) {
  const resolved = resolveMediaUrl(url);
  if (!resolved || !updatedAt) return resolved;
  const sep = resolved.includes('?') ? '&' : '?';
  const stamp = typeof updatedAt === 'number' ? updatedAt : Date.parse(updatedAt);
  if (!Number.isFinite(stamp)) return resolved;
  return `${resolved}${sep}v=${stamp}`;
}
