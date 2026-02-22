import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';
import { LiveQuizControl } from './LiveQuizControl';

export default async function AdminLiveQuizPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  const { data: sessions } = await supabase
    .from('live_quiz_sessions')
    .select('id, title, status, scheduled_start_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Admin</Link>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          Live Quiz
        </h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        Control the live quiz: countdown, start, next question, reveal answer, end. Leaderboard updates from snapshot (no answer storm).
      </p>
      <LiveQuizControl initialSessions={(sessions ?? []) as { id: string; title: string; status: string; scheduled_start_at: string | null; created_at: string }[]} />
    </div>
  );
}
