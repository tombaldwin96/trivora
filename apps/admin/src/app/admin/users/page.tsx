import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';
import { UserList } from './UserList';

export default async function AdminUsersPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Users</h1>
            <p className="text-slate-600 mt-1">View, search, and manage all users. Edit rank, XP, login details; block or delete accounts.</p>
          </div>
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            ← Back to admin
          </Link>
        </div>

        <UserList />
      </div>
    </div>
  );
}
