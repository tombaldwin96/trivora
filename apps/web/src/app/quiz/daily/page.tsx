import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Card, Button } from '@trivora/ui';
import { DAILY_QUIZ_QUESTION_COUNT } from '@trivora/core';

export default async function DailyQuizPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/signin');

  const today = new Date().toISOString().slice(0, 10);
  const { data: quizData } = await supabase
    .from('quizzes')
    .select('id, title')
    .eq('type', 'daily')
    .eq('status', 'published')
    .limit(1)
    .single();
  const quiz = quizData as { id: string; title: string } | null;

  const { data: existingAttemptData } = quiz
    ? await supabase
        .from('attempts')
        .select('id, score_total, ended_at')
        .eq('user_id', user.id)
        .eq('quiz_id', quiz.id)
        .gte('started_at', today + 'T00:00:00Z')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const existingAttempt = existingAttemptData as { id: string; score_total: number; ended_at: string | null } | null;

  if (!quiz) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-slate-500">No daily quiz available today. Check back later.</p>
        <Link href="/dashboard"><Button className="mt-4">Back to dashboard</Button></Link>
      </div>
    );
  }

  if (existingAttempt?.ended_at) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <Card>
          <h2 className="text-xl font-semibold">Today&apos;s quiz complete</h2>
          <p className="text-2xl font-bold text-brand-600 mt-2">{existingAttempt.score_total} pts</p>
          <Link href="/leaderboards"><Button className="mt-4">View leaderboard</Button></Link>
          <Link href="/dashboard"><Button variant="ghost" className="mt-2">Dashboard</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">{quiz.title}</h1>
      <p className="text-slate-500 mb-6">{DAILY_QUIZ_QUESTION_COUNT} questions · Score + time bonus</p>
      <Link href={`/quiz/daily/play?quiz_id=${quiz.id}${existingAttempt?.id ? `&attempt_id=${existingAttempt.id}` : ''}`}>
        <Button size="lg" className="w-full">
          {existingAttempt ? 'Continue quiz' : 'Start quiz'}
        </Button>
      </Link>
      <Link href="/dashboard"><Button variant="ghost" className="w-full mt-2">Back</Button></Link>
    </div>
  );
}
