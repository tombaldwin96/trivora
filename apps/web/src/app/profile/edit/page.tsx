'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Button, Card } from '@mahan/ui';

export default function ProfileEditPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/auth/signin');
        return;
      }
      supabase.from('profiles').select('display_name, username').eq('id', user.id).single().then(({ data }) => {
        const p = data as { display_name?: string | null; username?: string } | null;
        if (p) {
          setDisplayName(p.display_name ?? '');
          setUsername(p.username ?? '');
        }
      });
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await (supabase.from('profiles') as any).update({
      display_name: displayName.trim() || null,
      username: username.trim() || undefined,
    }).eq('id', user.id);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/profile');
    router.refresh();
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Edit profile</h1>
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Display name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="3–24 chars, alphanumeric + _" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">Save</Button>
        </form>
      </Card>
      <Link href="/profile" className="inline-block mt-4 text-slate-500 text-sm hover:underline">Cancel</Link>
    </div>
  );
}
