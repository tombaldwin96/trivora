import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';

export default async function AdminUsersPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/login');

  const { data: usersData } = await supabase.from('profiles').select('id, username, display_name, is_admin, created_at').order('created_at', { ascending: false }).limit(100);
  type UserRow = { id: string; username: string; display_name: string | null; is_admin: boolean; created_at: string };
  const users = (usersData ?? []) as UserRow[];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2">Username</th>
              <th className="px-4 py-2">Display name</th>
              <th className="px-4 py-2">Admin</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-2">{u.username}</td>
                <td className="px-4 py-2">{u.display_name ?? '—'}</td>
                <td className="px-4 py-2">{u.is_admin ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2"><Link href={`/admin/users/${u.id}`} className="text-indigo-600 text-sm">Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
