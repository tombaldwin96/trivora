import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';
import { PushComposer } from './PushComposer';

export default async function AdminPushPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  const [
    { data: tokenCounts },
    { data: logRows },
  ] = await Promise.all([
    (supabase as any).rpc('get_admin_push_token_counts'),
    (supabase as any).rpc('get_admin_push_notification_log', { p_limit: 30 }),
  ]);

  const counts = (tokenCounts ?? []) as { platform: string; token_count: number }[];
  const log = (logRows ?? []) as {
    id: string;
    title: string;
    body: string | null;
    target: string;
    recipient_count: number;
    sent_at: string;
    created_by: string;
    meta_json?: { test?: boolean };
  }[];

  const totalDevices = counts.reduce((s, r) => s + Number(r.token_count), 0);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Push notifications</h1>
            <p className="text-slate-600 mt-1">Compose and send push notifications to app users.</p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            ← Back to admin
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Total devices</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalDevices.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">Registered for push</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">iOS</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {(counts.find((c) => c.platform === 'ios')?.token_count ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Android</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {(counts.find((c) => c.platform === 'android')?.token_count ?? 0).toLocaleString()}
            </p>
          </div>
        </div>

        <PushComposer tokenCounts={counts} />

        {/* History */}
        <div className="mt-10 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Recent sends</h2>
            <p className="text-sm text-slate-500 mt-0.5">Last 30 notifications sent from this console.</p>
          </div>
          <div className="overflow-x-auto">
            {log.length === 0 ? (
              <p className="p-6 text-slate-500 text-sm">No notifications sent yet.</p>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipients</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {log.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3">
                        <p className="font-medium text-slate-900">{row.title || '—'}</p>
                        {row.body && (
                          <p className="text-sm text-slate-500 truncate max-w-xs">{row.body}</p>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 capitalize">
                            {row.target}
                          </span>
                          {row.meta_json?.test && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                              Test
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600">{row.recipient_count}</td>
                      <td className="px-6 py-3 text-sm text-slate-500">
                        {new Date(row.sent_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
