import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '../actions';
import { createAdminSupabaseServer } from '@/lib/supabase-admin';

export default async function AdminIdeasPage() {
  const session = await getAdminSession();
  if (!session.loggedIn) redirect('/admin');
  const supabase = createAdminSupabaseServer();
  if (!supabase) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Idea submissions</h1>
          <Link href="/admin" className="text-slate-600 text-sm hover:text-slate-900">Back to admin</Link>
        </div>
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for admin data.</p>
      </div>
    );
  }
  const { data } = await supabase.from('idea_submissions').select('id, first_name, last_name, email, description, created_at').order('created_at', { ascending: false }).limit(200);
  const submissions = (data ?? []) as { id: string; first_name: string; last_name: string; email: string; description: string; created_at: string }[];
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Idea submissions</h1>
        <Link href="/admin" className="text-slate-600 text-sm hover:text-slate-900">Back to admin</Link>
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        {submissions.length === 0 ? <p className="p-6 text-slate-500">No submissions yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-slate-50"><tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Submitted</th></tr></thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{s.first_name} {s.last_name}</td>
                    <td className="px-4 py-2 text-slate-600">{s.email}</td>
                    <td className="px-4 py-2 max-w-md text-slate-700 whitespace-pre-wrap">{s.description}</td>
                    <td className="px-4 py-2 text-slate-500 text-sm">{new Date(s.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
