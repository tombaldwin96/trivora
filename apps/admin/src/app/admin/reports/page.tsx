import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';

export default async function AdminReportsPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  const { data: reportsData } = await supabase.from('reports').select('id, target_type, target_id, reason, status, created_at').order('created_at', { ascending: false }).limit(50);
  type ReportRow = { id: string; target_type: string; target_id: string; reason: string; status: string; created_at: string };
  const reports = (reportsData ?? []) as ReportRow[];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.target_type} / {r.target_id}</td>
                <td className="px-4 py-2">{r.reason}</td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2"><Link href={`/admin/reports/${r.id}`} className="text-indigo-600 text-sm">Review</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
