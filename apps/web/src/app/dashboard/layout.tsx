import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { DetectCountry } from '@/components/DetectCountry';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/signin');

  const { data: profile } = await supabase.from('profiles').select('is_blocked').eq('id', user.id).single();
  if ((profile as { is_blocked?: boolean } | null)?.is_blocked) {
    await supabase.auth.signOut();
    redirect('/auth/signin?message=blocked');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DetectCountry />
      <nav className="border-b bg-white px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="font-semibold text-brand-600">Trivora</Link>
        <div className="flex gap-4">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">Home</Link>
          <Link href="/quiz/daily" className="text-slate-600 hover:text-slate-900">Daily Quiz</Link>
          <Link href="/modes" className="text-slate-600 hover:text-slate-900">Modes</Link>
          <Link href="/leaderboards" className="text-slate-600 hover:text-slate-900">Leaderboards</Link>
          <Link href="/tournaments" className="text-slate-600 hover:text-slate-900">Tournaments</Link>
          <Link href="/profile" className="text-slate-600 hover:text-slate-900">Profile</Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-slate-500 hover:text-red-600">Sign out</button>
          </form>
        </div>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  );
}
