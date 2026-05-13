import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export default function SupplyDemandPanel({ series }) {
  const data = Array.isArray(series) ? series : [];
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Supply vs demand (30-day trends)</h2>
      <p className="text-xs text-slate-500 mt-1 mb-4">
        New user signups vs jobs created per day from analytics spine. For trade-specific balance use the table below.
      </p>
      <div className="h-64 w-full">
        {!data.length ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">No series</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
              <YAxis width={32} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="techSignups" name="User signups / day" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="openJobsTrend" name="Jobs created / day" stroke="#ea580c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
