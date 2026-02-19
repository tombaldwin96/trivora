'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Card, Button } from '@mahan/ui';
import { trackEvent } from '@/lib/analytics';

export default function OneVOnePage() {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  async function handleCreateInvite() {
    setCreateLoading(true);
    setError(null);
    const fn = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-invite`;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ mode: '1v1', channel: 'link' }),
    });
    const data = await res.json().catch(() => ({}));
    setCreateLoading(false);
    if (!res.ok) {
      setError(data.error || 'Failed to create invite');
      return;
    }
    setShareUrl(data.web_url || data.share_url || '');
    trackEvent('match_invite_sent');
  }

  async function handleAcceptInvite() {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    const fn = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/accept-invite`;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ code: inviteCode.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Failed to accept invite');
      return;
    }
    if (data.match_id) {
      trackEvent('match_invite_accepted');
      window.location.href = `/match/${data.match_id}`;
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">1v1</h1>
      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Invite a friend</h2>
        <Button onClick={handleCreateInvite} disabled={createLoading} className="w-full">
          {createLoading ? 'Creating…' : 'Create invite link'}
        </Button>
        {shareUrl && (
          <div className="rounded-lg bg-slate-100 p-3 text-sm break-all">
            Share: {shareUrl}
          </div>
        )}
      </Card>
      <Card className="p-6 mt-4 space-y-4">
        <h2 className="font-semibold">Have a code?</h2>
        <input
          type="text"
          placeholder="Enter invite code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <Button onClick={handleAcceptInvite} disabled={loading} className="w-full">
          {loading ? 'Joining…' : 'Join match'}
        </Button>
      </Card>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <Link href="/modes"><Button variant="ghost" className="w-full mt-4">Back to modes</Button></Link>
    </div>
  );
}
