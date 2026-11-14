import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  CATALOG, checkService, diffResults, formatChange, resolveServices,
  type CheckResult, type Service, type ServiceState,
} from '../shared/checks';

const K = {
  selected: 'selected', custom: 'custom', state: 'state', results: 'results',
  appNotify: 'appNotify', bgStats: 'bgStats',
};

const load = async <T,>(key: string, fallback: T): Promise<T> => {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: unknown) => AsyncStorage.setItem(key, JSON.stringify(v));

export const DEFAULT_SELECTED = ['m365-outlook', 'm365-teams', 'youtube', 'google-workspace'];

export const loadSelected = () => load<string[]>(K.selected, DEFAULT_SELECTED);
export const saveSelected = (ids: string[]) => save(K.selected, ids);
export const loadCustom = () => load<Service[]>(K.custom, []);
export const saveCustom = (s: Service[]) => save(K.custom, s);
export const loadResults = () => load<Record<string, CheckResult>>(K.results, {});

/** Eigene Benachrichtigungen der App – standardmäßig aus, weil ntfy zuverlässiger meldet. */
export const loadAppNotify = () => load<boolean>(K.appNotify, false);
export const saveAppNotify = (on: boolean) => save(K.appNotify, on);

export interface BackgroundStats { last: string; count: number; since: string }

/** Wird bei jedem Aufwecken durch iOS im Hintergrund aufgerufen. */
export async function recordBackgroundRun(): Promise<void> {
  const now = new Date().toISOString();
  const prev = await load<BackgroundStats | null>(K.bgStats, null);
  await save(K.bgStats, { last: now, count: (prev?.count ?? 0) + 1, since: prev?.since ?? now });
}
export const loadBackgroundStats = () => load<BackgroundStats | null>(K.bgStats, null);

export async function allServices(): Promise<Service[]> {
  return [...CATALOG, ...(await loadCustom())];
}

export async function selectedServices(): Promise<Service[]> {
  const [all, ids] = await Promise.all([allServices(), loadSelected()]);
  return ids.map((id) => all.find((s) => s.id === id)).filter((s): s is Service => !!s && !s.workerOnly);
}

/**
 * Prüft alle gewählten Dienste und speichert die Ergebnisse.
 * Lokale Benachrichtigungen nur, wenn „Benachrichtigungen der App“ eingeschaltet ist.
 */
export async function runChecks(): Promise<Record<string, CheckResult>> {
  const services = await selectedServices();
  const results = await Promise.all(services.map((s) => checkService(s)));
  const [prev, notify] = await Promise.all([load<ServiceState>(K.state, {}), loadAppNotify()]);
  const { state, changes } = diffResults(services, results, prev);
  for (const c of notify ? changes : []) {
    const n = formatChange(c);
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, sound: true },
      trigger: null, // sofort
    });
  }
  const map = Object.fromEntries(results.map((r) => [r.id, r]));
  await Promise.all([save(K.state, state), save(K.results, map)]);
  return map;
}

/** JSON für worker/services.json (Cloud-Prüfer). */
export async function exportWorkerConfig(): Promise<string> {
  const [ids, custom] = await Promise.all([loadSelected(), loadCustom()]);
  const entries = ids.map((id) => custom.find((c) => c.id === id) ?? id);
  return JSON.stringify(resolveServices(entries).map((s) => (s.custom ? s : s.id)), null, 2);
}
