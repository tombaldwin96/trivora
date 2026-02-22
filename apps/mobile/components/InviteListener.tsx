import { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';

type PendingInvite = {
  id: string;
  match_id: string | null;
  from_user: string;
  inviter_username: string;
};

export function InviteListener() {
  const router = useRouter();
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [responding, setResponding] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const setup = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mountedRef.current) return;

        const { data: rows } = await supabase
          .from('invites')
          .select('id, match_id, from_user')
          .eq('to_user', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5);

        if (!mountedRef.current) return;
        if (rows?.length && !invite) {
          const first = rows[0];
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', first.from_user)
            .single();
          if (!mountedRef.current) return;
          setInvite({
            id: first.id,
            match_id: first.match_id,
            from_user: first.from_user,
            inviter_username: (profile?.username as string) ?? 'Someone',
          });
        }

        const ch = supabase
          .channel('invites-to-me')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'invites',
              filter: `to_user=eq.${user.id}`,
            },
            async (payload) => {
              try {
                const row = payload.new as { id: string; match_id: string | null; from_user: string };
                if (!row || !mountedRef.current) return;
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('username')
                  .eq('id', row.from_user)
                  .single();
                if (!mountedRef.current) return;
                setInvite({
                  id: row.id,
                  match_id: row.match_id,
                  from_user: row.from_user,
                  inviter_username: (profile?.username as string) ?? 'Someone',
                });
              } catch {
                // ignore
              }
            }
          )
          .subscribe();
        channelRef.current = ch;
      } catch {
        // Auth or realtime not available (e.g. iOS simulator / offline)
      }
    };

    setup();
    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {
          // ignore
        }
        channelRef.current = null;
      }
    };
  }, []);

  const respond = async (accept: boolean) => {
    if (!invite || responding) return;
    setResponding(true);
    try {
      const { data, error } = await supabase.rpc('respond_to_invite', {
        p_invite_id: invite.id,
        p_accept: accept,
      });
      if (error) {
        setResponding(false);
        return;
      }
      Haptics.notificationAsync(accept ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setInvite(null);
      const matchId = accept && data?.match_id;
      if (matchId) router.replace(`/match/${matchId}`);
    } finally {
      if (mountedRef.current) setResponding(false);
    }
  };

  return (
    <Modal visible={!!invite} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={() => {}}>
        <View style={styles.card}>
          <Text style={styles.title}>{invite?.inviter_username ?? 'Someone'} invited you to a 1v1 match</Text>
          <Text style={styles.sub}>Accept to join their session and play.</Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.declineBtn]}
              onPress={() => respond(false)}
              disabled={responding}
            >
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.acceptBtn]}
              onPress={() => respond(true)}
              disabled={responding}
            >
              {responding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.acceptText}>Accept</Text>}
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 320,
    borderWidth: 2,
    borderColor: '#334155',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
  },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  btn: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, minWidth: 100, alignItems: 'center' },
  declineBtn: { backgroundColor: '#334155' },
  declineText: { fontSize: 16, fontWeight: '700', color: '#e2e8f0' },
  acceptBtn: { backgroundColor: '#22c55e' },
  acceptText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
