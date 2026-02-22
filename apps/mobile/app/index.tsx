import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Animated, Easing, Image, KeyboardAvoidingView, ScrollView, Platform, Keyboard, Dimensions } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useResponsive, CONTENT_MAX_WIDTH } from '@/lib/responsive';

const PENDING_REFERRAL_KEY = 'trivora_pending_referral_code';
const LAST_LOGIN_EMAIL_KEY = 'trivora_last_login_email';

const SHIMMER_WIDTH = 140;
const SHIMMER_SWEEP_MS = 2000;
const SHIMMER_PAUSE_MS = 4000; // cycle = sweep + pause = 6s

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const [sessionCheckDone, setSessionCheckDone] = useState(false);
  const [email, setEmail] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [referralExpanded, setReferralExpanded] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const checkSession = useCallback(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setSessionCheckDone(true);
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('is_blocked').eq('id', session.user.id).single();
      if ((profile as { is_blocked?: boolean } | null)?.is_blocked) {
        await supabase.auth.signOut();
        setSessionCheckDone(true);
        return;
      }
      router.replace('/(tabs)');
    }).catch(() => setSessionCheckDone(true));
  }, [router]);

  // Brief defer before first Supabase/session check so native is settled after layout boot delay.
  const [sessionCheckAllowed, setSessionCheckAllowed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSessionCheckAllowed(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!sessionCheckAllowed) return;
    checkSession();
  }, [sessionCheckAllowed, checkSession]);

  useFocusEffect(
    useCallback(() => {
      if (sessionCheckAllowed) checkSession();
    }, [sessionCheckAllowed, checkSession])
  );

  useEffect(() => {
    if (params.ref?.trim()) {
      setReferralCodeInput(params.ref.trim());
      setReferralExpanded(true);
    }
  }, [params.ref]);

  useEffect(() => {
    if (!sessionCheckAllowed || !sessionCheckDone) return;
    SecureStore.getItemAsync(LAST_LOGIN_EMAIL_KEY).then((stored) => {
      if (stored?.trim()) setEmail(stored.trim());
    }).catch(() => {});
  }, [sessionCheckAllowed, sessionCheckDone]);

  const blockOpacity = useRef(new Animated.Value(0)).current;
  const blockScale = useRef(new Animated.Value(0.92)).current;
  const titleScale = useRef(new Animated.Value(0.6)).current;
  const accentScale = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const accentPulse = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const charOpacity = useRef(new Animated.Value(0)).current;
  const charTranslateY = useRef(new Animated.Value(-90)).current;
  const scrollRef = useRef<ScrollView>(null);
  const shimmerX = useRef(new Animated.Value(-SHIMMER_WIDTH)).current;
  const { isTablet } = useResponsive();

  useEffect(() => {
    const onShow = () => {
      setKeyboardVisible(true);
      // Scroll so the email + Send code button are above the keyboard
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.timing(blockOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(blockScale, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(titleScale, {
        toValue: 1,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(accentScale, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]);
    entrance.start(({ finished }) => {
      if (!finished) return;
      Animated.parallel([
        Animated.timing(charOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(charTranslateY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [blockOpacity, blockScale, titleScale, accentScale, taglineOpacity, charOpacity, charTranslateY]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(accentPulse, {
          toValue: 1.15,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(accentPulse, {
          toValue: 0.92,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [accentPulse]);

  useEffect(() => {
    const { width } = Dimensions.get('window');
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: width + SHIMMER_WIDTH,
          duration: SHIMMER_SWEEP_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerX, {
          toValue: -SHIMMER_WIDTH,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(SHIMMER_PAUSE_MS),
      ])
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, [shimmerX]);

  async function sendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Enter your email', 'We\'ll send you a one-time code to sign in.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    try {
      await SecureStore.setItemAsync(LAST_LOGIN_EMAIL_KEY, trimmed);
    } catch {
      // ignore storage errors
    }
    const ref = referralCodeInput.trim().toUpperCase();
    if (ref) {
      try {
        await SecureStore.setItemAsync(PENDING_REFERRAL_KEY, ref);
      } catch {
        // ignore storage errors
      }
    }
    router.push({ pathname: '/auth/verify-otp', params: { email: trimmed } });
  }

  const anyLoading = loading;

  if (!sessionCheckDone) {
    return (
      <View style={[styles.keyboardWrap, styles.sessionCheck]}>
        {!sessionCheckAllowed && (
          <Text style={styles.loadingText}>Success!</Text>
        )}
      </View>
    );
  }

  const onTitlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.97, friction: 8, tension: 200, useNativeDriver: true }).start();
  };
  const onTitlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start();
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardVisible && styles.scrollContentKeyboardUp,
          isTablet && { alignItems: 'center' },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.container, isTablet && { maxWidth: CONTENT_MAX_WIDTH, width: '100%' }]}>
      <View style={styles.characterContainer} pointerEvents="none">
        <Animated.View
          style={[
            styles.characterWrap,
            {
              opacity: charOpacity,
              transform: [{ translateY: charTranslateY }],
            },
          ]}
        >
          <Image source={require('@/assets/Logo.png')} style={styles.characterImage} resizeMode="contain" />
        </Animated.View>
      </View>
      <Pressable onPressIn={onTitlePressIn} onPressOut={onTitlePressOut} style={styles.titleBlockWrap}>
        <Animated.View
          style={[
            styles.titleBlock,
            {
              opacity: blockOpacity,
              transform: [{ scale: Animated.multiply(blockScale, pressScale) }],
            },
          ]}
        >
          <View style={styles.shimmerContainer} pointerEvents="none">
            <Animated.View style={[styles.shimmerStrip, { transform: [{ translateX: shimmerX }] }]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <Animated.View style={{ transform: [{ scale: titleScale }] }}>
            <Image source={require('@/assets/Logo.png')} style={styles.titleLogo} resizeMode="contain" />
          </Animated.View>
          <Animated.View style={[styles.titleAccent, { transform: [{ scaleX: accentScale }, { scaleY: accentPulse }] }]} />
          <Animated.View style={{ opacity: taglineOpacity }}>
            <Text style={styles.titleTagline}>THE QUIZ APP</Text>
            <Text style={styles.titleHook}>OUTTHINK. OUTPLAY. OUTRANK.</Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
      <Text style={styles.subtitle}>Daily quiz. 1v1 battles. Live events.</Text>
      <View style={styles.subtitleDivider} />
      <Text style={styles.prompt}>Enter your email to get a sign-in code</Text>
      <TextInput
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor="#94a3b8"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!loading}
      />
      <Pressable style={styles.referralToggle} onPress={() => setReferralExpanded((v) => !v)}>
        <Text style={styles.referralPrompt}>Referral code (optional)</Text>
        <Ionicons name={referralExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
      </Pressable>
      {referralExpanded && (
        <TextInput
          style={styles.input}
          placeholder="Friend's code"
          placeholderTextColor="#94a3b8"
          value={referralCodeInput}
          onChangeText={setReferralCodeInput}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
        />
      )}
      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={sendCode}
        disabled={anyLoading}
      >
        <Text style={styles.buttonText}>{loading ? 'Sending…' : 'Send code'}</Text>
      </Pressable>
      <Text style={styles.hint}>We’ll email you a 6-digit code. No password needed.</Text>
    </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: { flex: 1, backgroundColor: '#f1f5f9' },
  sessionCheck: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, color: '#64748b', marginTop: 8 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
  scrollContentKeyboardUp: { justifyContent: 'flex-end', paddingBottom: 280 },
  container: { padding: 24, backgroundColor: '#f1f5f9' },
  characterContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: -24,
    height: 100,
    overflow: 'visible',
  },
  characterWrap: {
    alignItems: 'center',
  },
  characterImage: {
    width: 100,
    height: 100,
  },
  titleBlockWrap: { alignSelf: 'stretch' },
  titleBlock: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 0,
    marginHorizontal: -24,
    paddingTop: 40,
    paddingBottom: 14,
    paddingHorizontal: 24,
    backgroundColor: '#5b21b6',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 5,
    borderBottomColor: '#f97316',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  shimmerContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  shimmerStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SHIMMER_WIDTH,
  },
  titleLogo: { width: 1020, height: 245, maxWidth: '100%', marginBottom: 15 },
  titleAccent: {
    width: 72,
    height: 5,
    backgroundColor: '#f97316',
    marginTop: 0,
  },
  titleTagline: {
    fontSize: 13,
    fontWeight: '800',
    color: '#e9d5ff',
    textAlign: 'center',
    letterSpacing: 6,
    marginTop: 14,
  },
  titleHook: {
    fontSize: 11,
    fontWeight: '700',
    color: '#c4b5fd',
    textAlign: 'center',
    letterSpacing: 3,
    marginTop: 8,
  },
  subtitle: { fontSize: 16, fontWeight: '700', color: '#5b21b6', textAlign: 'center', marginTop: 15, marginBottom: 20 },
  subtitleDivider: { height: 1, backgroundColor: '#e5e7eb', marginHorizontal: 8, marginBottom: 20 },
  prompt: { fontSize: 16, fontWeight: '500', color: '#334155', marginBottom: 12 },
  referralToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 8, paddingVertical: 8 },
  referralPrompt: { fontSize: 14, fontWeight: '500', color: '#64748b' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  button: { backgroundColor: '#4f46e5', padding: 16, borderRadius: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center', fontSize: 16 },
  hint: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 16 },
});
