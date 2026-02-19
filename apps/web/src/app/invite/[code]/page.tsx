'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Card, Button } from '@mahan/ui';

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setLoading(true);
      const fn = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/accept-invite`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(fn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (data.match_id) router.replace(`/match/${data.match_id}`);
      else if (data.error) setError(data.error);
    })();
  }, [code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-sm w-full p-6 text-center">
        <h1 className="text-xl font-bold">Invite: {code}</h1>
        {loading && <p className="mt-4 text-slate-500">Joining match…</p>}
        {error && <p className="mt-4 text-red-600">{error}</p>}
        {!loading && !error && (
          <p className="mt-4 text-slate-500">
            <Link href="/auth/signin"><Button size="sm">Sign in</Button></Link> to accept this invite.
          </p>
        )}
        <Link href="/"><Button variant="ghost" className="mt-4">Home</Button></Link>
      </Card>
    </div>
  );
}
