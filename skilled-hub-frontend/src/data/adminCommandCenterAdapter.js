/**
 * Pure view-model builder for Admin Command Center.
 * Merges analytics, platform insights, feedback, and conversations with null-safety.
 */

export const COMMAND_CENTER_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All time' },
];

export const COMMAND_CENTER_MARKETS = [
  { id: 'all', label: 'All markets' },
  { id: 'houston', label: 'Houston' },
  { id: 'dallas', label: 'Dallas' },
  { id: 'austin', label: 'Austin' },
  { id: 'san_antonio', label: 'San Antonio' },
  { id: 'other', label: 'Other' },
];

export const COMMAND_CENTER_TRADES = [
  { id: 'all', label: 'All trades' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'hvac', label: 'HVAC' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'construction', label: 'Construction' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'roofing', label: 'Roofing' },
  { id: 'refrigeration', label: 'Refrigeration' },
  { id: 'appliance', label: 'Appliance Repair' },
  { id: 'general', label: 'General / Other' },
];

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/** @param {{ city?: string, state?: string, location?: string }} row */
export function rowMatchesMarket(row, marketId) {
  if (!row || marketId === 'all') return true;
  const city = norm(row.city);
  const loc = norm(row.location);
  const hay = `${city} ${loc}`;
  switch (marketId) {
    case 'houston':
      return city.includes('houston') || hay.includes('houston') || hay.includes('humble') || hay.includes('katy');
    case 'dallas':
      return city.includes('dallas') || hay.includes('dallas') || hay.includes('fort worth') || hay.includes('plano');
    case 'austin':
      return city.includes('austin') || hay.includes('austin');
    case 'san_antonio':
      return city.includes('san antonio') || hay.includes('san antonio');
    case 'other':
      return !rowMatchesMarket(row, 'houston') &&
        !rowMatchesMarket(row, 'dallas') &&
        !rowMatchesMarket(row, 'austin') &&
        !rowMatchesMarket(row, 'san_antonio');
    default:
      return true;
  }
}

