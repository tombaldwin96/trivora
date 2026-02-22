import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '../actions';
import { createAdminSupabaseServer } from '@/lib/supabase-admin';

export default async function AdminCategoriesPage() {
  const session = await getAdminSession();
  if (!session.loggedIn) redirect('/admin');

  const supabase = createAdminSupabaseServer();
  if (!supabase) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <Link href="/admin" className="text-slate-600 text-sm hover:text-slate-900">Back to admin</Link>
        </div>
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for admin data.</p>
      </div>
    );
  }
  const { data: categoriesData } = await supabase.from('categories').select('*').order('sort_order');
  type CategoryRow = { id: string; name: string; slug: string; is_active: boolean; sort_order: number };
  const categories = (categoriesData ?? []) as CategoryRow[];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
        <Link href="/admin" className="text-slate-600 text-sm hover:text-slate-900">Back to admin</Link>
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2">Order</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{c.slug}</td>
                <td className="px-4 py-2">{c.is_active ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2">{c.sort_order}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
