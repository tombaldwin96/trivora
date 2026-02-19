import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@mahan/ui';
import Link from 'next/link';

type TournamentRow = { id: string; title: string; starts_at: string; ends_at: string; status: string };

export default async function TournamentsPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('tournaments')
    .select('id, title, starts_at, ends_at, status')
    .in('status', ['published', 'live'])
    .order('starts_at', { ascending: false })
    .limit(10);
  const tournaments = (data ?? []) as TournamentRow[];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Tournaments</h1>
      <p className="text-slate-500 mb-6">Weekend cups and brackets (V1: full brackets and qualifiers).</p>
      {!tournaments.length ? (
        <Card className="p-8 text-center">
          <p className="text-slate-500">No upcoming tournaments.</p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {tournaments.map((t) => (
            <Card key={t.id} className="p-4">
              <p className="font-medium">{t.title}</p>
              <p className="text-sm text-slate-500">{new Date(t.starts_at).toLocaleString()} – {new Date(t.ends_at).toLocaleString()} · {t.status}</p>
            </Card>
          ))}
        </ul>
      )}
      <Link href="/dashboard" className="inline-block mt-4 text-slate-500 text-sm hover:underline">Back to dashboard</Link>
    </div>
  );
}
