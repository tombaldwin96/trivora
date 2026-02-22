import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

export function PushTokenRegistration() {
  const router = useRouter();
  const registeredRef = useRef<string | null>(null);

  useEffect(() => {
    const registerToken = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { status: existing } = await Notifications.getPermissionsAsync();
        let final = existing;
        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          final = status;
        }
        if (final !== 'granted') return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) return;

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: String(projectId),
        });
        const token = tokenData?.data;
        if (!token || token === registeredRef.current) return;
        registeredRef.current = token;

        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        await supabase.from('push_tokens').upsert(
          { user_id: session.user.id, token, platform },
          { onConflict: 'user_id,platform' }
        );
      } catch {
        // Push not available (e.g. simulator) or permission denied
      }
    };

    registerToken();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) registerToken();
      else registeredRef.current = null;
    });
    return () => subscription?.unsubscribe?.();
  }, []);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    try {
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response?.notification?.request?.content?.data as { type?: string; matchId?: string; inviteId?: string } | undefined;
          if (data?.type === 'invite' && data?.matchId) {
            const inviteId = data.inviteId ? `?inviteId=${data.inviteId}` : '';
            router.replace(`/match/${data.matchId}${inviteId}` as any);
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // Notifications not available (e.g. iOS simulator)
    }
    return () => {
      try {
        sub?.remove?.();
      } catch {
        // ignore
      }
    };
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!isMounted || !response) return;
        const data = response?.notification?.request?.content?.data as { type?: string; matchId?: string; inviteId?: string } | undefined;
        if (data?.type === 'invite' && data?.matchId) {
          const inviteId = data.inviteId ? `?inviteId=${data.inviteId}` : '';
          router.replace(`/match/${data.matchId}${inviteId}` as any);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [router]);

  return null;
}
