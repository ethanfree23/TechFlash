export const NULL_ISLAND_EPSILON = 0.05;

const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseCoordinate(value: unknown): number | null {
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

export function parseCoordinatePair(
  lat: unknown,
  lng: unknown
): { latitude: number; longitude: number } | null {
  const latitude = parseCoordinate(lat);
  const longitude = parseCoordinate(lng);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  if (Math.abs(latitude) < NULL_ISLAND_EPSILON && Math.abs(longitude) < NULL_ISLAND_EPSILON) {
    return null;
  }
  return { latitude, longitude };
}
