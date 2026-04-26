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
  return (jobs || [])
    .map((job) => ({
      ...job,
      distanceMiles: haversineMiles(centerLat, centerLng, job?.latitude, job?.longitude),
    }))
    .filter((job) => {
      if (centerLat == null || centerLng == null) return true;
      return job.distanceMiles <= radiusMiles;
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
};

export const needsTechnicianMapSetup = (profile) => (
  !String(profile?.city || '').trim() ||
  !String(profile?.state || '').trim() ||
  !String(profile?.country || '').trim()
);
