import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AppState, FlatList, Modal, Pressable, RefreshControl,
  ScrollView, Share, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { SymbolView } from 'expo-symbols';
import * as Notifications from 'expo-notifications';
import { LEVEL_LABEL, type CheckResult, type Level, type Service } from './shared/checks';
import {
  allServices, exportWorkerConfig, loadCustom, loadResults, loadSelected,
  runChecks, saveCustom, saveSelected,
} from './src/monitor';
import { registerBackgroundCheck } from './src/background';
import { THEME_LABEL, ThemeContext, useTheme, useThemeState, type Theme, type ThemePref } from './src/theme';

const POLL_MS = 2 * 60 * 1000; // solange die App offen ist

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export default function App() {
  const themeState = useThemeState();
  return (
    <ThemeContext.Provider value={themeState}>
      <SafeAreaProvider>
        <Main />
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}

function useStyles() {
  const { theme } = useTheme();
  return useMemo(() => makeStyles(theme), [theme]);
}

function Main() {
  const { theme } = useTheme();
  const styles = useStyles();
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [bgActive, setBgActive] = useState(false);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    try {
      setResults(await runChecks());
      setLastRun(new Date());
    } finally {
      running.current = false;
      setLoading(false);
    }
  }, []);

  const reloadConfig = useCallback(async () => {
    const [all, sel] = await Promise.all([allServices(), loadSelected()]);
    setServices(all);
    setSelected(sel);
  }, []);

  useEffect(() => {
    (async () => {
      await Notifications.requestPermissionsAsync();
      await reloadConfig();
      setResults(await loadResults());
      setBgActive(await registerBackgroundCheck());
      refresh();
    })();
  }, [reloadConfig, refresh]);

  // Polling, solange die App im Vordergrund ist
  useEffect(() => {
    let timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      clearInterval(timer);
      if (s === 'active') {
        refresh();
        timer = setInterval(refresh, POLL_MS);
      }
    });
    return () => { clearInterval(timer); sub.remove(); };
  }, [refresh]);

  const visible = selected.map((id) => services.find((s) => s.id === id)).filter((s): s is Service => !!s);
  const problems = visible.filter((s) => ['minor', 'major'].includes(results[s.id]?.level ?? '')).length;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.h1}>Störungsmelder</Text>
          <Pressable
            onPress={() => setShowPicker(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Einstellungen"
            style={({ pressed }) => [styles.gear, pressed && { opacity: 0.5 }]}
          >
            <SymbolView
              name="gearshape"
              size={26}
              tintColor={theme.primary}
              fallback={<Text style={[styles.h2, { color: theme.primary }]}>⚙︎</Text>}
            />
          </Pressable>
        </View>
        <Text style={[styles.summary, { color: problems ? theme.level.major : theme.level.ok }]}>
          {problems ? `${problems} Dienst(e) mit Störung` : 'Keine bekannten Störungen'}
        </Text>
        <Text style={styles.muted}>
          {lastRun ? `Zuletzt geprüft ${lastRun.toLocaleTimeString('de-DE')}` : 'Noch nicht geprüft'}
          {' · '}
          {bgActive ? 'Hintergrund-Prüfung aktiv' : 'Prüft nur bei geöffneter App'}
          {` · v${Constants.expoConfig?.version ?? '?'}`}
        </Text>
      </View>

      {isRunningInExpoGo() && (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Expo Go kann im Hintergrund nicht prüfen. Für Pushes bei geschlossener App den
            Cloud-Prüfer (ntfy) einrichten – siehe README.
          </Text>
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.muted} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 10 }}
        ListEmptyComponent={<Text style={styles.muted}>Keine Dienste ausgewählt.</Text>}
        renderItem={({ item }) => <ServiceRow svc={item} res={results[item.id]} />}
      />

      <Picker
        visible={showPicker}
        services={services}
        selected={selected}
        onClose={async () => {
          setShowPicker(false);
          await reloadConfig();
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

function ServiceRow({ svc, res }: { svc: Service; res?: CheckResult }) {
  const { theme } = useTheme();
  const styles = useStyles();
  const level: Level = svc.workerOnly ? 'unknown' : res?.level ?? 'unknown';
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: theme.level[level] }]} />
        <Text style={styles.name} numberOfLines={1}>{svc.name}</Text>
        <Text style={[styles.badge, { color: theme.level[level] }]}>{LEVEL_LABEL[level]}</Text>
      </View>
      <Text style={styles.muted}>
        {svc.workerOnly ? 'Wird nur vom Cloud-Prüfer überwacht' : res?.message ?? 'Wird geprüft …'}
      </Text>
      {res?.incidents.slice(0, 5).map((t, i) => (
        <Text key={i} style={styles.incident}>• {t}</Text>
      ))}
    </View>
  );
}

