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

const PIE_COLORS = ['#1e293b', '#0d9488', '#ea580c', '#64748b', '#475569', '#334155'];

function usd(cents) {
  if (cents == null || cents === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function tierBadge(tier) {
  if (tier === 'critical') return <StatusBadge variant="danger">72h+</StatusBadge>;
  if (tier === 'warn') return <StatusBadge variant="warning">48h+</StatusBadge>;
  if (tier === 'aging') return <StatusBadge variant="warning">24h+</StatusBadge>;
  return <StatusBadge variant="neutral">Fresh</StatusBadge>;
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">{children}</p>
  );
}

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

  const releasedByTrade = (revenue?.releasedByTrade || []).map((r) => ({
    name: r.trade.length > 16 ? `${r.trade.slice(0, 14)}…` : r.trade,
    releasedCents: r.releasedCents || 0,
  }));
  const hasReleasedByTrade = releasedByTrade.some((r) => r.releasedCents > 0);

  return (
    <div className="space-y-8">
      <section>
        <SectionLabel>Liquidity — supply vs demand</SectionLabel>
        <SupplyDemandPanel series={supplyDemandSeries} />

        <div className="mt-4">
          <DataTable
            dense
            title="Supply vs demand by trade"
            subtitle="Technician profiles vs open jobs, applications, and released payouts in the current filter."
            columns={[
              { key: 'trade', label: 'Trade' },
              { key: 'activeTechs', label: 'Techs' },
              { key: 'verifiedTechs', label: 'Verified' },
              { key: 'openJobs', label: 'Open' },
              { key: 'applications', label: 'Apps' },
              { key: 'fillRate', label: 'Fill %' },
              {
                key: 'releasedCents',
                label: 'Released',
                render: (r) => (r.releasedCents > 0 ? usd(r.releasedCents) : '—'),
              },
              {
                key: 'avgHourlyCents',
                label: 'Avg rate',
                render: (r) => (r.avgHourlyCents != null ? `${usd(r.avgHourlyCents)}/hr` : '—'),
              },
              {
                key: 'risk',
                label: 'Balance',
                render: (r) => {
                  const v = r.risk === 'Undersupplied' ? 'danger' : r.risk === 'Oversupplied' ? 'warning' : r.risk === 'Needs attention' ? 'warning' : 'neutral';
                  return <StatusBadge variant={v}>{r.risk}</StatusBadge>;
                },
              },
            ]}
            rows={tradeRows || []}
            emptyMessage="No trade rows for this filter."
          />
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jobs by status</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Filtered insight slices vs remainder from totals.</p>
            <div className="h-52">
              {!jobStatusChart.some((x) => x.value > 0) ? (
                <p className="text-xs text-slate-500 h-full flex items-center justify-center">No jobs in this filter</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={jobStatusChart} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2}>
                      {jobStatusChart.map((_, i) => (
                        <Cell key={jobStatusChart[i].name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <Link to="/jobs" className="mt-1 inline-block text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline">
              View all jobs
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application outcomes</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Counts from the job applications insight window.</p>
            <div className="h-52 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[appRow]} margin={{ top: 6, right: 6, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Requested" fill="#1e40af" name="Requested" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Accepted" fill="#0f766e" name="Accepted" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Rejected" fill="#c2410c" name="Rejected" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Requested = pending review; accepted/rejected from application status.</p>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Operations — aging & bench</SectionLabel>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <DataTable
            dense
            title="Open jobs — age & queue"
            subtitle="Age from posted time; applications count is in-window from insights."
            columns={[
              {
                key: 'title',
                label: 'Job',
                cellClassName: 'whitespace-normal max-w-[min(20rem,40vw)]',
                render: (r) => (
                  <Link className="font-medium text-slate-900 hover:text-blue-700 hover:underline" to={`/jobs/${r.id}`}>
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
                render: (r) => (r.hourly_rate_cents != null ? `${usd(r.hourly_rate_cents)}/hr` : '—'),
              },
              {
                key: 'tier',
                label: 'SLO',
                render: (r) => tierBadge(r.tier),
              },
              {
                key: 'recommendedAction',
                label: 'Next step',
                cellClassName: 'whitespace-normal max-w-[min(18rem,45vw)] text-slate-600',
              },
            ]}
            rows={jobOps?.agingJobs || []}
            emptyMessage="No open jobs in this filter."
          />

          <div className="space-y-4">
            <DataTable
              dense
              title="Technicians — top earners (window)"
              subtitle="Sorted by money_earned_cents in the insights window."
              columns={[
                { key: 'email', label: 'Email', cellClassName: 'max-w-[12rem] truncate' },
                { key: 'trade_type', label: 'Trade' },
                { key: 'city', label: 'City' },
                {
                  key: 'background_verified',
                  label: 'BG',
                  render: (r) =>
                    r.background_verified ? <StatusBadge variant="success">Yes</StatusBadge> : <StatusBadge variant="neutral">No</StatusBadge>,
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
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verification funnel</h3>
              <ul className="mt-2 space-y-2 text-xs text-slate-700">
                {(techOps?.verificationFunnel || []).map((s) => (
                  <li key={s.label} className="border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex justify-between gap-2">
                      <span>{s.label}</span>
                      <span className="font-mono tabular-nums text-slate-900">{s.count ?? '—'}</span>
                    </div>
                    {s.footnote && <p className="text-[10px] text-slate-500 mt-0.5">{s.footnote}</p>}
                  </li>
                ))}
              </ul>
              <Link to="/admin/users" className="mt-2 inline-block text-xs font-semibold text-slate-700 hover:underline">
                Admin users
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Demand side — companies</SectionLabel>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <DataTable
            dense
            title="Companies — spend (window)"
            subtitle="Sorted by money_spent_cents in the insights window."
            columns={[
              { key: 'company_name', label: 'Company' },
              { key: 'email', label: 'Email', cellClassName: 'max-w-[12rem] truncate' },
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
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company activation</h3>
            <ul className="mt-2 space-y-2 text-xs text-slate-700">
              {(companyOps?.activationFunnel || []).map((s) => (
                <li key={s.label} className="border-b border-slate-100 pb-2 last:border-0">
                  <div className="flex justify-between gap-2">
                    <span>{s.label}</span>
                    <span className="font-mono tabular-nums text-slate-900">{s.count ?? '—'}</span>
                  </div>
                  {s.footnote && <p className="text-[10px] text-slate-500 mt-0.5">{s.footnote}</p>}
                  </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Matching & revenue</SectionLabel>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <DataTable
            dense
            title="Recent applications"
            subtitle="Latest applications in the filtered window — review status and routing."
            columns={[
              {
                key: 'job_title',
                label: 'Job',
                cellClassName: 'whitespace-normal max-w-[min(16rem,40vw)]',
                render: (r) => (
                  <Link to={`/jobs/${r.job_id}`} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                    {r.job_title}
                  </Link>
                ),
              },
              { key: 'company_name', label: 'Company' },
              { key: 'technician_email', label: 'Technician', cellClassName: 'max-w-[12rem] truncate' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => {
                  const st = String(r.status || '').toLowerCase();
                  if (st === 'accepted') return <StatusBadge variant="success">{r.status}</StatusBadge>;
                  if (st === 'rejected') return <StatusBadge variant="neutral">{r.status}</StatusBadge>;
                  return <StatusBadge variant="warning">{r.status || '—'}</StatusBadge>;
                },
              },
            ]}
            rows={matching?.recentApplications || []}
            emptyMessage="No applications in window/filter."
          />

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue & payouts</h2>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-slate-500">Paid volume proxy</p>
                <p className="text-base font-semibold tabular-nums text-slate-900 mt-0.5">{usd(revenue?.gmvProxyCents)}</p>
                <p className="text-[10px] text-slate-500 mt-1">Technician earnings + company spend in window (insights).</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-slate-500">Spend / earned</p>
                <p className="text-sm font-semibold tabular-nums text-slate-900 mt-0.5">
                  {usd(revenue?.coSpendCents)} / {usd(revenue?.techEarnedCents)}
                </p>
              </div>
            </div>

            {hasReleasedByTrade ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={releasedByTrade} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={48} />
                    <YAxis width={44} tick={{ fontSize: 9 }} tickFormatter={(v) => `$${Math.round(Number(v) / 100)}`} />
                    <Tooltip formatter={(v) => usd(v)} />
                    <Bar dataKey="releasedCents" name="Released (completed)" fill="#1e293b" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2">
                No released payout totals by trade in this filter. Totals above still reflect aggregate window spend/earned when present.
              </p>
            )}

            <DataTable
              dense
              title="Payment issues"
              subtitle="Payment failures and holds will appear here when the admin feed is connected."
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
      </section>

      <section>
        <SectionLabel>Markets & admin queue</SectionLabel>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Markets</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
              Metro buckets use city/location string heuristics — refine when structured metro codes exist in data.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(markets || []).map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-600">{m.label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                    {m.openJobs} open · {m.activeTechs} techs
                  </p>
                  <p className="text-[11px] text-slate-600">{m.fillRate} fill · {usd(m.revenueCents)} released</p>
                  <div className="mt-1.5">
                    <StatusBadge variant={m.health === 'Healthy' ? 'success' : m.health === 'Critical' ? 'danger' : 'warning'}>
                      {m.health}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Coverage</h3>
            <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
              Geography in this dashboard is inferred from job and profile text fields. For territory planning, export CRM or
              wire structured metro reporting.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Link to="/crm" className="text-xs font-semibold text-slate-800 hover:underline">
                Open CRM
              </Link>
              <Link to="/jobs" className="text-xs font-semibold text-slate-800 hover:underline">
                Browse jobs
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alerts</h2>
            <ul className="mt-2 space-y-2 max-h-[20rem] overflow-y-auto pr-1">
              {(alerts || []).map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="flex justify-between gap-2 items-start">
                    <StatusBadge variant={a.severity === 'Critical' ? 'danger' : a.severity === 'Warning' ? 'warning' : 'info'}>
                      {a.severity}
                    </StatusBadge>
                    <span className="text-[10px] text-slate-500 shrink-0">{a.since ? new Date(a.since).toLocaleString() : ''}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 mt-1">{a.entity}</p>
                  <p className="text-xs font-semibold text-slate-900 leading-snug">{a.title}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{a.description}</p>
                  {a.cta && (
                    <Link to={a.cta.href} className="mt-1.5 inline-block text-xs font-semibold text-slate-800 hover:underline">
                      {a.cta.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin task queue</h2>
            <ul className="mt-2 space-y-2">
              {(tasks || []).map((t) => (
                <li key={t.id} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <StatusBadge variant={t.priority === 'P1' ? 'danger' : 'neutral'}>{t.priority}</StatusBadge>
                    <span className="text-slate-500">{t.category}</span>
                    <span className="text-slate-400">~{t.estimate}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 mt-1 leading-snug">{t.title}</p>
                  {t.cta && (
                    <Link to={t.cta.href} className="mt-1 inline-block text-xs font-semibold text-slate-800 hover:underline">
                      {t.cta.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent activity</h2>
          <ul className="mt-2 divide-y divide-slate-100 max-h-[18rem] overflow-y-auto">
            {(activity || []).length === 0 ? (
              <li className="py-6 text-center text-xs text-slate-500">No recent events in this filter.</li>
            ) : (
              (activity || []).map((item) => (
                <li key={item.id} className="py-2 flex gap-2">
                  <div className="h-7 w-7 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] font-semibold text-slate-500 shrink-0">
                    {(item.icon || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-600 leading-snug">{item.text}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{item.ts ? new Date(item.ts).toLocaleString() : ''}</p>
                    {item.href && (
                      <Link to={item.href} className="text-[10px] font-semibold text-slate-700 hover:underline">
                        Open
                      </Link>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
