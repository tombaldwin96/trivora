import Link from 'next/link';
import { getAdminSession } from './actions';
import { AdminLoginForm } from './AdminLoginForm';
import { AdminLogout } from './AdminLogout';

export default async function AdminPage() {
  const session = await getAdminSession();

  if (!session.loggedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900 mb-1">Trivora Admin</h1>
          <p className="text-sm text-slate-500 mb-6">Sign in with your username and password.</p>
          <AdminLoginForm />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-slate-100">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Trivora Admin</h1>
          <span className="text-slate-600 text-sm">Signed in as <strong>{session.username}</strong></span>
          <AdminLogout />
        </div>
        <nav className="flex flex-wrap gap-3">
          <Link href="/admin/categories" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Categories</Link>
          <Link href="/admin/questions" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Questions</Link>
          <Link href="/admin/quizzes" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Quizzes</Link>
          <Link href="/admin/users" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Users</Link>
          <Link href="/admin/live" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Live</Link>
          <Link href="/admin/live-quiz" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Live Quiz</Link>
          <Link href="/admin/reports" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Reports</Link>
          <Link href="/admin/stats" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Stats</Link>
          <Link href="/admin/push" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Push notifications</Link>
          <Link href="/admin/ideas" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Ideas</Link>
          <Link href="/admin/audit" className="rounded-lg bg-white px-4 py-2 shadow hover:bg-slate-50 border border-slate-200">Audit logs</Link>
        </nav>
      </div>
    </main>
  );
}
