import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';

export default async function AdminLivePage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/login');

  const { data: sessionsData } = await supabase.from('live_sessions').select('id, quiz_id, status, started_at, ended_at').order('created_at', { ascending: false }).limit(20);
  type SessionRow = { id: string; quiz_id: string; status: string; started_at: string | null; ended_at: string | null };
  type QuizRow = { id: string; title: string };
  const sessions = (sessionsData ?? []) as SessionRow[];
  const quizIds = [...new Set(sessions.map((s) => s.quiz_id))];
  const { data: quizzesData } = quizIds.length ? await supabase.from('quizzes').select('id, title').in('id', quizIds) : { data: [] as QuizRow[] };
  const quizMap = Object.fromEntries((quizzesData ?? []).map((q) => [q.id, q.title]));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Live sessions</h1>
      <p className="text-slate-600 mb-4">Start/stop streams from here. Configure Mux/LiveKit keys in env; playback_url is set when starting.</p>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2">Quiz</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Started</th>
              <th className="px-4 py-2">Ended</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2">{quizMap[s.quiz_id] ?? s.quiz_id}</td>
                <td className="px-4 py-2">{s.status}</td>
                <td className="px-4 py-2">{s.started_at ? new Date(s.started_at).toLocaleString() : '—'}</td>
                <td className="px-4 py-2">{s.ended_at ? new Date(s.ended_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
