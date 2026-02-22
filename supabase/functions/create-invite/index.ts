import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const INVITE_EXPIRY_HOURS = 72;
const APP_DEEP_LINK_BASE = Deno.env.get('TRIVORA_APP_DEEP_LINK_BASE') ?? 'trivora://invite';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? '1v1';
    const channel = body.channel ?? 'link';
    const toUser = body.to_user ?? null;

    let code = generateCode();
    const { data: existing } = await supabase.from('invites').select('id').eq('deep_link_code', code).single();
    while (existing) {
      code = generateCode();
    }

    const { data: invite, error } = await supabase
      .from('invites')
      .insert({
        from_user: user.id,
        to_user: toUser,
        channel,
        deep_link_code: code,
        mode,
        status: 'pending',
      })
      .select('id, deep_link_code, created_at')
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shareUrl = `${APP_DEEP_LINK_BASE}/${code}`;
    const webUrl = `${Deno.env.get('TRIVORA_WEB_URL') ?? ''}/invite/${code}`;

    return new Response(
      JSON.stringify({
        invite_id: invite.id,
        code: invite.deep_link_code,
        share_url: shareUrl,
        web_url: webUrl,
        expires_in_hours: INVITE_EXPIRY_HOURS,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
