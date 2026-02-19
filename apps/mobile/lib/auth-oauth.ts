import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

/**
 * Parse Supabase OAuth redirect URL (hash fragment) and return access_token + refresh_token.
 */
function parseOAuthRedirectUrl(url: string): { access_token?: string; refresh_token?: string } {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  const hash = url.slice(hashIndex + 1);
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get('access_token') ?? undefined,
    refresh_token: params.get('refresh_token') ?? undefined,
  };
}

/**
 * Sign in with Apple or Facebook via Supabase OAuth.
 * Opens in-app browser; on success sets session and returns true.
 */
export async function signInWithOAuthProvider(provider: 'apple' | 'facebook'): Promise<{ ok: boolean; error?: string }> {
  try {
    const redirectUrl = AuthSession.makeRedirectUri({ path: 'auth/callback' });
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    });

    if (oauthError) return { ok: false, error: oauthError.message };
    if (!data?.url) return { ok: false, error: 'No auth URL' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
      showInRecents: true,
    });

    if (result.type !== 'success' || !result.url) {
      return { ok: true }; // User cancelled or dismissed
    }

    const { access_token, refresh_token } = parseOAuthRedirectUrl(result.url);
    if (!access_token || !refresh_token) {
      return { ok: false, error: 'Missing tokens in redirect' };
    }

    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) return { ok: false, error: sessionError.message };

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sign in failed';
    return { ok: false, error: message };
  }
}
