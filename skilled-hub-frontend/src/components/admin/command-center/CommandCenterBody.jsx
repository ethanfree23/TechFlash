import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import DataTable from './DataTable';
import StatusBadge from './StatusBadge';
import SupplyDemandPanel from './SupplyDemandPanel';

const PIE_COLORS = ['#2563eb', '#0d9488', '#f59e0b', '#64748b', '#7c3aed', '#e11d48'];

function usd(cents) {
  if (cents == null || cents === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function tierBadge(tier) {
  if (tier === 'critical') return <StatusBadge variant="danger">72h+</StatusBadge>;
  if (tier === 'warn') return <StatusBadge variant="warning">48h+</StatusBadge>;
  if (tier === 'aging') return <StatusBadge variant="orange">24h+</StatusBadge>;
  return <StatusBadge variant="success">Fresh</StatusBadge>;
}

const HOT_ZONES = [
  'North Houston',
  'The Heights',
  'Katy',
  'Pasadena',
  'Pearland',
  'Sugar Land',
  'Humble / Kingwood',
  'Cypress',
  'Spring',
  'Baytown',
];

export default function CommandCenterBody({ model }) {
  if (!model) return null;

  const { jobOps, techOps, companyOps, matching, revenue, markets, alerts, tasks, activity, tradeRows, supplyDemandSeries } =
    model;

  const jobStatusChart = (jobOps?.statusCounts || []).map((s) => ({ name: s.label, value: s.count }));

  const appRow = {
    name: 'Applications',
    Requested: matching?.appStatusCounts?.requested || 0,
    Accepted: matching?.appStatusCounts?.accepted || 0,
    Rejected: matching?.appStatusCounts?.rejected || 0,
  };

  const revenueByTrade = (tradeRows || []).map((r) => ({
    name: r.trade.slice(0, 14),
    gmv: Math.round((r.openJobs || 0) * 42000),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Jobs by status (filtered slices)</h2>
          <p className="text-xs text-slate-500 mt-1 mb-3">Open / in-progress / completed subsets in view + other (from totals).</p>
          <div className="h-56">
            {!jobStatusChart.some((x) => x.value > 0) ? (
              <p className="text-sm text-slate-500 py-12 text-center">No jobs in filter</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={jobStatusChart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                    {jobStatusChart.map((_, i) => (
                      <Cell key={jobStatusChart[i].name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <Link to="/jobs" className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline">
            View all jobs
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Applications (counts, window)</h2>
          <div className="h-56 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[appRow]} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={32} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Requested" fill="#2563eb" name="Requested" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Accepted" fill="#0d9488" name="Accepted" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Rejected" fill="#ea580c" name="Rejected" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-2">Requested = pending review; accepted/rejected from JobApplication enum.</p>
        </div>
      </div>

      <SupplyDemandPanel series={supplyDemandSeries} />

      <DataTable
        title="Supply vs demand by trade"
        subtitle="Filtered technician profiles vs open jobs and applications in the selected window."
        columns={[
          { key: 'trade', label: 'Trade' },
          { key: 'activeTechs', label: 'Techs' },
          { key: 'verifiedTechs', label: 'Verified' },
          { key: 'openJobs', label: 'Open jobs' },
          { key: 'applications', label: 'Apps' },
          { key: 'fillRate', label: 'Fill %' },
          {
            key: 'avgHourlyCents',
            label: 'Avg rate',
            render: (r) => (r.avgHourlyCents != null ? usd(r.avgHourlyCents) + '/hr' : '—'),
          },
          {
            key: 'risk',
            label: 'Risk',
            render: (r) => {
              const v = r.risk === 'Undersupplied' ? 'danger' : r.risk === 'Oversupplied' ? 'warning' : 'success';
              return <StatusBadge variant={v}>{r.risk}</StatusBadge>;
            },
          },
        ]}
        rows={tradeRows || []}
        emptyMessage="No trade rows for this filter."
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DataTable
          title="Job operations — aging open jobs"
          subtitle="Uses platform open job list with age since created_at. Applications count is in-window from insights."
          columns={[
            {
              key: 'title',
              label: 'Job',
              render: (r) => (
                <Link className="font-medium text-blue-700 hover:underline" to={`/jobs/${r.id}`}>
                  {r.title || `Job #${r.id}`}
                </Link>
              ),
            },
            { key: 'company_name', label: 'Company' },
            { key: 'skill_class', label: 'Trade' },
            { key: 'locationLabel', label: 'Location' },
            {
              key: 'created_at',
              label: 'Posted',
              render: (r) => (r.created_at ? new Date(r.created_at).toLocaleString() : '—'),
            },
            { key: 'ageHours', label: 'Age (h)' },
            { key: 'applications_in_period', label: 'Apps' },
            {
              key: 'hourly_rate_cents',
              label: 'Rate',
              render: (r) => (r.hourly_rate_cents != null ? usd(r.hourly_rate_cents) + '/hr' : '—'),
            },
            {
              key: 'tier',
              label: 'SLO',
              render: (r) => tierBadge(r.tier),
            },
            { key: 'recommendedAction', label: 'Action' },
          ]}
          rows={jobOps?.agingJobs || []}
          emptyMessage="No open jobs in this filter."
        />

        <div className="space-y-6">
          <DataTable
            title="Technician operations"
            subtitle="Top earners in window (money_earned_cents). Background verified flag from profile."
            columns={[
              { key: 'email', label: 'Email' },
              { key: 'trade_type', label: 'Trade' },
              { key: 'city', label: 'City' },
              {
                key: 'background_verified',
                label: 'BG check',
                render: (r) => (r.background_verified ? <StatusBadge variant="success">Yes</StatusBadge> : <StatusBadge variant="warning">No</StatusBadge>),
              },
              {
                key: 'money_earned_cents',
                label: 'Earned',
                render: (r) => usd(r.money_earned_cents),
              },
              { key: 'logins', label: 'Logins' },
            ]}
            rows={model.topTechnicians || []}
            emptyMessage="No technicians in filter."
          />
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">Verification funnel</h3>
            <ul className="mt-2 space-y-3 text-sm text-slate-700">
              {(techOps?.verificationFunnel || []).map((s) => (
                <li key={s.label} className="border-b border-slate-100 pb-2">
                  <div className="flex justify-between gap-2">
                    <span>{s.label}</span>
                    <span className="font-mono text-xs tabular-nums">{s.count ?? '—'}</span>
                  </div>
                  {s.footnote && <p className="text-[10px] text-slate-400 mt-1">{s.footnote}</p>}
                </li>
              ))}
            </ul>
            <Link to="/admin/users" className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline">
              Review users
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DataTable
          title="Company operations"
          subtitle="Spend and engagement in selected window."
          columns={[
            { key: 'company_name', label: 'Company' },
            { key: 'email', label: 'Email' },
            { key: 'location', label: 'Location' },
            {
              key: 'money_spent_cents',
              label: 'Spend',
              render: (r) => usd(r.money_spent_cents),
            },
            { key: 'logins', label: 'Logins' },
          ]}
          rows={model.topCompanies || []}
          emptyMessage="No companies in filter."
        />
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Company activation funnel</h3>
          <ul className="mt-2 space-y-3 text-sm text-slate-700">
            {(companyOps?.activationFunnel || []).map((s) => (
              <li key={s.label} className="border-b border-slate-100 pb-2">
                <div className="flex justify-between gap-2">
                  <span>{s.label}</span>
                  <span className="font-mono text-xs tabular-nums">{s.count ?? '—'}</span>
                </div>
                {s.footnote && <p className="text-[10px] text-slate-400 mt-1">{s.footnote}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DataTable
          title="Matching — recent applications"
          subtitle="Match score is placeholder until matching service exists."
          columns={[
            {
              key: 'job_title',
              label: 'Job',
              render: (r) => (
                <Link to={`/jobs/${r.job_id}`} className="text-blue-700 font-medium hover:underline">
                  {r.job_title}
                </Link>
              ),
            },
            { key: 'company_name', label: 'Company' },
            { key: 'technician_email', label: 'Technician' },
            { key: 'status', label: 'Status' },
            {
              key: 'matchScore',
              label: 'Match',
              render: (r) => (r.matchScore == null ? '—' : r.matchScore),
            },
          ]}
          rows={matching?.recentApplications || []}
          emptyMessage="No applications in window/filter."
        />

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Revenue & payments</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Paid volume proxy (window)</p>
              <p className="text-lg font-bold text-slate-900">{usd(revenue?.gmvProxyCents)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Sum of technician earnings + company spend in insights window.</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Company spend / tech earned</p>
              <p className="text-sm font-semibold text-slate-800">{usd(revenue?.coSpendCents)} / {usd(revenue?.techEarnedCents)}</p>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByTrade} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={54} />
                <YAxis width={36} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip formatter={(v) => usd(v)} />
                <Bar dataKey="gmv" name="Illustrative GMV" fill="#ea580c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
            Revenue-by-trade chart uses a placeholder curve from open-job counts until backend sends real GMV splits.
          </p>
          <DataTable
            title="Payment issues"
            subtitle="TODO: wire Payment / Stripe failure feed when available."
            columns={[
              { key: 'company', label: 'Company' },
              { key: 'amount', label: 'Amount' },
              { key: 'issue', label: 'Issue' },
            ]}
            rows={revenue?.paymentIssues || []}
            emptyMessage="No payment issues loaded."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Markets (heuristic)</h2>
          <p className="text-xs text-slate-500 mt-1 mb-3">City/location string match — refine with structured metro later.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(markets || []).map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50/80">
                <p className="text-xs font-semibold text-slate-500">{m.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{m.openJobs} open</p>
                <p className="text-xs text-slate-600">{m.activeTechs} techs · {m.fillRate} fill</p>
                <p className="text-xs mt-1">{usd(m.revenueCents)} released (completed slice)</p>
                <StatusBadge variant={m.health === 'Healthy' ? 'success' : m.health === 'Critical' ? 'danger' : 'warning'}>
                  {m.health}
                </StatusBadge>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-600 mb-2">Houston hot zones (reference)</p>
            <div className="flex flex-wrap gap-1.5">
              {HOT_ZONES.map((z) => (
                <span key={z} className="text-[11px] rounded-full bg-white border border-slate-200 px-2 py-0.5 text-slate-700">
                  {z}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-900 to-slate-800 p-5 text-white shadow-sm">
          <h3 className="text-sm font-semibold text-slate-200">Geo heatmap</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Map layer placeholder. Connect admin map data or reuse Google Maps with anonymized aggregates in a future iteration.
          </p>
          <div className="mt-4 h-40 rounded-lg bg-slate-700/80 border border-slate-600/80 flex items-center justify-center text-xs text-slate-300">
            Map preview
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Alert center</h2>
          <ul className="mt-3 space-y-3 max-h-[22rem] overflow-y-auto pr-1">
            {(alerts || []).map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-100 p-3 bg-slate-50/80">
                <div className="flex justify-between gap-2">
                  <StatusBadge variant={a.severity === 'Critical' ? 'danger' : a.severity === 'Warning' ? 'warning' : 'info'}>
                    {a.severity}
                  </StatusBadge>
                  <span className="text-[11px] text-slate-500">{a.since ? new Date(a.since).toLocaleString() : ''}</span>
                </div>
                <p className="text-xs font-semibold text-slate-500 mt-1">{a.entity}</p>
                <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                <p className="text-xs text-slate-600 mt-1">{a.description}</p>
                {a.cta && (
                  <Link to={a.cta.href} className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline">
                    {a.cta.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin task queue</h2>
          <ul className="mt-3 space-y-3">
            {(tasks || []).map((t) => (
              <li key={t.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge variant="orange">{t.priority}</StatusBadge>
                  <span className="text-slate-500">{t.category}</span>
                  <span className="text-slate-400">Est. {t.estimate}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 mt-1">{t.title}</p>
                {t.cta && (
                  <Link to={t.cta.href} className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline">
                    {t.cta.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent activity</h2>
        <ul className="mt-3 divide-y divide-slate-100 max-h-[22rem] overflow-y-auto">
          {(activity || []).map((item) => (
            <li key={item.id} className="py-3 flex gap-3">
              <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                {item.icon?.[0]?.toUpperCase() || '•'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-600">{item.text}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{item.ts ? new Date(item.ts).toLocaleString() : ''}</p>
                {item.href && (
                  <Link to={item.href} className="text-xs font-semibold text-blue-700 hover:underline">
                    Open
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
