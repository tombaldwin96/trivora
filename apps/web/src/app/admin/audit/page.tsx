import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '../actions';
import { createAdminSupabaseServer } from '@/lib/supabase-admin';

export default async function AdminAuditPage() {
  const session = await getAdminSession();
  if (!session.loggedIn) redirect('/admin');

  const supabase = createAdminSupabaseServer();
  if (!supabase) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Audit logs</h1>
          <Link href="/admin" className="text-slate-600 text-sm hover:text-slate-900">← Back to admin</Link>
        </div>
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for admin data.</p>
      </div>
    );
  }
  const { data: logsData } = await supabase.from('audit_logs').select('id, action, entity_type, entity_id, created_at').order('created_at', { ascending: false }).limit(100);
  type LogRow = { id: string; action: string; entity_type: string; entity_id: string | null; created_at: string };
  const logs = (logsData ?? []) as LogRow[];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit logs</h1>
        <Link href="/admin" className="text-slate-600 text-sm hover:text-slate-900">← Back to admin</Link>
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2">{l.action}</td>
                <td className="px-4 py-2">{l.entity_type}</td>
                <td className="px-4 py-2 font-mono text-sm">{l.entity_id ?? '—'}</td>
                <td className="px-4 py-2">{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
