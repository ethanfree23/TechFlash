import React from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

export default function Sparkline({ data = [], color = '#2563eb' }) {
  const rows = Array.isArray(data) ? data.map((d, i) => ({ i, v: Number(d?.v) || 0 })) : [];
  if (!rows.length) {
    return <div className="h-8 w-20 rounded bg-slate-100 border border-slate-200" aria-hidden />;
  }
  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
