import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, Button } from '@trivora/ui';
import Link from 'next/link';

export default async function LiveQuizPage() {
  const supabase = await createServerSupabaseClient();
  const { data: sessionsData } = await supabase
    .from('live_sessions')
    .select('id, quiz_id, status, started_at, playback_url')
    .in('status', ['scheduled', 'live'])
    .order('started_at', { ascending: false })
    .limit(5);

  type SessionRow = { id: string; quiz_id: string; status: string; started_at: string | null; playback_url: string | null };
  type QuizRow = { id: string; title: string };
  const sessions = (sessionsData ?? []) as SessionRow[];
  const { data: quizzesData } = sessions.length
    ? await supabase.from('quizzes').select('id, title').in('id', sessions.map((s) => s.quiz_id))
    : { data: [] as QuizRow[] };
  const quizzes = (quizzesData ?? []) as QuizRow[];
  const quizMap = Object.fromEntries(quizzes.map((q) => [q.id, q]));

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Live Quiz</h1>
      <p className="text-slate-500 mb-6">Watch the stream and answer in real time. Top half: video; bottom: 4 answers.</p>
      {!sessions?.length ? (
        <Card className="p-8 text-center">
          <p className="text-slate-500">No live or scheduled sessions right now.</p>
          <p className="text-sm text-slate-400 mt-2">Check back later or enable push for &quot;Quiz starting soon&quot;.</p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {sessions.map((s) => (
            <Card key={s.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{quizMap[s.quiz_id]?.title ?? 'Live Quiz'}</p>
                <p className="text-sm text-slate-500">{s.status} · {s.started_at ? new Date(s.started_at).toLocaleString() : '—'}</p>
              </div>
              {s.status === 'live' && s.playback_url ? (
                <Link href={`/live/${s.id}`}><Button size="sm">Watch & play</Button></Link>
              ) : (
                <span className="text-xs text-slate-400">{s.status}</span>
              )}
            </Card>
          ))}
        </ul>
      )}
      <Link href="/dashboard"><Button variant="ghost" className="mt-4">Back</Button></Link>
    </div>
  );
}
