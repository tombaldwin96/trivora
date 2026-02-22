import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';

export default async function AdminIdeasPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  const { data: rows } = await supabase
    .from('idea_submissions')
    .select('id, first_name, last_name, email, description, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  type Row = { id: string; first_name: string; last_name: string; email: string; description: string; created_at: string };
  const submissions = (rows ?? []) as Row[];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Idea submissions</h1>
      <div className="rounded-lg border bg-white overflow-hidden">
        {submissions.length === 0 ? (
          <p className="p-6 text-slate-500">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Submitted</th>
                </tr>
              </thead>
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
      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
