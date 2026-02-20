'use client';

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';

const HEARTBEAT_INTERVAL_MS = 90 * 1000; // 90 seconds
const LOCATION_TIMEOUT_MS = 12_000; // avoid hanging on iOS if location is slow/unavailable

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isLocationAvailable(): boolean {
  try {
    return typeof Location?.getForegroundPermissionsAsync === 'function';
  } catch {
    return false;
  }
}

/**
 * When the app is in the foreground and the user is signed in, call update_last_seen
 * periodically so they count as "online" on the map. Sends coarse location (rounded
 * to 2 decimals, ~1 km) when permission granted so the map shows you in your area.
 * Safe on iOS/iPad: full try/catch, location timeout, and fallback when location unavailable.
 */
export function PresenceHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const stopHeartbeat = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const tick = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (!isLocationAvailable()) {
        await Promise.resolve(supabase.rpc('update_last_seen', {})).catch(() => {});
        return;
      }

      const { status } = await Location.getForegroundPermissionsAsync();
      const canUse = status === 'granted';
      if (!canUse) {
        const { status: requested } = await Location.requestForegroundPermissionsAsync();
        if (requested !== 'granted') {
          await Promise.resolve(supabase.rpc('update_last_seen', {})).catch(() => {});
          return;
        }
      }

      const locPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maxAge: 120000,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Location timeout')), LOCATION_TIMEOUT_MS)
      );
      const loc = await Promise.race([locPromise, timeoutPromise]);

      const lat = roundTo2(loc.coords.latitude);
      const lng = roundTo2(loc.coords.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        await Promise.resolve(supabase.rpc('update_last_seen', { p_lat: lat, p_lng: lng })).catch(() => {});
      } else {
        await Promise.resolve(supabase.rpc('update_last_seen', {})).catch(() => {});
      }
    } catch {
      await Promise.resolve(supabase.rpc('update_last_seen', {})).catch(() => {});
    }
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    tick(); // run once immediately
    intervalRef.current = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && appStateRef.current !== 'active') {
        startHeartbeat();
      } else if (nextState !== 'active') {
        stopHeartbeat();
      }
      appStateRef.current = nextState;
    });

    if (AppState.currentState === 'active') {
      startHeartbeat();
    }

    return () => {
      sub.remove();
      stopHeartbeat();
    };
  }, []);

  return null;
}
