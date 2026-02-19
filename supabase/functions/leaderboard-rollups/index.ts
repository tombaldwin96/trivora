import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = req.headers.get('Authorization')?.replace('Bearer ', '') ?? req.headers.get('x-cron-secret');
  if (cronSecret !== Deno.env.get('CRON_SECRET') && !Deno.env.get('CRON_SECRET')) {
    // Allow if no CRON_SECRET set (dev)
  } else if (cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

    const today = new Date().toISOString().slice(0, 10);

    const { data: attempts } = await supabase
      .from('attempts')
      .select('user_id, score_total')
      .gte('started_at', today + 'T00:00:00Z')
      .lt('started_at', today + 'T23:59:59.999Z')
      .not('ended_at', 'is', null);

    const byUser: Record<string, number> = {};
    for (const a of attempts ?? []) {
      byUser[a.user_id] = Math.max(byUser[a.user_id] ?? 0, a.score_total);
    }

    const entries = Object.entries(byUser)
      .map(([user_id, score]) => ({ user_id, date: today, score }))
      .sort((a, b) => b.score - a.score);

    let rank = 1;
    for (const e of entries) {
      await supabase.from('leaderboard_daily').upsert(
        { user_id: e.user_id, date: today, score: e.score, rank: rank++ },
        { onConflict: 'user_id,date' }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, date: today, entries_processed: entries.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
