import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';

export default async function AdminCategoriesPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/login');

  const { data: categoriesData } = await supabase.from('categories').select('*').order('sort_order');
  type CategoryRow = { id: string; name: string; slug: string; is_active: boolean; sort_order: number };
  const categories = (categoriesData ?? []) as CategoryRow[];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Link href="/admin/categories/new" className="rounded-lg bg-slate-800 px-4 py-2 text-white text-sm">Add category</Link>
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
                <td className="px-4 py-2"><Link href={`/admin/categories/${c.id}`} className="text-indigo-600 text-sm">Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
