import { normalizeJobStatusKey } from './jobStatus';

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

export const formatJobCurrency = (cents) => {
  if (cents == null || cents === 0) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

export const formatJobPay = (job) => {
  if (!job) return null;
  if (job.hourly_rate_cents != null) {
    return `${formatJobCurrency(job.hourly_rate_cents)}/hr`;
  }
  const amount = job.job_amount_cents ?? job.price_cents;
  if (amount != null) return formatJobCurrency(amount);
  return null;
};

export const formatJobDuration = (job) => {
  if (!job) return null;
  const days = job.days;
  const hpd = job.hours_per_day;
  if (days != null && hpd != null) {
    const totalHours = Number(days) * Number(hpd);
    if (totalHours > 0) {
      return days === 1 ? `1 day · ${hpd} hr/day` : `${days} days · ${hpd} hr/day`;
    }
  }
  if (job.scheduled_start_at && job.scheduled_end_at) {
    const start = new Date(job.scheduled_start_at);
    const end = new Date(job.scheduled_end_at);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0) return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }
  }
  return null;
};

export const formatJobStart = (job) => {
  if (!job?.scheduled_start_at) return null;
  const d = new Date(job.scheduled_start_at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const formatJobLocation = (job) => {
  if (!job) return null;
  if (job.location) return job.location;
  const parts = [job.city, job.state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
};

export const formatCertifications = (job) => {
  const raw = job?.required_certifications;
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const list = raw.filter(Boolean);
    return list.length > 0 ? list.join(', ') : null;
  }
  const str = String(raw).trim();
  return str || null;
};

export const isJobExpired = (job) => {
  const status = normalizeJobStatusKey(job);
  if (status !== 'open') return false;
  const endAt = job?.scheduled_end_at ? new Date(job.scheduled_end_at).getTime() : null;
  return endAt !== null && endAt < Date.now();
};

export const isJobActive = (job) => {
  const status = normalizeJobStatusKey(job);
  if (status !== 'reserved' && status !== 'filled') return false;
  const startAt = job?.scheduled_start_at ? new Date(job.scheduled_start_at).getTime() : null;
  return startAt !== null && startAt <= Date.now();
};

export const isJobClaimed = (job) => {
  const status = normalizeJobStatusKey(job);
  return status === 'reserved' || status === 'filled' || status === 'accepted';
};

export const getAcceptedApplication = (job) => {
  const apps = job?.job_applications;
  if (!Array.isArray(apps)) return null;
  return apps.find((a) => a.status === 'accepted') || null;
};

export const getClaimedTechnician = (job) => {
  const app = getAcceptedApplication(job);
  return app?.technician_profile || null;
};

export const getClaimedTechnicianName = (job) => {
  const tech = getClaimedTechnician(job);
  if (!tech) return null;
  const user = tech.user;
  if (user?.first_name || user?.last_name) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ');
  }
  return tech.trade_type || 'Technician';
};

export const getApplicationCount = (job) => {
  const apps = job?.job_applications;
  if (!Array.isArray(apps)) return 0;
  return apps.length;
};

export const getJobDistance = (job, technicianProfile) => {
  if (
    technicianProfile?.latitude == null ||
    technicianProfile?.longitude == null ||
    job?.latitude == null ||
    job?.longitude == null
  ) {
    return null;
  }
  const miles = haversineMiles(
    technicianProfile.latitude,
    technicianProfile.longitude,
    job.latitude,
    job.longitude
  );
  return Number.isFinite(miles) ? miles : null;
};

export const isJobClaimedByTechnician = (job, technicianProfile) => {
  if (!technicianProfile || !job?.job_applications) return false;
  return job.job_applications.some(
    (app) => app.technician_profile_id === technicianProfile.id && app.status === 'accepted'
  );
};

export const isJobEditable = (job) => normalizeJobStatusKey(job) !== 'finished';

export const canTechnicianClaim = (job) => {
  if (!job) return false;
  if (normalizeJobStatusKey(job) !== 'open') return false;
  if (isJobExpired(job)) return false;
  return true;
};

export const getTechnicianUnavailableReason = (job, technicianProfile) => {
  if (!job) return 'Job unavailable';
  if (isJobClaimedByTechnician(job, technicianProfile)) return null;
  if (isJobExpired(job)) return 'This job has expired and is no longer available.';
  const status = normalizeJobStatusKey(job);
  if (status === 'reserved' || status === 'filled') return 'This job has already been claimed.';
  if (status === 'finished') return 'This job has been completed.';
  return null;
};

export const toNormalizedList = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
};

export const matchesSavedSearch = (job, saved, technicianProfile) => {
  if (!saved || !job) return false;
  const kw = (saved.keyword || '').toLowerCase().trim();
  const loc = (saved.location || '').toLowerCase().trim();
  const sk = (saved.skill_class || '').toLowerCase().trim();
  const maxDistance = Number(saved.max_distance_miles || 0);
  const minHourly = Number(saved.min_hourly_rate_cents || 0);
  const maxYears = Number(saved.max_required_years_experience || 0);
  const requiredCerts = toNormalizedList(saved.required_certifications);
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  const notes = (job.notes || '').toLowerCase();
  const jobLoc = (job.location || '').toLowerCase();
  const jobSk = (job.skill_class || '').toLowerCase();
  if (kw && !title.includes(kw) && !desc.includes(kw) && !notes.includes(kw)) return false;
  if (loc && !jobLoc.includes(loc)) return false;
  if (sk && !jobSk.includes(sk)) return false;
  if (minHourly > 0 && Number(job.hourly_rate_cents || 0) < minHourly) return false;
  if (maxYears > 0 && Number(job.minimum_years_experience || 0) > maxYears) return false;

  if (requiredCerts.length > 0) {
    const jobCerts = toNormalizedList(job.required_certifications);
    if (!requiredCerts.every((cert) => jobCerts.includes(cert))) return false;
  }

  if (maxDistance > 0) {
    const distance = getJobDistance(job, technicianProfile);
    if (distance == null || distance > maxDistance) return false;
  }

  return !!(kw || loc || sk || maxDistance > 0 || minHourly > 0 || maxYears > 0 || requiredCerts.length > 0);
};

export const computeClaimedCountFromJobs = (jobs) => {
  if (!Array.isArray(jobs)) return 0;
  const now = Date.now();
  return jobs.filter((job) => {
    const status = normalizeJobStatusKey(job);
    if (status !== 'reserved' && status !== 'filled') return false;
    const startAt = job.scheduled_start_at ? new Date(job.scheduled_start_at).getTime() : null;
    return startAt === null || startAt > now;
  }).length;
};

export const computeExpiredCountFromJobs = (jobs) => {
  if (!Array.isArray(jobs)) return 0;
  return jobs.filter(isJobExpired).length;
};

export const computeCounterPendingCountFromJobs = (jobs) => {
  if (!Array.isArray(jobs)) return 0;
  return jobs.filter((j) => j.pending_counter_offer).length;
};
