'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Snapshot = { bucket_utc: string; user_count: number };

export function OnlineUsersChart({ data }: { data: Snapshot[] }) {
  const points = data.map((d) => ({
    hour: new Date(d.bucket_utc).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    users: Number(d.user_count),
    full: new Date(d.bucket_utc).toLocaleString(),
  }));

  if (points.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-50 rounded-lg">
        No snapshot data yet. Record a snapshot (or run cron hourly) to see the graph.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
            formatter={(value: number | undefined) => [`${value ?? 0} users`, 'Online']}
          />
          <Bar dataKey="users" fill="#6366f1" radius={[4, 4, 0, 0]} name="Online" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
