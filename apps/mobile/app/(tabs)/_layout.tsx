import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Modal, Pressable, FlatList, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { COUNTRY_OPTIONS, countryToFlagEmoji } from '@/lib/country';

const COUNTRY_MODAL_DELAY_MS = 2000;

export default function TabsLayout() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [needCountry, setNeedCountry] = useState<boolean | null>(null);
  const [countryModalDelayed, setCountryModalDelayed] = useState(false);
  const [justSavedCountry, setJustSavedCountry] = useState(false);
  const [countrySaving, setCountrySaving] = useState(false);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkCountry = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setNeedCountry(false);
      setCountryModalDelayed(false);
      return;
    }
    supabase.rpc('ensure_user_profile').then(() => {}).catch(() => {});
    const { data: profile } = await supabase.from('profiles').select('is_blocked, country').eq('id', session.user.id).single();
    if ((profile as { is_blocked?: boolean } | null)?.is_blocked) {
      await supabase.auth.signOut();
      router.replace('/');
      setNeedCountry(false);
      setCountryModalDelayed(false);
      return;
    }
    const currentCountry = (profile as { country?: string | null } | null)?.country;
    const missing = currentCountry == null || String(currentCountry).trim() === '';
    setNeedCountry(missing);
    if (missing) {
      supabase.functions.invoke('detect-country', { body: {} }).catch(() => {});
    } else {
      setCountryModalDelayed(false);
    }
  }, [router]);

  useEffect(() => {
    checkCountry();
  }, [checkCountry]);

  useEffect(() => {
    if (needCountry !== true) {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      if (!justSavedCountry) setCountryModalDelayed(false);
      return;
    }
    delayTimerRef.current = setTimeout(() => {
      delayTimerRef.current = null;
      setCountryModalDelayed(true);
    }, COUNTRY_MODAL_DELAY_MS);
    return () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
    };
  }, [needCountry, justSavedCountry]);

  async function saveCountry(code: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCountrySaving(true);
    await supabase.from('profiles').update({ country: code.toUpperCase(), updated_at: new Date().toISOString() }).eq('id', user.id);
    setCountrySaving(false);
    setNeedCountry(false);
    setJustSavedCountry(true);
  }

  function dismissThankYou() {
    setJustSavedCountry(false);
    setCountryModalDelayed(false);
  }

  // Defer so native TurboModule isn't touched on first paint (reduces Hermes crash risk).
  useEffect(() => {
    let rafId: number;
    let t: ReturnType<typeof setTimeout>;
    rafId = requestAnimationFrame(() => {
      t = setTimeout(() => {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
      }, 0);
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (t != null) clearTimeout(t);
    };
  }, []);

  const showCountryPicker = needCountry === true && countryModalDelayed && !justSavedCountry;
  const showThankYou = justSavedCountry;
  const showCountryModal = showCountryPicker || showThankYou;

  return (
    <>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#7c3aed',
        tabBarInactiveTintColor: '#9ca3af',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="quiz"
        options={{
          title: 'Daily Quiz',
          headerTransparent: isDark,
          headerStyle: isDark ? { backgroundColor: 'transparent' } : undefined,
          headerTintColor: isDark ? '#fff' : undefined,
          headerShadowVisible: !isDark,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live Quiz',
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'radio' : 'radio-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: '',
          tabBarLabel: 'Map',
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerShadowVisible: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="modes"
        options={{
          title: 'Modes',
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'game-controller' : 'game-controller-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboards"
        options={{
          title: 'Leaderboards',
          headerTransparent: isDark,
          headerStyle: isDark ? { backgroundColor: 'transparent' } : undefined,
          headerTintColor: isDark ? '#fff' : undefined,
          headerShadowVisible: !isDark,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'podium' : 'podium-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTransparent: isDark,
          headerStyle: isDark ? { backgroundColor: 'transparent' } : undefined,
          headerTintColor: isDark ? '#fff' : undefined,
          headerShadowVisible: !isDark,
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} style={{ padding: 8 }} hitSlop={8}>
              <Ionicons name="settings-outline" size={24} color={isDark ? '#fff' : '#374151'} />
            </Pressable>
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>

    <Modal visible={showCountryModal} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.countryModalOverlay}>
        <View style={[styles.countryModalBox, isDark && styles.countryModalBoxDark]}>
          {showThankYou ? (
            <View style={styles.thankYouWrap}>
              <View style={styles.thankYouEmojiWrap}>
                <Text style={styles.thankYouEmoji}>🎉</Text>
              </View>
              <Text style={[styles.thankYouTitle, isDark && styles.thankYouTitleDark]}>Thanks!</Text>
              <Text style={[styles.thankYouSubtitle, isDark && styles.thankYouSubtitleDark]}>
                You're all set. You can change your username anytime in the Profile tab.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.thankYouButton, pressed && styles.thankYouButtonPressed]}
                onPress={dismissThankYou}
              >
                <LinearGradient
                  colors={['#7c3aed', '#5b21b6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.thankYouButtonGradient}
                >
                  <Text style={styles.thankYouButtonText}>Let's go!</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.countryModalHeader}>
                <LinearGradient
                  colors={isDark ? ['#4c1d95', '#5b21b6'] : ['#7c3aed', '#5b21b6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.countryModalHeaderGradient}
                >
                  <Text style={styles.countryModalHeaderEmoji}>🌍</Text>
                  <Text style={styles.countryModalTitle}>Where are you from?</Text>
                  <Text style={styles.countryModalSubtitleLight}>Pick your country to get started</Text>
                </LinearGradient>
              </View>
              <FlatList
                data={COUNTRY_OPTIONS}
                keyExtractor={(item) => item.code}
                style={styles.countryModalList}
                renderItem={({ item }) => {
                  const flag = countryToFlagEmoji(item.code);
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.countryOption,
                        isDark && styles.countryOptionDark,
                        pressed && (isDark ? styles.countryOptionDarkPressed : styles.countryOptionPressed),
                      ]}
                      onPress={() => saveCountry(item.code)}
                      disabled={countrySaving}
                    >
                      {flag ? <Text style={styles.countryOptionFlag}>{flag}</Text> : null}
                      <Text style={[styles.countryOptionName, isDark && styles.countryOptionNameDark]}>{item.name}</Text>
                    </Pressable>
                  );
                }}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  countryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  countryModalBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  countryModalBoxDark: { backgroundColor: '#18181b' },
  countryModalHeader: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  countryModalHeaderGradient: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  countryModalHeaderEmoji: { fontSize: 40, marginBottom: 8 },
  countryModalTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  countryModalSubtitleLight: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 6 },
  countryModalSubtitle: { fontSize: 14, color: '#64748b', paddingHorizontal: 20, paddingBottom: 16 },
  countryModalSubtitleDark: { color: '#a1a1aa' },
  countryModalList: { maxHeight: 320 },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  countryOptionDark: { borderBottomColor: '#27272a' },
  countryOptionPressed: { backgroundColor: 'rgba(0,0,0,0.05)' },
  countryOptionDarkPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  countryOptionFlag: { fontSize: 22 },
  countryOptionName: { fontSize: 16, color: '#111827', fontWeight: '500' },
  countryOptionNameDark: { color: '#e4e4e7' },
  thankYouWrap: { padding: 24, alignItems: 'center' },
  thankYouEmojiWrap: { marginBottom: 12 },
  thankYouEmoji: { fontSize: 56 },
  thankYouTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 12 },
  thankYouTitleDark: { color: '#fafafa' },
  thankYouSubtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  thankYouSubtitleDark: { color: '#a1a1aa' },
  thankYouButton: { alignSelf: 'stretch', borderRadius: 16, overflow: 'hidden' },
  thankYouButtonPressed: { opacity: 0.9 },
  thankYouButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  thankYouButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});
