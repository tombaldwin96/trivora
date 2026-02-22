import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '../actions';

export default async function AdminQuizzesPage() {
  const session = await getAdminSession();
  if (!session.loggedIn) redirect('/admin');

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Quizzes</h1>
        <Link href="/admin" className="text-slate-600 text-sm hover:text-slate-900">Back to admin</Link>
      </div>
      <p className="text-slate-600">Manage quizzes and daily quiz content.</p>
    </div>
  );
}
