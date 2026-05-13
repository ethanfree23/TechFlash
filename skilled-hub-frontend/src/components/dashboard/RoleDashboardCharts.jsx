import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const formatCurrency = (cents) => {
  if (cents == null || cents === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

const shortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const pieColors = ['#3b82f6', '#f59e0b', '#14b8a6', '#64748b', '#8b5cf6', '#22c55e'];

const DetailLink = ({ children, onClick, active }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-sm font-medium px-3 py-1.5 rounded-lg border transition ${
      active ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
    }`}
  >
    {children}
  </button>
);

export function AdminPlatformCharts({ analytics, insightCategory, onOpenInsight }) {
  const userMix = useMemo(() => {
    const tech = analytics?.technicians_count ?? 0;
    const comp = analytics?.companies_count ?? 0;
    const adm = analytics?.admins_count ?? 0;
    return [
      { name: 'Technicians', value: tech },
      { name: 'Companies', value: comp },
      { name: 'Admins', value: adm },
    ].filter((d) => d.value > 0);
  }, [analytics]);

  const jobMix = useMemo(() => {
    const open = analytics?.jobs_open ?? 0;
    const prog = analytics?.jobs_in_progress ?? 0;
    const done = analytics?.jobs_finished ?? 0;
    const total = analytics?.total_jobs ?? 0;
    const other = Math.max(0, total - open - prog - done);
    const rows = [
      { name: 'Open', value: open },
      { name: 'In progress', value: prog },
      { name: 'Completed', value: done },
    ];
    if (other > 0) rows.push({ name: 'Other status', value: other });
    return rows.filter((d) => d.value > 0);
  }, [analytics]);

  const trendData = useMemo(() => {
    const rows = analytics?.trends_last_30d;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      ...r,
      label: shortDate(r.date),
    }));
  }, [analytics]);

  if (!analytics) return null;

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Users by role</h3>
          <p className="text-xs text-gray-500 mb-3">Share of accounts (technicians, companies, admins)</p>
          <div className="h-64 w-full">
            {userMix.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center">No user data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={userMix} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2}>
                    {userMix.map((_, i) => (
                      <Cell key={userMix[i].name} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, 'Count']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Jobs by status</h3>
          <p className="text-xs text-gray-500 mb-3">Open, in progress, completed, and other statuses</p>
          <div className="h-64 w-full">
            {jobMix.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center">No jobs yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={jobMix} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2}>
                    {jobMix.map((_, i) => (
                      <Cell key={jobMix[i].name} fill={pieColors[(i + 1) % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, 'Jobs']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow border border-gray-100 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Activity (last 30 days)</h3>
        <p className="text-xs text-gray-500 mb-3">New users, jobs, and applications created per day</p>
        <div className="h-72 w-full">
          {trendData.length === 0 ? (
            <p className="text-sm text-gray-500 py-12 text-center">No trend data</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                <YAxis width={36} tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(_, p) => (p?.[0]?.payload?.date ? String(p[0].payload.date) : '')}
                  formatter={(value, name) => [value, name === 'users_created' ? 'Users' : name === 'jobs_created' ? 'Jobs' : 'Applications']}
                />
                <Legend formatter={(v) => (v === 'users_created' ? 'Users' : v === 'jobs_created' ? 'Jobs' : 'Applications')} />
                <Line type="monotone" dataKey="users_created" stroke="#6366f1" strokeWidth={2} dot={false} name="users_created" />
                <Line type="monotone" dataKey="jobs_created" stroke="#14b8a6" strokeWidth={2} dot={false} name="jobs_created" />
                <Line type="monotone" dataKey="applications_created" stroke="#f59e0b" strokeWidth={2} dot={false} name="applications_created" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Open detailed tables</p>
        <div className="flex flex-wrap gap-2">
          <DetailLink active={insightCategory === 'total_users'} onClick={() => onOpenInsight('total_users')}>
            All users
          </DetailLink>
          <DetailLink active={insightCategory === 'technicians'} onClick={() => onOpenInsight('technicians')}>
            Technicians
          </DetailLink>
          <DetailLink active={insightCategory === 'companies'} onClick={() => onOpenInsight('companies')}>
            Companies
          </DetailLink>
          <DetailLink active={insightCategory === 'total_jobs'} onClick={() => onOpenInsight('total_jobs')}>
            All jobs
          </DetailLink>
          <DetailLink active={insightCategory === 'job_applications'} onClick={() => onOpenInsight('job_applications')}>
            Applications
          </DetailLink>
          <DetailLink active={insightCategory === 'open_jobs'} onClick={() => onOpenInsight('open_jobs')}>
            Open jobs
          </DetailLink>
          <DetailLink active={insightCategory === 'jobs_in_progress'} onClick={() => onOpenInsight('jobs_in_progress')}>
            In progress
          </DetailLink>
          <DetailLink active={insightCategory === 'completed'} onClick={() => onOpenInsight('completed')}>
            Completed
          </DetailLink>
        </div>
      </div>
    </div>
  );
}

export function CompanyAnalyticsCharts({ analytics }) {
  const pipeline = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'Open', value: analytics.jobs_open ?? 0 },
      { name: 'Active', value: analytics.jobs_active ?? 0 },
      { name: 'Completed', value: analytics.jobs_completed ?? 0 },
      { name: 'Expired listings', value: analytics.jobs_expired ?? 0 },
    ].filter((d) => d.value > 0);
  }, [analytics]);

  const byDay = useMemo(() => {
    const rows = analytics?.jobs_created_by_day;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({ ...r, label: shortDate(r.date) }));
  }, [analytics]);

  if (!analytics) return null;

  return (
    <div className="mb-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">Analytics</h2>
        <p className="text-sm text-gray-600">
          Total spent: <span className="font-semibold text-gray-900">{formatCurrency(analytics.total_spent_cents)}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Your jobs pipeline</h3>
          <p className="text-xs text-gray-500 mb-3">Counts by current status</p>
          <div className="h-64 w-full">
            {pipeline.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center">No jobs yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pipeline} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={2}>
                    {pipeline.map((_, i) => (
                      <Cell key={pipeline[i].name} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, 'Jobs']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Jobs posted (last 30 days)</h3>
          <p className="text-xs text-gray-500 mb-3">New listings created per day</p>
          <div className="h-64 w-full">
            {byDay.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                  <YAxis width={36} tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(_, p) => (p?.[0]?.payload?.date ? String(p[0].payload.date) : '')}
                    formatter={(v) => [v, 'Jobs']}
                  />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} name="Jobs created" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TechnicianAnalyticsCharts({ analytics }) {
  const workMix = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'Completed', value: analytics.jobs_completed ?? 0 },
      { name: 'In progress', value: analytics.jobs_in_progress ?? 0 },
    ].filter((d) => d.value > 0);
  }, [analytics]);

  const earningsDay = useMemo(() => {
    const rows = analytics?.released_earnings_by_day;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      ...r,
      label: shortDate(r.date),
      dollars: (r.amount_cents ?? 0) / 100,
    }));
  }, [analytics]);

  if (!analytics) return null;

  return (
    <div className="mb-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800">Analytics</h2>
        <div className="text-sm text-gray-600 space-y-1 sm:text-right">
          <p>
            Total earned:{' '}
            <span className="font-semibold text-gray-900">{formatCurrency(analytics.total_earned_cents)}</span>
          </p>
          <p>
            Pending: <span className="font-semibold text-gray-900">{formatCurrency(analytics.pending_earned_cents)}</span>
            {' · '}
            Last 7 days: <span className="font-semibold text-gray-900">{formatCurrency(analytics.earned_this_week_cents)}</span>
          </p>
          <p>
            Avg rating:{' '}
            <span className="font-semibold text-gray-900">
              {analytics.average_rating != null ? `${Number(analytics.average_rating).toFixed(1)} / 5` : '—'}
            </span>
            {analytics.reviews_count > 0 && (
              <span className="text-gray-500"> ({analytics.reviews_count} reviews)</span>
            )}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Your workload</h3>
          <p className="text-xs text-gray-500 mb-3">Completed vs in progress</p>
          <div className="h-64 w-full">
            {workMix.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center">No jobs yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={workMix} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={2}>
                    {workMix.map((_, i) => (
                      <Cell key={workMix[i].name} fill={pieColors[(i + 2) % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, 'Jobs']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Released earnings (last 30 days)</h3>
          <p className="text-xs text-gray-500 mb-3">Payments marked released in the app (may differ from Stripe totals)</p>
          <div className="h-64 w-full">
            {earningsDay.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={earningsDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                  <YAxis width={44} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    labelFormatter={(_, p) => (p?.[0]?.payload?.date ? String(p[0].payload.date) : '')}
                    formatter={(v) => [formatCurrency(Math.round(Number(v) * 100)), 'Released']}
                  />
                  <Line type="monotone" dataKey="dollars" stroke="#059669" strokeWidth={2} dot={false} name="Released ($)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
