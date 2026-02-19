import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/signin');

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b bg-white px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="font-semibold text-brand-600">Mahan</Link>
        <div className="flex gap-4">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">Home</Link>
          <Link href="/quiz/daily" className="text-slate-600 hover:text-slate-900">Daily Quiz</Link>
          <Link href="/modes" className="text-slate-600 hover:text-slate-900">Modes</Link>
          <Link href="/leaderboards" className="text-slate-600 hover:text-slate-900">Leaderboards</Link>
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
