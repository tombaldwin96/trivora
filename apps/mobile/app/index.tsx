import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Animated, Easing, Image, KeyboardAvoidingView, ScrollView, Platform, Keyboard, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signInWithOAuthProvider } from '@/lib/auth-oauth';

const SHIMMER_WIDTH = 140;
const SHIMMER_SWEEP_MS = 2000;
const SHIMMER_PAUSE_MS = 4000; // cycle = sweep + pause = 6s

export default function HomeScreen() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'facebook' | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionChecked(true);
      if (session) router.replace('/(tabs)');
    });
  }, [router]);

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
    router.push({ pathname: '/auth/verify-otp', params: { email: trimmed } });
  }

  async function handleApple() {
    setOauthLoading('apple');
    const { ok, error } = await signInWithOAuthProvider('apple');
    setOauthLoading(null);
    if (ok && !error) router.replace('/(tabs)');
    else if (error) Alert.alert('Sign in with Apple', error);
  }

  async function handleFacebook() {
    setOauthLoading('facebook');
    const { ok, error } = await signInWithOAuthProvider('facebook');
    setOauthLoading(null);
    if (ok && !error) router.replace('/(tabs)');
    else if (error) Alert.alert('Sign in with Facebook', error);
  }

  const anyLoading = loading || oauthLoading !== null;

  const onTitlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.97, friction: 8, tension: 200, useNativeDriver: true }).start();
  };
  const onTitlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start();
  };

  if (!sessionChecked) {
    return <View style={styles.keyboardWrap} />;
  }

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
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.container}>
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
          <Image source={require('@/assets/mahan.png')} style={styles.characterImage} resizeMode="contain" />
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
            <Text style={styles.title}>MAHAN</Text>
          </Animated.View>
          <Animated.View style={[styles.titleAccent, { transform: [{ scaleX: accentScale }, { scaleY: accentPulse }] }]} />
          <Animated.View style={{ opacity: taglineOpacity }}>
            <Text style={styles.titleTagline}>THE QUIZ APP</Text>
            <Text style={styles.titleHook}>OUTTHINK. OUTPLAY. OUTRANK.</Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
      <Text style={styles.subtitle}>Daily quiz. 1v1 battles. Live events.</Text>

      <Pressable
        style={[styles.socialButton, styles.appleButton, anyLoading && styles.buttonDisabled]}
        onPress={handleApple}
        disabled={anyLoading}
      >
        <Ionicons name="logo-apple" size={22} color="#fff" />
        <Text style={styles.appleButtonText}>Continue with Apple</Text>
      </Pressable>
      <Pressable
        style={[styles.socialButton, styles.facebookButton, anyLoading && styles.buttonDisabled]}
        onPress={handleFacebook}
        disabled={anyLoading}
      >
        <Ionicons name="logo-facebook" size={22} color="#fff" />
        <Text style={styles.facebookButtonText}>Continue with Facebook</Text>
      </Pressable>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

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
    paddingBottom: 32,
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
  title: {
    fontSize: 52,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  titleAccent: {
    width: 72,
    height: 5,
    backgroundColor: '#f97316',
    marginTop: 10,
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
  subtitle: { fontSize: 16, fontWeight: '700', color: '#5b21b6', textAlign: 'center', marginTop: 28, marginBottom: 28 },
  socialButton: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleButton: { backgroundColor: '#000', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  appleButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  facebookButton: { backgroundColor: '#1877f2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  facebookButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { marginHorizontal: 12, color: '#64748b', fontSize: 14 },
  prompt: { fontSize: 16, fontWeight: '500', color: '#334155', marginBottom: 12 },
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
