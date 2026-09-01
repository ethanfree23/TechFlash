import { TRADE_OPTIONS } from '../constants/trades.js';
import { isTechnicianClass, technicianClassSlug } from '../constants/technicianClass.js';

export function makeTradeLine(overrides = {}) {
  return {
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    trade_type: '',
    skill_class: '',
    experience_years: '',
    ...overrides,
  };
}

function qualificationTradeName(entry) {
  if (entry && typeof entry === 'object') {
    return String(entry.trade_type || entry.trade || entry.label || '').trim();
  }
  return String(entry || '').trim();
}

export function tradeLinesFromProfile(profile) {
  const quals = Array.isArray(profile?.trade_qualifications) ? profile.trade_qualifications : [];
  const fromQuals = quals
    .map((qual) => ({
      trade_type: qualificationTradeName(qual),
      skill_class: technicianClassSlug(qual?.skill_class || qual?.class || qual?.level),
      experience_years: qual?.experience_years ?? qual?.years ?? '',
    }))
    .filter((qual) => qual.trade_type);
  if (fromQuals.length) {
    return fromQuals.map((qual) => makeTradeLine(qual));
  }

  const names = [];
  const primary = String(profile?.trade_type || '').trim();
  if (primary) names.push(primary);
  const specialties = Array.isArray(profile?.specialties) ? profile.specialties : [];
  specialties.forEach((entry) => {
    const trade = qualificationTradeName(entry);
    if (trade && !names.some((existing) => existing.toLowerCase() === trade.toLowerCase())) {
      names.push(trade);
    }
  });

  if (!names.length) {
    return [
      makeTradeLine({
        skill_class: technicianClassSlug(profile?.skill_class),
        experience_years: profile?.experience_years ?? '',
      }),
    ];
  }

  return names.map((trade, index) =>
    makeTradeLine({
      trade_type: trade,
      skill_class: index === 0 ? technicianClassSlug(profile?.skill_class) : '',
      experience_years: index === 0 ? (profile?.experience_years ?? '') : '',
    })
  );
}

export function payloadFromTradeLines(lines) {
  const cleaned = (Array.isArray(lines) ? lines : [])
    .map((line) => ({
      trade_type: String(line?.trade_type || '').trim(),
      skill_class: technicianClassSlug(line?.skill_class),
      experience_years:
        line?.experience_years === '' || line?.experience_years == null
          ? null
          : Number.parseInt(line.experience_years, 10),
    }))
    .filter((line) => line.trade_type)
    .filter((line, index, all) => all.findIndex((other) => other.trade_type === line.trade_type) === index)
    .map((line) => ({
      ...line,
      experience_years: Number.isFinite(line.experience_years) && line.experience_years >= 0 ? line.experience_years : null,
    }));

  const primary = cleaned[0] || {};
  return {
    trade_type: primary.trade_type || '',
    skill_class: primary.skill_class || '',
    experience_years: primary.experience_years ?? null,
    specialties: cleaned.map((line) => line.trade_type),
    trade_qualifications: cleaned,
  };
}

export function tradeLineValidationMessage(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const filled = list.filter(
    (line) =>
      String(line?.trade_type || '').trim() ||
      String(line?.skill_class || '').trim() ||
      String(line?.experience_years ?? '').trim() !== ''
  );
  const rows = filled.length ? filled : list.slice(0, 1);
  for (const line of rows) {
    if (!String(line?.trade_type || '').trim()) return 'Select a trade type for each trade line.';
    if (!isTechnicianClass(line?.skill_class)) {
      return 'Select a class (Apprentice, Journeyman, or Master) for each trade.';
    }
  }
  return null;
}

export function unusedTradeOptions(lines, currentTrade) {
  const used = new Set(
    (Array.isArray(lines) ? lines : [])
      .map((line) => String(line?.trade_type || '').trim())
      .filter((trade) => trade && trade !== currentTrade)
  );
  return TRADE_OPTIONS.filter((trade) => !used.has(trade));
}