function Picker({ visible, services, selected, onClose }: {
  visible: boolean; services: Service[]; selected: string[]; onClose: () => void;
}) {
  const { theme, pref, setPref } = useTheme();
  const styles = useStyles();
  const [sel, setSel] = useState<string[]>(selected);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'statuspage' | 'http'>('http');
  const [list, setList] = useState(services);

  useEffect(() => { if (visible) { setSel(selected); setList(services); } }, [visible, selected, services]);

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const addCustom = async () => {
    if (!name.trim() || !/^https?:\/\//.test(url.trim())) {
      Alert.alert('Bitte Name und eine URL mit https:// angeben');
      return;
    }
    const svc: Service = { id: `custom-${Date.now()}`, name: name.trim(), kind, url: url.trim(), custom: true };
    await saveCustom([...(await loadCustom()), svc]);
    setList((l) => [...l, svc]);
    setSel((s) => [...s, svc.id]);
    setName(''); setUrl('');
  };

  const removeCustom = async (id: string) => {
    await saveCustom((await loadCustom()).filter((c) => c.id !== id));
    setList((l) => l.filter((s) => s.id !== id));
    setSel((s) => s.filter((x) => x !== id));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalHead, { backgroundColor: theme.bg }]}>
        <Text style={styles.h1small}>Einstellungen</Text>
        <Pressable onPress={async () => { await saveSelected(sel); onClose(); }}>
          <Text style={styles.link}>Fertig</Text>
        </Pressable>
      </View>
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 16, gap: 4 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h2}>Darstellung</Text>
        <View style={[styles.row, { marginTop: 6, marginBottom: 20 }]}>
          {(['auto', 'light', 'dark'] as ThemePref[]).map((p) => (
            <Btn key={p} label={THEME_LABEL[p]} onPress={() => setPref(p)} primary={pref === p} />
          ))}
        </View>

        <Text style={styles.h2}>Dienste</Text>
        {list.map((s) => (
          <View key={s.id} style={styles.pickRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{s.name}</Text>
              {s.workerOnly && <Text style={styles.muted}>Nur Cloud-Prüfer (braucht Admin-Zugang)</Text>}
              {s.custom && (
                <Pressable onPress={() => removeCustom(s.id)}>
                  <Text style={[styles.muted, { color: theme.level.major }]}>Entfernen</Text>
                </Pressable>
              )}
            </View>
            <Switch value={sel.includes(s.id)} onValueChange={() => toggle(s.id)} />
          </View>
        ))}

        <Text style={[styles.h2, { marginTop: 24 }]}>Eigenen Dienst hinzufügen</Text>
        <TextInput
          style={styles.input} placeholder="Name, z. B. Meine Website" placeholderTextColor={theme.muted}
          value={name} onChangeText={setName} keyboardAppearance={theme.dark ? 'dark' : 'light'}
        />
        <TextInput
          style={styles.input} placeholder="https://…" placeholderTextColor={theme.muted}
          value={url} onChangeText={setUrl} keyboardAppearance={theme.dark ? 'dark' : 'light'}
          autoCapitalize="none" autoCorrect={false} keyboardType="url"
        />
        <View style={styles.row}>
          <Btn label="Erreichbarkeit" onPress={() => setKind('http')} primary={kind === 'http'} />
          <Btn label="Statuspage.io-Seite" onPress={() => setKind('statuspage')} primary={kind === 'statuspage'} />
        </View>
        <Text style={styles.muted}>
          {kind === 'http'
            ? 'Prüft, ob die Seite antwortet (kein 5xx-Fehler, kein Timeout).'
            : 'Für offizielle Statusseiten auf Statuspage.io-Basis (z. B. https://www.githubstatus.com).'}
        </Text>
        <Btn label="Hinzufügen" onPress={addCustom} primary />

        <Text style={[styles.h2, { marginTop: 32 }]}>Cloud-Prüfer</Text>
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          Teilt die oben ausgewählten Dienste als Text für die Datei worker/services.json auf GitHub.
          Der Cloud-Prüfer schickt dann auch für diese Dienste Push-Nachrichten über ntfy.
        </Text>
        <Btn
          label="Cloud-Konfig teilen"
          onPress={async () => {
            await saveSelected(sel);
            await Share.share({ message: await exportWorkerConfig() });
          }}
        />
        <View style={{ height: 40 }} />
      </ScrollView>
    </Modal>
  );
}

function Btn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, primary && styles.btnPrimary, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.btnText, primary && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 2 },
  h1: { fontSize: 30, fontWeight: '700', color: t.text, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  gear: { padding: 4 },
  h1small: { fontSize: 24, fontWeight: '700', color: t.text },
  h2: { fontSize: 20, fontWeight: '600', color: t.text },
  summary: { fontSize: 16, fontWeight: '600' },
  muted: { color: t.muted, fontSize: 13 },
  note: { margin: 16, marginBottom: 0, padding: 10, borderRadius: 10, backgroundColor: t.noteBg },
  noteText: { fontSize: 13, color: t.noteText },
  card: { backgroundColor: t.card, borderRadius: 12, padding: 12, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { fontSize: 16, fontWeight: '500', flexShrink: 1, color: t.text },
  badge: { marginLeft: 'auto', fontWeight: '600', fontSize: 13 },
  incident: { fontSize: 13, color: t.text },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: t.btn },
  btnPrimary: { backgroundColor: t.primary },
  btnText: { fontWeight: '600', color: t.btnText },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  link: { color: t.primary, fontSize: 17, fontWeight: '600' },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  input: { backgroundColor: t.input, color: t.text, borderRadius: 10, padding: 12, fontSize: 16, borderWidth: 1, borderColor: t.border },
});
