import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Level } from '../shared/checks';

export type ThemePref = 'auto' | 'light' | 'dark';

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  input: string;
  btn: string;
  btnText: string;
  primary: string;
  noteBg: string;
  noteText: string;
  level: Record<Level, string>;
}

const light: Theme = {
  dark: false,
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#111111',
  muted: '#6b6f76',
  border: '#d6d8dc',
  input: '#ffffff',
  btn: '#e3e5e8',
  btnText: '#111111',
  primary: '#0a66d8',
  noteBg: '#fff4ce',
  noteText: '#5c4400',
  level: { ok: '#1f8f5f', minor: '#b98600', major: '#d93025', maintenance: '#3b78e7', unknown: '#8a8f96' },
};

// Angelehnt an die iOS-Systemfarben im Dunkelmodus
const dark: Theme = {
  dark: true,
  bg: '#000000',
  card: '#1c1c1e',
  text: '#f2f2f7',
  muted: '#98989f',
  border: '#38383a',
  input: '#1c1c1e',
  btn: '#2c2c2e',
  btnText: '#f2f2f7',
  primary: '#0a84ff',
  noteBg: '#3a2f00',
  noteText: '#ffd60a',
  level: { ok: '#30d158', minor: '#ffd60a', major: '#ff453a', maintenance: '#64d2ff', unknown: '#8e8e93' },
};

const KEY = 'themePref';

export const THEME_LABEL: Record<ThemePref, string> = { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' };

/** Liefert das aktive Farbschema und die gespeicherte Einstellung (Automatisch/Hell/Dunkel). */
export function useThemeState() {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('auto');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v === 'light' || v === 'dark' || v === 'auto') setPrefState(v); })
      .catch(() => {});
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  };

  const isDark = pref === 'auto' ? system === 'dark' : pref === 'dark';
  return { theme: isDark ? dark : light, pref, setPref };
}

export const ThemeContext = createContext<{ theme: Theme; pref: ThemePref; setPref: (p: ThemePref) => void }>({
  theme: light,
  pref: 'auto',
  setPref: () => {},
});

export const useTheme = () => useContext(ThemeContext);
