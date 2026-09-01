import {
  parseCoordinatePair,
  technicianHomeLatLng as technicianHomeFromProfile,
} from './coordinates.js';

export {
  isValidCoordinatePair,
  isValidUSTechnicianCoordinates,
  parseCoordinatePair,
  parseCoordinate,
  technicianHomeLatLng,
  resolveTechnicianMapCenter,
  needsMapPlacement,
  US_DEFAULT_MAP_CENTER,
} from './coordinates.js';

/** Web Mercator meters-per-pixel at zoom 0 on the equator (Google Maps). */
const GOOGLE_MAPS_ZOOM0_MPP = 156543.03392;

/**
 * Zoom so the map's visible WIDTH equals diameterMiles.
 * fitBounds on a radius circle is wrong here: a wide/short pane zooms out until the
 * north-south extent fits, which shows far more than the requested diameter east-west.
 */
export const zoomForMapWidthMiles = (lat, widthPx, diameterMiles) => {
  const latN = Number(lat);
  const w = Number(widthPx);
  const d = Number(diameterMiles);
  if (!Number.isFinite(latN) || !Number.isFinite(w) || w < 50 || !Number.isFinite(d) || d <= 0) {
    return null;
  }
  const metersPerPixel = (d * 1609.344) / w;
  const cosLat = Math.cos((latN * Math.PI) / 180);
  const clampedCos = Math.max(0.01, Math.abs(cosLat));
  const zoom = Math.log2((GOOGLE_MAPS_ZOOM0_MPP * clampedCos) / metersPerPixel);
  if (!Number.isFinite(zoom)) return null;
  return Math.min(16, Math.max(7, zoom));
};

/** Axis-aligned bounding box (SW / NE corners) approximating a circle of radiusMiles around center. Good for map fitBounds. */
export const boundingBoxForRadiusMiles = (centerLat, centerLng, radiusMiles) => {
  const pair = parseCoordinatePair(centerLat, centerLng);
  const r = Number(radiusMiles);
  if (!pair || !Number.isFinite(r) || r <= 0) return null;
  const lat = pair.lat;
  const lng = pair.lng;
  const latRad = (lat * Math.PI) / 180;
  const dLat = r / 69.0;
  const cosLat = Math.cos(latRad);
  const dLng = cosLat > 1e-6 ? r / (69.0 * cosLat) : r / 69.0;
  return {
    south: lat - dLat,
    north: lat + dLat,
    west: lng - dLng,
    east: lng + dLng,
  };
};

export const haversineMiles = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const filterJobsWithinRadius = (jobs, centerLat, centerLng, radiusMiles) => {
  const center = parseCoordinatePair(centerLat, centerLng);
  const hasCenterCoords = center != null;
  const normalizedCenterLat = center?.lat;
  const normalizedCenterLng = center?.lng;
  return (jobs || [])
    .map((job) => {
      const jobPair = parseCoordinatePair(job?.latitude, job?.longitude);
      const jobLat = jobPair?.lat;
      const jobLng = jobPair?.lng;
      return {
        ...job,
        latitude: jobPair ? jobLat : job?.latitude,
        longitude: jobPair ? jobLng : job?.longitude,
        distanceMiles: hasCenterCoords && jobPair
          ? haversineMiles(normalizedCenterLat, normalizedCenterLng, jobLat, jobLng)
          : Infinity,
      };
    })
    .filter((job) => {
      if (!hasCenterCoords) return true;
      if (!Number.isFinite(job.distanceMiles)) return true;
      return job.distanceMiles <= radiusMiles;
    })
    .sort((a, b) => {
      const aDistance = Number.isFinite(a.distanceMiles) ? a.distanceMiles : Number.POSITIVE_INFINITY;
      const bDistance = Number.isFinite(b.distanceMiles) ? b.distanceMiles : Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    });
};

/** Human-readable distance for job lists (avoids misleading "0.0 mi" when very close). */
export const formatDistanceMi = (miles) => {
  if (!Number.isFinite(miles)) return '';
  if (miles < 0.05) return '<0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
};

export const needsTechnicianMapSetup = (profile) => !technicianHomeFromProfile(profile);

export const needsExactStreetAddress = (profile) => (
  !needsTechnicianMapSetup(profile) &&
  !String(profile?.address || '').trim()
);
