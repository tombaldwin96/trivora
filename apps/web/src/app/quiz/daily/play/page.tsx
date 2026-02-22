'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Card, Button } from '@trivora/ui';
import { scoreSingleAnswer, clampReactionTime } from '@trivora/core';
import { trackEvent } from '@/lib/analytics';

type Question = {
  id: string;
  prompt: string;
  answers_json: string[] | { text: string }[];
  correct_index: number;
  time_limit_ms: number;
};

export default function DailyQuizPlayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quizId = searchParams.get('quiz_id');
  const attemptIdParam = searchParams.get('attempt_id');

  const [attemptId, setAttemptId] = useState<string | null>(attemptIdParam);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadQuiz = useCallback(async () => {
    if (!quizId) return;
    const { data: qqData } = await supabase
      .from('quiz_questions')
      .select('question_id, order_index')
      .eq('quiz_id', quizId)
      .order('order_index');
    type QqRow = { question_id: string; order_index: number };
    const qq = (qqData ?? []) as QqRow[];
    if (!qq.length) {
      setLoading(false);
      return;
    }
    const ids = qq.map((r) => r.question_id);
    const { data: qsData } = await supabase.from('questions').select('id, prompt, answers_json, correct_index, time_limit_ms').in('id', ids);
    const orderMap = Object.fromEntries(qq.map((r) => [r.question_id, r.order_index]));
    type QsRow = { id: string; prompt: string; answers_json: unknown; correct_index: number; time_limit_ms: number };
    const qs = (qsData ?? []) as QsRow[];
    const sorted = qs.sort((a, b) => (orderMap[a.id] ?? 0) - (orderMap[b.id] ?? 0));
    setQuestions(sorted as Question[]);

    if (!attemptIdParam) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: attempt } = await (supabase.from('attempts') as any)
        .insert({ user_id: user.id, quiz_id: quizId, mode: 'daily', score_total: 0 })
        .select('id')
        .single();
      if (attempt) setAttemptId(attempt.id);
    } else {
      setAttemptId(attemptIdParam);
    }
    setLoading(false);
  }, [quizId, attemptIdParam]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const question = questions[index];
  const answers = question
    ? (Array.isArray(question.answers_json)
        ? question.answers_json
        : (question.answers_json as unknown as { text: string }[]).map((a) => (typeof a === 'string' ? a : a.text))
      ).map((t, i) => ({ text: String(t), index: i }))
    : [];

  const handleAnswer = async (answerIndex: number) => {
    if (!question || !attemptId || submitting) return;
    setSubmitting(true);
    const endAt = Date.now();
    const timeMs = startedAt != null ? clampReactionTime(endAt - startedAt) : 0;
    const correct = question.correct_index === answerIndex;
    const points = scoreSingleAnswer(correct, timeMs, question.time_limit_ms ?? 15000);

    const fn = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-answer`;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        attempt_id: attemptId,
        question_id: question.id,
        answer_index: answerIndex,
        time_ms: timeMs,
      }),
    });

    if (index + 1 >= questions.length) {
      await (supabase.from('attempts') as any).update({ ended_at: new Date().toISOString() }).eq('id', attemptId);
      trackEvent('daily_quiz_complete', { score: points });
      router.push('/dashboard');
      return;
    }
    setIndex((i) => i + 1);
    setStartedAt(null);
    setSubmitting(false);
  };

  useEffect(() => {
    if (question && startedAt === null) setStartedAt(Date.now());
  }, [question?.id, startedAt]);

  if (loading || !quizId) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <p className="text-slate-500">Loading quiz…</p>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <p className="text-slate-500">No questions found.</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">Back</Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-6">
      <p className="text-sm text-slate-500 mb-2">Question {index + 1} of {questions.length}</p>
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-medium mb-6">{question.prompt}</h2>
        <div className="grid gap-3">
          {answers.map((a) => (
            <button
              key={a.index}
              type="button"
              disabled={submitting}
              onClick={() => handleAnswer(a.index)}
              className="text-left rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50 disabled:opacity-50"
            >
              {a.text}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
