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
  const lat = Number(centerLat);
  const lng = Number(centerLng);
  const r = Number(radiusMiles);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r) || r <= 0) return null;
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
  const normalizedCenterLat = Number(centerLat);
  const normalizedCenterLng = Number(centerLng);
  const hasCenterCoords = Number.isFinite(normalizedCenterLat) && Number.isFinite(normalizedCenterLng);
  return (jobs || [])
    .map((job) => {
      const jobLat = Number(job?.latitude);
      const jobLng = Number(job?.longitude);
      const hasJobCoords = Number.isFinite(jobLat) && Number.isFinite(jobLng);
      return {
        ...job,
        latitude: hasJobCoords ? jobLat : job?.latitude,
        longitude: hasJobCoords ? jobLng : job?.longitude,
        distanceMiles: haversineMiles(normalizedCenterLat, normalizedCenterLng, jobLat, jobLng),
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

export const needsTechnicianMapSetup = (profile) => (
  !String(profile?.address || '').trim() ||
  !String(profile?.city || '').trim() ||
  !String(profile?.state || '').trim() ||
  !String(profile?.country || '').trim()
);
