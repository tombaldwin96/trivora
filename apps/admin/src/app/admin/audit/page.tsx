import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';

export default async function AdminAuditPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  const { data: logsData } = await supabase.from('audit_logs').select('id, action, entity_type, entity_id, created_at').order('created_at', { ascending: false }).limit(100);
  type LogRow = { id: string; action: string; entity_type: string; entity_id: string | null; created_at: string };
  const logs = (logsData ?? []) as LogRow[];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Audit logs</h1>
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
      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