/** @param {string|null|undefined} skillClass @param {string|null|undefined} tradeType */
export function rowMatchesTrade(skillClass, tradeType, tradeId) {
  if (tradeId === 'all') return true;
  const s = `${norm(skillClass)} ${norm(tradeType)}`;
  const rules = {
    electrical: () => /electric|wire|low\s*voltage/.test(s),
    hvac: () => /hvac|heat|cool|air\s*cond|refrigeration\s*tech/.test(s),
    plumbing: () => /plumb|pipe|drain/.test(s),
    construction: () => /construct|carpent|concrete|fram|drywall/.test(s),
    maintenance: () => /maint|repair|handyman|facilities/.test(s),
    roofing: () => /roof/.test(s),
    refrigeration: () => /refriger|cooler|freezer/.test(s),
    appliance: () => /appliance|washer|dryer|oven/.test(s),
    general: () => true,
  };
  const fn = rules[tradeId];
  return fn ? fn() : true;
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

function uniqueJobIdsFromApplications(items) {
  const set = new Set();
  safeArr(items).forEach((r) => {
    if (r?.job_id != null) set.add(r.job_id);
  });
  return set.size;
}

function sumBy(items, key) {
  return safeArr(items).reduce((acc, r) => acc + (Number(r?.[key]) || 0), 0);
}

function hoursSince(iso, nowMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3600000;
}

/**
 * @param {{
 *   analytics: object|null,
 *   insightsByCategory: Record<string, object|null>,
 *   feedbackList: object[]|null,
 *   conversations: object[]|null,
 *   filters: { period: string, market: string, trade: string, search: string },
 *   nowMs?: number,
 * }} input
 */
export function buildAdminCommandCenterModel(input) {
  const nowMs = input.nowMs ?? Date.now();
  const { analytics, insightsByCategory = {}, feedbackList, conversations, filters } = input;
  const a = analytics || {};
  const market = filters?.market || 'all';
  const trade = filters?.trade || 'all';
  const search = norm(filters?.search);

  const openInsight = insightsByCategory.open_jobs;
  const progressInsight = insightsByCategory.jobs_in_progress;
  const completedInsight = insightsByCategory.completed;
  const appsInsight = insightsByCategory.job_applications;
  const techInsight = insightsByCategory.technicians;
  const coInsight = insightsByCategory.companies;

  let openJobs = safeArr(openInsight?.items);
  let progressJobs = safeArr(progressInsight?.items);
  let completedJobs = safeArr(completedInsight?.items);
  let applications = safeArr(appsInsight?.items);
  let technicians = safeArr(techInsight?.items);
  let companies = safeArr(coInsight?.items);
  const techniciansAll = technicians;
  const verifiedTechniciansAll = techniciansAll.filter((t) => t.background_verified).length;

  const geoRow = (r) => ({ city: r.city, state: r.state, location: r.location });
  const companyGeo = (r) => ({ city: r.location, state: r.state, location: r.location });

  const filterJobRow = (row) =>
    rowMatchesMarket(geoRow(row), market) && rowMatchesTrade(row.skill_class, null, trade);
  const filterTechRow = (row) =>
    rowMatchesMarket(geoRow(row), market) && rowMatchesTrade(row.trade_type, row.trade_type, trade);
  const filterCoRow = (row) => rowMatchesMarket(companyGeo(row), market);
  const filterAppRow = (ap) =>
    rowMatchesMarket(geoRow(ap), market) && rowMatchesTrade(ap.skill_class, null, trade);

  openJobs = openJobs.filter(filterJobRow);
  progressJobs = progressJobs.filter(filterJobRow);
  completedJobs = completedJobs.filter(filterJobRow);
  applications = applications.filter(filterAppRow);
  technicians = technicians.filter(filterTechRow);
  companies = companies.filter(filterCoRow);

  if (search) {
    const match = (txt) => norm(txt).includes(search);
    openJobs = openJobs.filter((r) => match(r.title) || match(r.company_name));
    technicians = technicians.filter((r) => match(r.email) || match(r.trade_type));
    companies = companies.filter((r) => match(r.company_name) || match(r.email));
    applications = applications.filter((r) => match(r.job_title) || match(r.technician_email));
  }

  const totalUsers = a.total_users ?? 0;
  const techCount = a.technicians_count ?? 0;
  const coCount = a.companies_count ?? 0;
  const jobsOpen = a.jobs_open ?? 0;
  const jobsFinished = a.jobs_finished ?? 0;
  const jobsInProg = a.jobs_in_progress ?? 0;
  const totalApps = a.total_job_applications ?? 0;
  const totalJobs = a.total_jobs ?? 0;

  const jobsWithApplicants = uniqueJobIdsFromApplications(applications);
  const paidCompletedCount = completedJobs.filter((j) => (j.money_released_cents || 0) > 0).length;

  const funnel = [
    { key: 'techs', label: 'Technicians (accounts)', count: techCount, pctFromPrev: null },
    { key: 'cos', label: 'Companies (accounts)', count: coCount, pctFromPrev: techCount ? Math.round((coCount / Math.max(techCount, 1)) * 100) : null },
    { key: 'posted', label: 'Jobs posted (all time)', count: totalJobs, pctFromPrev: coCount ? Math.round((totalJobs / Math.max(coCount, 1)) * 100) : null },
    { key: 'with_apps', label: 'Jobs with applicants (window)', count: jobsWithApplicants, pctFromPrev: totalJobs ? Math.round((jobsWithApplicants / Math.max(totalJobs, 1)) * 100) : null },
    { key: 'filled', label: 'Jobs finished', count: jobsFinished, pctFromPrev: totalJobs ? Math.round((jobsFinished / Math.max(totalJobs, 1)) * 100) : null },
    { key: 'paid', label: 'Jobs with payouts (window, completed list)', count: paidCompletedCount, pctFromPrev: jobsFinished ? Math.round((paidCompletedCount / Math.max(jobsFinished, 1)) * 100) : null },
  ];

  const fillRate =
    totalJobs > 0 ? Math.round((jobsFinished / Math.max(totalJobs, 0.0001)) * 1000) / 10 : 0;

  const staleOpen = openJobs.filter((j) => {
    const h = hoursSince(j.created_at, nowMs);
    return h != null && h >= 48 && (j.applications_in_period || 0) === 0;
  });

  const techMoneySum = sumBy(technicians, 'money_earned_cents');
  const coMoneySum = sumBy(companies, 'money_spent_cents');
  const gmvProxyCents = techMoneySum + coMoneySum;

  const trends = safeArr(a.trends_last_30d);
  const sparkUsers = trends.map((d) => ({ v: Number(d.users_created) || 0 }));
  const sparkJobs = trends.map((d) => ({ v: Number(d.jobs_created) || 0 }));
  const sparkApps = trends.map((d) => ({ v: Number(d.applications_created) || 0 }));

  const tradeRows = buildTradeRows({
    technicians,
    openJobs,
    applications,
    completedJobs,
  });

  const marketLabel = COMMAND_CENTER_MARKETS.find((m) => m.id === market)?.label || 'All markets';
  const tradeLabel = COMMAND_CENTER_TRADES.find((t) => t.id === trade)?.label || 'All trades';
  const undersuppliedTrades = tradeRows.filter((r) => r.risk === 'Undersupplied').map((r) => r.trade);

  /** @type {{ score: number, status: string, bars: {label: string, value: number}[], insights: string[], actions: string[]}} */
  const health = computeHealthScore({
    fillRate,
    staleCount: staleOpen.length,
    appsTrend: sparkApps,
    jobsTrend: sparkJobs,
    undersuppliedTrades,
    marketLabel,
    tradeLabel,
  });

  const supplyDemandSeries = trends.map((d, i) => ({
    label: d.date ? String(d.date).slice(5) : String(i),
    openJobsTrend: Number(d.jobs_created) || 0,
    techSignups: Number(d.users_created) || 0,
  }));

  const agingJobs = openJobs
    .map((j) => {
      const h = hoursSince(j.created_at, nowMs) || 0;
      const days = h / 24;
      let tier = 'ok';
      if (h >= 72) tier = 'critical';
      else if (h >= 48) tier = 'warn';
      else if (h >= 24) tier = 'aging';
      let action = 'Monitor';
      if ((j.applications_in_period || 0) === 0 && h >= 24) {
        action = 'Company outreach · improve visibility';
      }
      if ((j.applications_in_period || 0) > 0) action = 'Review applications in queue';
      return {
        ...j,
        ageHours: Math.round(h),
        ageDays: Math.round(days * 10) / 10,
        tier,
        recommendedAction: action,
        locationLabel: [j.city, j.state].filter(Boolean).join(', ') || j.location || '—',
      };
    })
    .sort((x, y) => y.ageHours - x.ageHours);

  const alerts = buildAlerts({ staleOpen, feedbackList, nowMs, marketLabel, tradeLabel });
  const tasks = buildTasks({ staleOpen, marketLabel, tradeLabel });
  const activity = buildActivityFeed({ applications, feedbackList, openJobs });

  const markets = buildMarketCards({ openJobs, technicians, completedJobs });

  const appStatusCounts = applications.reduce(
    (acc, r) => {
      const st = norm(r.status);
      if (st === 'accepted') acc.accepted += 1;
      else if (st === 'rejected') acc.rejected += 1;
      else acc.requested += 1;
      return acc;
    },
    { requested: 0, accepted: 0, rejected: 0 }
  );

  const avgAppsPerJobFiltered =
    openJobs.length > 0 ? Math.round((applications.length / Math.max(openJobs.length, 1)) * 10) / 10 : 0;

  const topTechnicians = [...technicians]
    .sort((a, b) => (Number(b.money_earned_cents) || 0) - (Number(a.money_earned_cents) || 0))
    .slice(0, 20);
  const topCompanies = [...companies]
    .sort((a, b) => (Number(b.money_spent_cents) || 0) - (Number(a.money_spent_cents) || 0))
    .slice(0, 20);

  const kpis = buildKpis({
    totalUsers,
    techCount,
    coCount,
    jobsOpen,
    jobsFinished,
    jobsInProg,
    fillRate,
    totalApps,
    gmvProxyCents,
    conversations,
    sparkUsers,
    sparkJobs,
    sparkApps,
    jobsWithApplicants,
    verifiedTechniciansAll,
  });

  return {
    meta: {
      period: filters?.period || '7d',
      market,
      trade,
      generatedAtMs: nowMs,
    },
    kpis,
    health,
    funnel,
    supplyDemandSeries,
    tradeRows,
    jobOps: {
      open: openJobs,
      inProgress: progressJobs,
      completed: completedJobs,
      agingJobs,
      statusCounts: aggregateJobStatuses(openJobs, progressJobs, completedJobs, totalJobs, a),
    },
    techOps: { technicians, verificationFunnel: buildTechVerificationFunnel(techCount, verifiedTechniciansAll) },
    companyOps: { companies, activationFunnel: buildCompanyActivationFunnel(coCount) },
    matching: {
      appStatusCounts,
      applications: applications.slice(0, 80),
      avgAppsPerJob: avgAppsPerJobFiltered,
      recentApplications: applications.slice(0, 25),
    },
    revenue: {
      gmvProxyCents,
      platformFeesCents: null,
      coSpendCents: coMoneySum,
      techEarnedCents: techMoneySum,
      pendingPayoutsCents: null,
      paymentIssues: [],
      releasedByTrade: tradeRows.map((r) => ({ trade: r.trade, tradeId: r.tradeId, releasedCents: r.releasedCents })),
    },
    markets,
    alerts,
    tasks,
    activity,
    topTechnicians,
    topCompanies,
    raw: { analytics: a, insightsByCategory },
  };
}

function buildKpis(args) {
  const {
    totalUsers,
    techCount,
    coCount,
    jobsOpen,
    jobsFinished,
    jobsInProg,
    fillRate,
    totalApps,
    gmvProxyCents,
    conversations,
    sparkUsers,
    sparkJobs,
    sparkApps,
    jobsWithApplicants,
    verifiedTechniciansAll,
  } = args;

  const convCount = safeArr(conversations).length;
  const convoSpark = [{ v: convCount }];

  const deltaPlaceholder = null;

  return [
    { id: 'users', label: 'Total users', value: totalUsers, delta: deltaPlaceholder, spark: sparkUsers, tone: 'blue' },
    { id: 'techs', label: 'Technicians', value: techCount, delta: deltaPlaceholder, spark: sparkUsers, tone: 'blue' },
    {
      id: 'verified',
      label: 'Background-verified technicians',
      value: verifiedTechniciansAll,
      delta: deltaPlaceholder,
      spark: [],
      tone: 'blue',
      footnote: 'BG-verified on loaded technician slice (trade filter does not apply)',
    },
    { id: 'companies', label: 'Companies', value: coCount, delta: deltaPlaceholder, spark: sparkUsers, tone: 'blue' },
    { id: 'open', label: 'Open jobs', value: jobsOpen, delta: deltaPlaceholder, spark: sparkJobs, tone: 'orange' },
    { id: 'inprog', label: 'In progress', value: jobsInProg, delta: deltaPlaceholder, spark: sparkJobs, tone: 'orange' },
    { id: 'filled', label: 'Jobs finished', value: jobsFinished, delta: deltaPlaceholder, spark: sparkJobs, tone: 'orange' },
    { id: 'fillrate', label: 'Fill rate (finished / all jobs)', value: `${fillRate}%`, delta: deltaPlaceholder, spark: sparkJobs, tone: 'teal' },
    { id: 'apps', label: 'Applications (total)', value: totalApps, delta: deltaPlaceholder, spark: sparkApps, tone: 'orange' },
    { id: 'conv', label: 'App → fill (approx.)', value: jobsFinished && jobsWithApplicants ? `${Math.min(100, Math.round((jobsFinished / Math.max(jobsWithApplicants, 1)) * 100))}%` : '—', delta: deltaPlaceholder, spark: sparkApps, tone: 'teal', footnote: 'Uses windowed applicant jobs vs finished jobs — directional only' },
    { id: 'gmv', label: 'Paid volume (window, proxy)', value: gmvProxyCents, delta: deltaPlaceholder, spark: [], tone: 'orange', format: 'cents' },
    { id: 'threads', label: 'Message threads', value: convCount, delta: deltaPlaceholder, spark: convoSpark, tone: 'blue', footnote: 'Conversation count, not unread' },
  ];
}

function computeHealthScore({
  fillRate,
  staleCount,
  appsTrend,
  jobsTrend,
  undersuppliedTrades = [],
  marketLabel,
  tradeLabel,
}) {
  let score = 62;
  score += Math.min(18, (fillRate / 100) * 18);
  score -= Math.min(22, staleCount * 3);
  const appSlope = trendSlope(appsTrend.map((x) => x.v));
  const jobSlope = trendSlope(jobsTrend.map((x) => x.v));
  score += Math.min(6, appSlope * 2);
  score += Math.min(6, jobSlope * 2);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let status = 'Watch';
  if (score >= 78) status = 'Healthy';
  if (score < 48) status = 'Critical';

  const bars = [
    { label: 'Liquidity (fill rate)', value: Math.min(100, Math.round(fillRate)) },
    { label: 'Demand (job trend)', value: slopeToBar(jobSlope) },
    { label: 'Engagement (apps trend)', value: slopeToBar(appSlope) },
    { label: 'Reliability (inverse stale)', value: Math.max(0, 100 - Math.min(100, staleCount * 8)) },
    { label: 'Revenue signal', value: Math.min(100, 55 + Math.round(fillRate * 0.25)) },
  ];

  const filterCtx = `${marketLabel} · ${tradeLabel}`;
  const insights = [];
  if (staleCount > 0) {
    insights.push(
      `${staleCount} open role(s) (${filterCtx}) are 48h+ old with zero applications in this period — demand may be mispriced, too narrow, or supply is absent for that trade.`
    );
  }
  if (fillRate < 25 && fillRate > 0) {
    insights.push(
      `Fill rate ${fillRate}% is tight for a two-sided trades marketplace; focus on technician activation and reducing time-to-first-application on open work.`
    );
  }
  if (undersuppliedTrades.length) {
    insights.push(
      `Supply gap: ${undersuppliedTrades.slice(0, 4).join(', ')}${undersuppliedTrades.length > 4 ? '…' : ''} show more open demand than bench depth in this view.`
    );
  }
  if (appSlope < 0) {
    insights.push('Application volume is softening vs the first half of the 30-day trend — check whether job quality, rates, or routing changed.');
  }
  if (jobSlope < 0) {
    insights.push('New job postings are cooling vs the first half of the 30-day window — pair with CRM outreach if pipeline is a goal.');
  }
  if (!insights.length) {
    insights.push(
      `No major red flags in ${filterCtx} for this slice. Keep watching fill rate, stale opens, and undersupplied trades in the tables below.`
    );
  }

  const actions = [];
  if (staleCount > 0) {
    actions.push(`Clear the ${staleCount} stale open listing(s): confirm budget/rate, widen trade or geography, or re-broadcast to qualified technicians.`);
  }
  if (undersuppliedTrades.length) {
    actions.push(`Recruit or verify technicians in: ${undersuppliedTrades.slice(0, 3).join(', ')}.`);
  }
  actions.push('Run background-check and profile completeness review from Admin → Users for technicians touching paid work.');
  if (!undersuppliedTrades.length && staleCount === 0) {
    actions.push('Spot-check companies with repeat posts and no fills — early churn risk.');
  }

  return { score, status, bars, insights, actions };
}

function trendSlope(values) {
  if (!values.length) return 0;
  const n = values.length;
  const mid = Math.floor(n / 2);
  const a = values.slice(0, mid).reduce((s, v) => s + v, 0) / Math.max(mid, 1);
  const b = values.slice(mid).reduce((s, v) => s + v, 0) / Math.max(n - mid, 1);
  return b - a;
}

function slopeToBar(slope) {
  return Math.max(0, Math.min(100, Math.round(50 + slope * 10)));
}

function aggregateJobStatuses(open, prog, completed, totalJobs, analytics) {
  const o = open.length;
  const p = prog.length;
  const c = completed.length;
  const other = Math.max(0, (analytics?.total_jobs ?? 0) - o - p - c);
  return [
    { label: 'Open', count: o, key: 'open' },
    { label: 'In progress (reserved/filled)', count: p, key: 'progress' },
    { label: 'Finished', count: c, key: 'finished' },
    { label: 'Other statuses', count: other, key: 'other' },
  ];
}

function buildTradeRows({ technicians, openJobs, applications, completedJobs }) {
  const tradeKeys = COMMAND_CENTER_TRADES.filter((t) => t.id !== 'all').map((t) => t.id);
  return tradeKeys.map((tid) => {
    const tLabel = COMMAND_CENTER_TRADES.find((t) => t.id === tid)?.label || tid;
    const techsForTrade = technicians.filter((r) => rowMatchesTrade(r.trade_type, r.trade_type, tid));
    const techsN = techsForTrade.length;
    const verifiedN = techsForTrade.filter((r) => r.background_verified).length;
    const openN = openJobs.filter((r) => rowMatchesTrade(r.skill_class, null, tid)).length;
    const appsN = applications.filter((r) => rowMatchesTrade(r.skill_class, null, tid)).length;
    const completedForTrade = completedJobs.filter((r) => rowMatchesTrade(r.skill_class, null, tid));
    const filledN = completedForTrade.length;
    const releasedCents = sumBy(completedForTrade, 'money_released_cents');
    const denom = openN + filledN;
    const fill = denom > 0 ? Math.round((filledN / denom) * 1000) / 10 : 0;
    let risk = 'Balanced';
    if (openN > techsN * 2 && openN >= 3) risk = 'Undersupplied';
    if (techsN > openN * 4 && techsN >= 5) risk = 'Oversupplied';
    if (techsN > 0 && fill < 15 && openN >= 2) risk = 'Needs attention';
    const rates = [...openJobs, ...completedJobs].filter((j) => rowMatchesTrade(j.skill_class, null, tid) && j.hourly_rate_cents);
    const avgRate =
      rates.length > 0 ? Math.round(rates.reduce((s, j) => s + (j.hourly_rate_cents || 0), 0) / rates.length) : null;
    return {
      trade: tLabel,
      tradeId: tid,
      activeTechs: techsN,
      verifiedTechs: verifiedN,
      openJobs: openN,
      applications: appsN,
      fillRate: `${fill}%`,
      avgHourlyCents: avgRate,
      releasedCents,
      risk,
    };
  });
}

function buildMarketCards({ openJobs, technicians, completedJobs }) {
  return COMMAND_CENTER_MARKETS.filter((m) => m.id !== 'all').map((m) => {
    const oj = openJobs.filter((r) => rowMatchesMarket(geoRowJob(r), m.id));
    const techN = technicians.filter((t) => rowMatchesMarket(geoRowJob(t), m.id)).length;
    const filled = completedJobs.filter((r) => rowMatchesMarket(geoRowJob(r), m.id));
    const openN = oj.length;
    const fill = openN + filled.length > 0 ? Math.round((filled.length / Math.max(openN + filled.length, 1)) * 100) : 0;
    return {
      id: m.id,
      label: m.label,
      activeTechs: techN,
      openJobs: openN,
      fillRate: `${fill}%`,
      avgHourlyCents: null,
      revenueCents: sumBy(filled, 'money_released_cents'),
      health: fill >= 40 ? 'Healthy' : fill >= 20 ? 'Watch' : 'Critical',
    };
  });
}

function geoRowJob(r) {
  return { city: r.city, state: r.state, location: r.location };
}

function buildAlerts({ staleOpen, feedbackList, nowMs, marketLabel, tradeLabel }) {
  const filterNote = [marketLabel, tradeLabel].filter(Boolean).join(' · ');
  const out = [];
  staleOpen.slice(0, 12).forEach((j) => {
    const tradeHint = j.skill_class ? String(j.skill_class) : 'Trade TBD';
    out.push({
      id: `stale-${j.id}`,
      severity: 'Warning',
      entity: 'Job',
      title: `No applicants 48h+ — ${j.title || 'Open role'} (${tradeHint})`,
      description: `Still open with zero applications in the selected period. ${filterNote}.`,
      since: j.created_at,
      cta: { label: 'Open job', href: `/jobs/${j.id}` },
    });
  });
  safeArr(feedbackList)
    .filter((f) => norm(f.kind).includes('problem'))
    .slice(0, 5)
    .forEach((f) => {
      out.push({
        id: `fb-${f.id}`,
        severity: 'Info',
        entity: 'Feedback',
        title: `Feedback: ${f.kind || 'note'}`,
        description: (f.body || '').slice(0, 120),
        since: f.created_at,
        cta: { label: 'Users', href: '/admin/users' },
      });
    });
  if (!out.length) {
    out.push({
      id: 'none',
      severity: 'Info',
      entity: 'System',
      title: 'No automated alerts',
      description: 'Rules did not fire for the current filters. Alerts appear for stale jobs and problem feedback.',
      since: new Date(nowMs).toISOString(),
      cta: null,
    });
  }
  return out;
}

function buildTasks({ staleOpen, marketLabel, tradeLabel }) {
  const scope = `${marketLabel} · ${tradeLabel}`;
  const tasks = [];
  if (staleOpen.length) {
    tasks.push({
      id: 't1',
      priority: 'P1',
      category: 'Liquidity',
      title: `Unblock ${staleOpen.length} aged open role(s) — ${scope}`,
      estimate: '45m',
      due: 'Today',
      cta: { label: 'View jobs', href: '/jobs' },
    });
  }
  tasks.push({
    id: 't2',
    priority: 'P2',
    category: 'Supply',
    title: `Rebalance technician bench vs open demand (${scope})`,
    estimate: '20m',
    due: 'This week',
    cta: { label: 'Users', href: '/admin/users' },
  });
  tasks.push({
    id: 't3',
    priority: 'P2',
    category: 'Quality',
    title: 'Triage problem feedback and thread with companies if needed',
    estimate: '15m',
    due: 'Soon',
    cta: { label: 'Messages', href: '/messages' },
  });
  return tasks;
}

function buildActivityFeed({ applications, feedbackList, openJobs }) {
  const items = [];
  safeArr(applications)
    .slice(0, 15)
    .forEach((r) => {
      items.push({
        id: `app-${r.id}`,
        icon: 'briefcase',
        title: r.technician_email || 'Technician',
        ts: r.created_at,
        text: `Applied to “${r.job_title || 'Job'}”`,
        href: r.job_id ? `/jobs/${r.job_id}` : '/jobs',
      });
    });
  safeArr(feedbackList)
    .slice(0, 8)
    .forEach((f) => {
      items.push({
        id: `fb-${f.id}`,
        icon: 'comment',
        title: f.user_email || 'User',
        ts: f.created_at,
        text: `Feedback (${f.kind || 'note'})`,
        href: '/dashboard',
      });
    });
  safeArr(openJobs)
    .slice(0, 5)
    .forEach((j) => {
      items.push({
        id: `job-${j.id}`,
        icon: 'plus',
        title: j.company_name || 'Company',
        ts: j.created_at,
        text: `Open job posted: ${j.title || 'Job'}`,
        href: `/jobs/${j.id}`,
      });
    });
  return items.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0)).slice(0, 25);
}

function buildTechVerificationFunnel(techCount, verifiedCount) {
  return [
    { label: 'Signed up (accounts)', count: techCount },
    { label: 'Background verified', count: verifiedCount },
    { label: 'License on file', count: null, footnote: 'Not exposed in insights yet' },
    { label: 'Compliance pending', count: null, footnote: 'Wire when compliance workflow ships' },
    { label: 'Trade-certified', count: null, footnote: 'Not exposed in insights yet' },
    { label: 'First job completed', count: null, footnote: 'Derive from job history when available' },
  ];
}

function buildCompanyActivationFunnel(coCount) {
  return [
    { label: 'Signed up (accounts)', count: coCount },
    { label: 'Profile with location', count: null, footnote: 'Derive from company profiles when exposed' },
    { label: 'Payment method on file', count: null, footnote: 'Stripe aggregate when wired' },
    { label: 'First job posted', count: null, footnote: 'Derive from jobs when exposed' },
    { label: 'First job filled', count: null, footnote: 'Derive from jobs when exposed' },
    { label: 'Repeat job posted', count: null, footnote: 'Derive from jobs when exposed' },
  ];
}
