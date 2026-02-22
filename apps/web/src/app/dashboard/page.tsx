import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, Button } from '@trivora/ui';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('username, display_name').eq('id', user.id).single()
    : { data: null as { username?: string; display_name?: string } | null };
  const p = profile as { username?: string; display_name?: string } | null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">
        Hi, {p?.display_name || p?.username || 'there'}
      </h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/quiz/daily">
          <Card className="p-6 hover:shadow-md transition cursor-pointer">
            <h2 className="font-semibold text-lg text-brand-600">Daily Quiz</h2>
            <p className="text-slate-500 text-sm mt-1">10 questions · Score + time bonus</p>
            <Button variant="primary" size="sm" className="mt-4">Play</Button>
          </Card>
        </Link>
        <Link href="/modes/1v1">
          <Card className="p-6 hover:shadow-md transition cursor-pointer">
            <h2 className="font-semibold text-lg text-brand-600">1v1</h2>
            <p className="text-slate-500 text-sm mt-1">Invite or matchmake · Divisions</p>
            <Button variant="secondary" size="sm" className="mt-4">Play</Button>
          </Card>
        </Link>
        <Link href="/live">
          <Card className="p-6 hover:shadow-md transition cursor-pointer">
            <h2 className="font-semibold text-lg text-brand-600">Live Quiz</h2>
            <p className="text-slate-500 text-sm mt-1">Watch & answer in real time</p>
            <Button variant="ghost" size="sm" className="mt-4">View schedule</Button>
          </Card>
        </Link>
        <Link href="/leaderboards">
          <Card className="p-6 hover:shadow-md transition cursor-pointer">
            <h2 className="font-semibold text-lg text-brand-600">Leaderboards</h2>
            <p className="text-slate-500 text-sm mt-1">Global · Friends · Season</p>
            <Button variant="ghost" size="sm" className="mt-4">View</Button>
          </Card>
        </Link>
      </div>
      <div className="mt-6 pt-6 border-t border-slate-200">
        <Link
          href="/contact"
          className="block text-center text-sm text-slate-500 hover:text-brand-600 transition"
        >
          Do you have an idea? Tell us here.
        </Link>
      </div>
    </div>
  );
}
