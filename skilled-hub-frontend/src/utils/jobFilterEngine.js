import { getJobDistance, toNormalizedList } from './jobDisplayUtils';

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const DEFAULT_CLIENT_FILTERS = {
  trade: '',
  dateRange: '',
  dateField: 'created_at',
  minPayCents: '',
  maxPayCents: '',
  maxDistanceMiles: '',
  licenseClass: '',
  maxExperience: '',
  startDateFrom: '',
  startDateTo: '',
};

export const DATE_RANGE_OPTIONS = [
  { id: '', label: 'Any time' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
];

export const hasActiveClientFilters = (clientFilters) => {
  if (!clientFilters) return false;
  return Object.entries(clientFilters).some(([key, val]) => {
    if (key === 'dateField') return false;
    return val !== '' && val != null;
  });
};

export const applyClientFilters = (jobs, clientFilters, { technicianProfile } = {}) => {
  if (!Array.isArray(jobs)) return [];
  let result = [...jobs];

  if (clientFilters.trade) {
    const trade = clientFilters.trade.toLowerCase();
    result = result.filter((j) => (j.skill_class || '').toLowerCase().includes(trade));
  }

  if (clientFilters.licenseClass) {
    const lic = clientFilters.licenseClass.toLowerCase();
    result = result.filter((j) => {
      const sk = (j.skill_class || '').toLowerCase();
      const certs = toNormalizedList(j.required_certifications).join(' ');
      return sk.includes(lic) || certs.includes(lic);
    });
  }

  if (clientFilters.maxExperience !== '' && clientFilters.maxExperience != null) {
    const maxExp = Number(clientFilters.maxExperience);
    if (Number.isFinite(maxExp)) {
      result = result.filter((j) => Number(j.minimum_years_experience || 0) <= maxExp);
    }
  }

  if (clientFilters.minPayCents !== '' && clientFilters.minPayCents != null) {
    const min = Number(clientFilters.minPayCents);
    if (Number.isFinite(min)) {
      result = result.filter((j) => {
        const pay = j.hourly_rate_cents ?? j.job_amount_cents ?? j.price_cents ?? 0;
        return pay >= min;
      });
    }
  }

  if (clientFilters.maxPayCents !== '' && clientFilters.maxPayCents != null) {
    const max = Number(clientFilters.maxPayCents);
    if (Number.isFinite(max)) {
      result = result.filter((j) => {
        const pay = j.hourly_rate_cents ?? j.job_amount_cents ?? j.price_cents ?? 0;
        return pay <= max || pay === 0;
      });
    }
  }

  if (clientFilters.maxDistanceMiles !== '' && clientFilters.maxDistanceMiles != null) {
    const maxDist = Number(clientFilters.maxDistanceMiles);
    if (Number.isFinite(maxDist) && maxDist > 0) {
      result = result.filter((j) => {
        const dist = getJobDistance(j, technicianProfile);
        return dist != null && dist <= maxDist;
      });
    }
  }

  if (clientFilters.startDateFrom) {
    const from = parseDate(clientFilters.startDateFrom);
    if (from) {
      result = result.filter((j) => {
        const start = parseDate(j.scheduled_start_at);
        return start && start >= from;
      });
    }
  }

  if (clientFilters.startDateTo) {
    const to = parseDate(clientFilters.startDateTo);
    if (to) {
      to.setHours(23, 59, 59, 999);
      result = result.filter((j) => {
        const start = parseDate(j.scheduled_start_at);
        return start && start <= to;
      });
    }
  }

  if (clientFilters.dateRange) {
    const days = { '7d': 7, '30d': 30, '90d': 90 }[clientFilters.dateRange];
    if (days) {
      const cutoff = Date.now() - days * 86400000;
      const field = clientFilters.dateField || 'created_at';
      result = result.filter((j) => {
        const d = parseDate(j[field]);
        return d && d.getTime() >= cutoff;
      });
    }
  }

  return result;
};
