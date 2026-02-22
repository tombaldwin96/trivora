import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';

export default async function AdminQuestionsPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  const { data: questionsData } = await supabase.from('questions').select('id, prompt, difficulty, is_active, category_id').order('created_at', { ascending: false }).limit(100);
  type QuestionRow = { id: string; prompt: string; difficulty: number; is_active: boolean; category_id: string };
  type CatRow = { id: string; name: string };
  const questions = (questionsData ?? []) as QuestionRow[];
  const categoryIds = [...new Set(questions.map((q) => q.category_id))];
  const { data: categoriesData } = categoryIds.length ? await supabase.from('categories').select('id, name').in('id', categoryIds) : { data: [] as CatRow[] };
  const catMap = Object.fromEntries((categoriesData ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Questions</h1>
        <Link href="/admin/questions/new" className="rounded-lg bg-slate-800 px-4 py-2 text-white text-sm">Add question</Link>
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2">Prompt</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Difficulty</th>
              <th className="px-4 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id} className="border-t">
                <td className="px-4 py-2 max-w-xs truncate">{q.prompt}</td>
                <td className="px-4 py-2">{catMap[q.category_id] ?? '—'}</td>
                <td className="px-4 py-2">{q.difficulty}</td>
                <td className="px-4 py-2">{q.is_active ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2"><Link href={`/admin/questions/${q.id}`} className="text-indigo-600 text-sm">Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
