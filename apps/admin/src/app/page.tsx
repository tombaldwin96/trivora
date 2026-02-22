import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';
import { AdminLoginForm } from './AdminLoginForm';

export default async function AdminHome() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    : { data: null };
  const isAdmin = (profile as { is_admin?: boolean } | null)?.is_admin === true;

  if (!user || !isAdmin) {
    return <AdminLoginForm />;
  }

  return (
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-6">Trivora Admin</h1>
      <nav className="flex gap-4 flex-wrap">
        <Link href="/admin/categories" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Categories</Link>
        <Link href="/admin/questions" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Questions</Link>
        <Link href="/admin/quizzes" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Quizzes</Link>
        <Link href="/admin/users" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Users</Link>
        <Link href="/admin/live" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Live</Link>
        <Link href="/admin/live-quiz" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Live Quiz</Link>
        <Link href="/admin/reports" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Reports</Link>
        <Link href="/admin/stats" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Stats</Link>
        <Link href="/admin/push" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Push notifications</Link>
        <Link href="/admin/ideas" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Ideas</Link>
        <Link href="/admin/audit" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50">Audit logs</Link>
      </nav>
    </div>
  );
}
