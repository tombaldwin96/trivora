import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const THEME_KEY = 'app_theme';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    // Defer storage access well past boot to avoid native exception path (iOS crash workaround)
    const t = setTimeout(() => {
      SecureStore.getItemAsync(THEME_KEY)
        .then((stored) => {
          if (stored === 'dark' || stored === 'light') setThemeState(stored);
        })
        .catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  const setTheme = useCallback(async (next: Theme) => {
    setThemeState(next);
    try {
      await SecureStore.setItemAsync(THEME_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value: ThemeContextValue = {
    theme,
    isDark: theme === 'dark',
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
