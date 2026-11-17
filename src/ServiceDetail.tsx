import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {
  LEVEL_LABEL, dailyBars, daysWithoutIncident, fetchHistory, statusPageUrl,
  type CheckResult, type HistoryEntry, type Level, type Service,
} from '../shared/checks';
import { loadLocalHistory } from './monitor';
import { useTheme, type Theme } from './theme';

const DAYS = 30;

/** „Live-Puls“: ein Ring, der aus dem Statuspunkt herauswächst – ruhig bei OK, hektisch bei Störung. */
function LivePulse({ color, level }: { color: string; level: Level }) {
  const v = useRef(new Animated.Value(0)).current;
  const duration = level === 'major' ? 650 : level === 'minor' ? 1100 : level === 'ok' ? 2200 : 1600;
  useEffect(() => {
    v.setValue(0);
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  return (
    <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
        }}
      />
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
    </View>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function fmtDuration(ms: number) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.round(h / 24)} Tage`;
}

function dayLabel(index: number) {
  const d = new Date();
  d.setDate(d.getDate() - (DAYS - 1 - index));
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function ServiceDetail({ svc, result, onClose }: {
  svc: Service | null; result?: CheckResult; onClose: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [source, setSource] = useState('');
  const [since, setSince] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (!svc) return;
    let cancelled = false;
    setLoading(true);
    setPicked(null);
    (async () => {
      const local = await loadLocalHistory(svc.id);
      let official: Awaited<ReturnType<typeof fetchHistory>> = null;
      try {
        official = await fetchHistory(svc);
      } catch {
        official = null; // offline o. Ä. → nur eigene Beobachtung
      }
      if (cancelled) return;
      if (official) {
        // Offizieller Verlauf; reicht er nur wenige Tage (DATEV), mit eigener Beobachtung ergänzen.
        const merged = official.coversDays
          ? [...official.entries, ...local.entries.filter((l) =>
            Date.parse(l.start) < Date.now() - official!.coversDays! * 86400000)]
          : official.entries;
        setEntries(merged.sort((a, b) => Date.parse(b.start) - Date.parse(a.start)));
        const officialSince = official.coversDays
          ? new Date(Date.now() - official.coversDays * 86400000).toISOString() : null;
        setSince(officialSince && local.since && local.since < officialSince ? local.since : officialSince);
        setSource(official.coversDays
          ? `Offizieller Verlauf (letzte ${official.coversDays} Tage), davor von der App beobachtet`
          : 'Offizieller Verlauf des Anbieters');
      } else {
        setEntries(local.entries);
        setSince(local.since);
        setSource(local.since ? `Von der App beobachtet seit ${fmtDate(local.since)}` : 'Noch keine Beobachtungen');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [svc]);

  if (!svc) return null;
  const level: Level = svc.workerOnly ? 'unknown' : result?.level ?? 'unknown';
  const color = theme.level[level];
  const bars = dailyBars(entries, { days: DAYS, since });
  const free = daysWithoutIncident(entries);
  const url = statusPageUrl(svc);
  const pickedEntries = picked === null ? [] : entries.filter((e) => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (DAYS - 1 - picked));
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return Date.parse(e.start) < end.getTime() && (e.end ? Date.parse(e.end) : Date.now()) >= start.getTime();
  });

  let streak: string;
  if (level === 'major' || level === 'minor') streak = '🔥 Gerade gestört';
  else if (free === null) streak = entries.length || since ? '🎉 Keine Störung bekannt' : '🕒 Noch keine Daten';
  else if (free === 0) streak = '🩹 Letzte Störung heute beendet';
  else streak = `🎉 Seit ${free} ${free === 1 ? 'Tag' : 'Tagen'} störungsfrei`;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.head, { backgroundColor: theme.bg }]}>
        <Text style={styles.title} numberOfLines={2}>{svc.name}</Text>
        <Pressable onPress={onClose} hitSlop={12}><Text style={styles.link}>Fertig</Text></Pressable>
      </View>
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={styles.card}>
          <View style={styles.row}>
            <LivePulse color={color} level={level} />
            <Text style={[styles.status, { color }]}>{LEVEL_LABEL[level]}</Text>
          </View>
          <Text style={styles.muted}>
            {svc.workerOnly ? 'Wird nur vom Cloud-Prüfer überwacht' : result?.message ?? 'Noch nicht geprüft'}
          </Text>
          {result?.incidents.slice(0, 5).map((t, i) => <Text key={i} style={styles.text}>• {t}</Text>)}
        </View>

        <View style={styles.card}>
          <Text style={styles.streak}>{streak}</Text>
          <View style={styles.bars}>
            {bars.map((b, i) => (
              <Pressable
                key={i}
                onPress={() => setPicked(picked === i ? null : i)}
                style={[styles.bar, {
                  backgroundColor: b ? theme.level[b] : 'transparent',
                  borderColor: b ? 'transparent' : theme.border,
                  opacity: picked === null || picked === i ? 1 : 0.35,
                }]}
              />
            ))}
          </View>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={styles.small}>vor {DAYS} Tagen</Text>
            <Text style={styles.small}>heute</Text>
          </View>
          {picked !== null && (
            <Text style={styles.text}>
              {dayLabel(picked)}:{' '}
              {bars[picked] === null ? 'keine Daten'
                : pickedEntries.length ? pickedEntries.map((e) => e.title).slice(0, 3).join(' · ')
                : 'keine Störung'}
            </Text>
          )}
          {picked === null && <Text style={styles.small}>Tipp auf einen Balken zeigt den Tag.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Verlauf</Text>
          {loading ? <ActivityIndicator color={theme.muted} /> : entries.length === 0 ? (
            <Text style={styles.muted}>Keine Störungen im Verlauf.</Text>
          ) : entries.slice(0, 12).map((e, i) => (
            <View key={i} style={styles.entry}>
              <View style={[styles.dot, { backgroundColor: theme.level[e.level] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.text} numberOfLines={2}>{e.title}</Text>
                <Text style={styles.small}>
                  {fmtDate(e.start)} – {e.end ? fmtDate(e.end) : 'läuft'}
                  {' · '}
                  {fmtDuration((e.end ? Date.parse(e.end) : Date.now()) - Date.parse(e.start))}
                </Text>
              </View>
            </View>
          ))}
          <Text style={styles.small}>{source}</Text>
        </View>

        {url && (
          <Pressable
            onPress={() => Linking.openURL(url)}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.buttonText}>
              {url.includes('allestrungen') ? 'Bei Allestörungen ansehen' : 'Statusseite öffnen'}
            </Text>
          </Pressable>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </Modal>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: t.text, flexShrink: 1 },
  link: { color: t.primary, fontSize: 17, fontWeight: '600' },
  card: { backgroundColor: t.card, borderRadius: 12, padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 20, fontWeight: '700' },
  streak: { fontSize: 17, fontWeight: '600', color: t.text },
  h2: { fontSize: 17, fontWeight: '600', color: t.text },
  text: { fontSize: 14, color: t.text },
  muted: { fontSize: 14, color: t.muted },
  small: { fontSize: 12, color: t.muted },
  bars: { flexDirection: 'row', gap: 2, height: 34, marginTop: 4 },
  bar: { flex: 1, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth },
  entry: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  button: { backgroundColor: t.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
