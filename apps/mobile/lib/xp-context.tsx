'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** XP required per level by tier: 1–50: 50, 51–75: 75, 76–99: 90, 100+: 100 */
export function pointsForLevel(level: number): number {
  if (level <= 50) return 50;
  if (level <= 75) return 75;
  if (level <= 99) return 90;
  return 100;
}

/** Total XP required to reach the start of this level (e.g. level 2 = 50, level 51 = 2525). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= 50) return (level - 1) * 50;
  if (level <= 75) return 49 * 50 + (level - 50) * 75;   // 2450 + ...
  if (level <= 99) return 49 * 50 + 25 * 75 + (level - 75) * 90; // 4325 + ...
  return 49 * 50 + 25 * 75 + 24 * 90 + (level - 99) * 100; // 6485 + ...
}

export function levelFromXp(xp: number): number {
  if (xp < 0) return 1;
  if (xp < 49 * 50) return Math.floor(xp / 50) + 1; // 1–50
  if (xp < 49 * 50 + 25 * 75) return 50 + Math.floor((xp - 2450) / 75); // 51–75
  if (xp < 49 * 50 + 25 * 75 + 24 * 90) return 75 + Math.floor((xp - 4325) / 90); // 76–99
  return 99 + Math.floor((xp - 6485) / 100);
}

/** Legacy: points for level 1 (many UIs still use this for labels). Use pointsForLevel(level) for current level. */
export const POINTS_PER_LEVEL = 50;

const MAX_COINS_FLY = 12;

type XpContextValue = {
  xp: number;
  level: number;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Add points (e.g. after a game). Returns { newXp, newLevel, leveledUp } and updates DB + state. */
  addPoints: (points: number) => Promise<{ newXp: number; newLevel: number; leveledUp: boolean }>;
  /** Pending XP to show as coins flying to level badge on Home (set by addPoints, consumed by Home). */
  pendingCoinsToFly: number;
  clearPendingCoinsToFly: () => void;
};

const XpContext = createContext<XpContextValue | null>(null);

export function XpProvider({ children }: { children: React.ReactNode }) {
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingCoinsToFly, setPendingCoinsToFly] = useState(0);
  const clearPendingCoinsToFly = useCallback(() => setPendingCoinsToFly(0), []);

  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setXp(0);
        setLoading(false);
        return;
      }
      const { data } = await supabase.from('profiles').select('xp').eq('id', user.id).single();
      const value = (data?.xp ?? 0) as number;
      setXp(Number.isFinite(value) ? value : 0);
    } catch {
      setXp(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const addPoints = useCallback(
    async (points: number): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> => {
      const fallback = { newXp: xp, newLevel: levelFromXp(xp), leveledUp: false };
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || points <= 0) return fallback;
        const oldLevel = levelFromXp(xp);
        let newXp = xp + points;
        let newLevel = levelFromXp(newXp);
        let saved = false;

        const { data: rows, error: rpcError } = await supabase.rpc('add_xp', { p_points: Math.round(points) });
        const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (!rpcError && row != null && typeof row.new_xp === 'number') {
          newXp = row.new_xp;
          newLevel = row.new_level ?? levelFromXp(newXp);
          saved = true;
        } else {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ xp: newXp, level: newLevel, updated_at: new Date().toISOString() })
            .eq('id', user.id);
          saved = !updateError;
        }

        const leveledUp = newLevel > oldLevel;
        if (saved) {
          setXp(newXp);
          setPendingCoinsToFly(Math.min(points, MAX_COINS_FLY));
        }
        return { newXp, newLevel, leveledUp };
      } catch {
        return fallback;
      }
    },
    [xp]
  );

  useEffect(() => {
    // Defer auth/storage well past boot so native modules aren't hit early (iOS startup crash workaround)
    let unsub: (() => void) | null = null;
    const refreshTimer = setTimeout(() => {
      refresh();
    }, 5000);
    const subTimer = setTimeout(() => {
      try {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => refresh().catch(() => {}));
        unsub = () => subscription?.unsubscribe?.();
      } catch {
        unsub = null;
      }
    }, 5000);
    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(subTimer);
      unsub?.();
    };
  }, [refresh]);

  const level = levelFromXp(xp);
  const value: XpContextValue = {
    xp,
    level,
    loading,
    refresh,
    addPoints,
    pendingCoinsToFly,
    clearPendingCoinsToFly,
  };
  return <XpContext.Provider value={value}>{children}</XpContext.Provider>;
}

export function useXp(): XpContextValue {
  const ctx = useContext(XpContext);
  if (!ctx) throw new Error('useXp must be used within XpProvider');
  return ctx;
}

/** Points for correct answers and 10/10 bonus (any quiz). */
export const XP = {
  perCorrect: 2,
  perfectBonus: 25,
} as const;
