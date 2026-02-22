import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';

export default async function AdminQuizzesPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  const { data: quizzesData } = await supabase.from('quizzes').select('id, type, title, status, published_at').order('created_at', { ascending: false }).limit(50);
  type QuizRow = { id: string; type: string; title: string; status: string; published_at: string | null };
  const quizzes = (quizzesData ?? []) as QuizRow[];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Quizzes</h1>
        <Link href="/admin/quizzes/new" className="rounded-lg bg-slate-800 px-4 py-2 text-white text-sm">Add quiz</Link>
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Published</th>
            </tr>
          </thead>
          <tbody>
            {quizzes.map((q) => (
              <tr key={q.id} className="border-t">
                <td className="px-4 py-2">{q.title}</td>
                <td className="px-4 py-2">{q.type}</td>
                <td className="px-4 py-2">{q.status}</td>
                <td className="px-4 py-2">{q.published_at ? new Date(q.published_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2"><Link href={`/admin/quizzes/${q.id}`} className="text-indigo-600 text-sm">Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
