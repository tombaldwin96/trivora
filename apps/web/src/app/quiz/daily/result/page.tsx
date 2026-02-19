'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Card, Button } from '@mahan/ui';

export default function DailyQuizResultPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const attemptId = searchParams.get('attempt_id');
  const [attempt, setAttempt] = useState<{ score_total: number; detail_json: unknown[] } | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    supabase.from('attempts').select('score_total, detail_json').eq('id', attemptId).single().then(({ data }) => setAttempt(data ?? null));
  }, [attemptId]);

  if (!attemptId) {
    router.push('/quiz/daily');
    return null;
  }

  const details = (attempt?.detail_json ?? []) as { correct?: boolean; points?: number }[];
  const correctCount = details.filter((d) => d.correct).length;

  return (
    <div className="max-w-md mx-auto py-12">
      <Card className="p-8 text-center">
        <h1 className="text-2xl font-bold">Quiz complete</h1>
        <p className="text-4xl font-bold text-brand-600 mt-4">{attempt?.score_total ?? 0} pts</p>
        <p className="text-slate-500 mt-2">{correctCount} / {details.length || 0} correct</p>
        <div className="mt-8 flex flex-col gap-2">
          <Link href="/leaderboards"><Button className="w-full">View leaderboard</Button></Link>
          <Link href="/dashboard"><Button variant="ghost" className="w-full">Dashboard</Button></Link>
        </div>
      </Card>
    </div>
  );
}
