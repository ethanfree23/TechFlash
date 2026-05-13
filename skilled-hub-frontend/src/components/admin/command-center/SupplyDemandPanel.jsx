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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Supply vs demand (30-day)</h2>
      <p className="text-[10px] text-slate-500 mt-0.5 mb-3 leading-snug">
        Daily new accounts vs jobs created from analytics. Use the trade table for skill-level balance.
      </p>
      <div className="h-52 w-full">
        {!data.length ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
            No trend series for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} />
              <YAxis width={28} tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="techSignups" name="Signups / day" stroke="#1e40af" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="openJobsTrend" name="Jobs / day" stroke="#c2410c" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
