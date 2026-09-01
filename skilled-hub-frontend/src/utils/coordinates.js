// Shared coordinate parsing/validation for technician (and job) map points.
// Number(null) === 0 and Number("") === 0, so never treat "finite after Number()" as valid.

export const NULL_ISLAND_EPSILON = 0.05;
export const US_DEFAULT_MAP_CENTER = { lat: 39.5, lng: -98.35 };

const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseCoordinate(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || !NUMERIC_RE.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isValidCoordinatePair(lat, lng, options = {}) {
  const parsed = parseCoordinatePair(lat, lng, options);
  return parsed != null;
}

export function parseCoordinatePair(lat, lng, options = {}) {
  const latitude = parseCoordinate(lat);
  const longitude = parseCoordinate(lng);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  if (Math.abs(latitude) < NULL_ISLAND_EPSILON && Math.abs(longitude) < NULL_ISLAND_EPSILON) {
    return null;
  }
  if (options.requireUS && !isPlausibleUSCoordinate(latitude, longitude)) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

/** Loose US + territories box (CONUS, AK, HI, PR, Guam, American Samoa). Rejects Europe/Africa. */
export function isPlausibleUSCoordinate(lat, lng) {
  if (lat < -16 || lat > 72) return false;
  return lng <= -64 || lng >= 144;
}

export function isValidUSTechnicianCoordinates(lat, lng) {
  return parseCoordinatePair(lat, lng, { requireUS: true }) != null;
}

export function technicianHomeLatLng(profile) {
  const country = String(profile?.country || '').trim();
  const requireUS = !country || /united states|usa|\bus\b/i.test(country);
  return parseCoordinatePair(profile?.latitude, profile?.longitude, { requireUS });
}

export function resolveTechnicianMapCenter({
  homeLatLng = null,
  selectedLatLng = null,
  jobPositions = [],
  presencePositions = [],
  usDefault = US_DEFAULT_MAP_CENTER,
} = {}) {
  if (homeLatLng) return { center: homeLatLng, source: 'home' };
  if (selectedLatLng) return { center: selectedLatLng, source: 'selected_job' };
  const hasFitTargets =
    (Array.isArray(jobPositions) && jobPositions.length > 0) ||
    (Array.isArray(presencePositions) && presencePositions.length > 0);
  if (hasFitTargets) return { center: null, source: 'fit' };
  return { center: usDefault, source: 'default' };
}

export function needsMapPlacement(profile) {
  const hasAddressHint = Boolean(
    String(profile?.address || '').trim() ||
    String(profile?.city || '').trim() ||
    String(profile?.zip_code || '').trim()
  );
  return hasAddressHint && !technicianHomeLatLng(profile);
}
