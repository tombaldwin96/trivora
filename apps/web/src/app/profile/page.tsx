import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@trivora/ui';
import Link from 'next/link';

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/signin');

  const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  type ProfileRow = { avatar_url?: string | null; display_name?: string | null; username?: string; level?: number; [k: string]: unknown };
  const profile = profileData as ProfileRow | null;
  const { data: subData } = await supabase.from('subscriptions').select('status').eq('user_id', user.id).single();
  const sub = subData as { status?: string } | null;
  const { data: standingData } = await supabase.from('standings').select('points, games_played, wins, draws, losses').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const standing = standingData as { points: number; games_played: number; wins: number; draws: number; losses: number } | null;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      <Card className="p-6">
        <div className="flex items-center gap-4 mb-4">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-xl">
              {(profile?.display_name || profile?.username || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold">{profile?.display_name || profile?.username}</p>
            <p className="text-slate-500 text-sm">@{profile?.username}</p>
          </div>
        </div>
        <p className="text-sm text-slate-500">Level {profile?.level ?? 1} · {sub?.status ?? 'free'}</p>
        {standing && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h3 className="font-medium">1v1 Season</h3>
            <p className="text-sm">{standing.points} pts</p>
            <p className="text-slate-500 text-xs mt-1">{standing.wins}W / {standing.draws}D / {standing.losses}L</p>
          </div>
        )}
        <Link href="/profile/edit" className="inline-block mt-4 text-brand-600 text-sm hover:underline">Edit profile</Link>
      </Card>
      <Link href="/dashboard" className="text-sm text-slate-500 hover:underline mt-4 inline-block">Back to dashboard</Link>
    </div>
  );
}
