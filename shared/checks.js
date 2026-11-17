// Gemeinsame Prüf-Logik für App (Expo) und Cloud-Worker (Node >= 20).
// Kein Expo-/Node-spezifischer Code hier – nur fetch().

/** Level: 'ok' | 'minor' | 'major' | 'maintenance' | 'unknown' */

const sp = (id, name, url) => ({ id, name, kind: 'statuspage', url });
const http = (id, name, url) => ({ id, name, kind: 'http', url });

export const CATALOG = [
  // Microsoft
  { id: 'm365-tenant', name: 'Microsoft 365 (eigener Tenant, Graph API)', kind: 'm365graph', workerOnly: true },
  http('m365-outlook', 'Outlook / M365 Erreichbarkeit', 'https://outlook.office365.com/'),
  http('m365-teams', 'Teams Erreichbarkeit', 'https://teams.microsoft.com/'),
  { id: 'azure', name: 'Microsoft Azure', kind: 'rss', url: 'https://azure.status.microsoft/en-us/status/feed/' },
  // Google
  { id: 'google-workspace', name: 'Google Workspace (Gmail, Drive, …)', kind: 'google', url: 'https://www.google.com/appsstatus/dashboard/incidents.json' },
  http('youtube', 'YouTube Erreichbarkeit', 'https://www.youtube.com/'),
  // Statuspage.io-Seiten (offizielle Statusseiten)
  sp('github', 'GitHub', 'https://www.githubstatus.com'),
  sp('discord', 'Discord', 'https://discordstatus.com'),
  sp('reddit', 'Reddit', 'https://www.redditstatus.com'),
  sp('cloudflare', 'Cloudflare', 'https://www.cloudflarestatus.com'),
  sp('dropbox', 'Dropbox', 'https://status.dropbox.com'),
  sp('zoom', 'Zoom', 'https://status.zoom.us'),
  sp('atlassian', 'Atlassian (Jira/Confluence)', 'https://status.atlassian.com'),
  sp('notion', 'Notion', 'https://www.notion-status.com'),
  sp('claude', 'Claude / Anthropic', 'https://status.anthropic.com'),
  { id: 'slack', name: 'Slack', kind: 'slack', url: 'https://slack-status.com/api/v2.0.0/current' },
  // Steuer-/Kanzlei-Umfeld
  { id: 'datev', name: 'DATEV (Rechenzentrum)', kind: 'datev', url: 'https://api.datev-status.de/v1' },
  {
    id: 'docuware', name: 'DocuWare Cloud (Europa)', kind: 'docuware', region: 'emea',
    url: 'https://statusportal.docuware.cloud/api/v2025-06-13/RegionalStatus/all',
  },
  http('odav', 'ODAV Website Erreichbarkeit', 'https://www.odav.de/'),
  // Reine Erreichbarkeit (keine offizielle Status-API)
  http('netflix', 'Netflix Erreichbarkeit', 'https://www.netflix.com/'),
  http('spotify', 'Spotify Erreichbarkeit', 'https://open.spotify.com/'),
  http('whatsapp', 'WhatsApp Web Erreichbarkeit', 'https://web.whatsapp.com/'),
  http('instagram', 'Instagram Erreichbarkeit', 'https://www.instagram.com/'),
];

export const LEVEL_LABEL = {
  ok: 'Alles OK',
  minor: 'Teilweise gestört',
  major: 'Störung',
  maintenance: 'Wartung',
  unknown: 'Unbekannt',
};

/** Erreichbarkeits-Checks brauchen 2 Fehlschläge in Folge, bevor gemeldet wird. */
export const confirmRuns = (svc) => (svc.kind === 'http' ? 2 : 1);

export function resolveServices(entries) {
  return entries
    .map((e) => (typeof e === 'string' ? CATALOG.find((c) => c.id === e) : e))
    .filter(Boolean);
}

async function get(url, { timeoutMs = 15000, headers = {}, fetchImpl = fetch, redirect = 'follow' } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      headers: { 'User-Agent': 'stoerungs-monitor/1.0', ...headers },
      signal: ctrl.signal,
      redirect,
    });
  } finally {
    clearTimeout(t);
  }
}

async function getJson(url, opts) {
  const r = await get(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const checkers = {
  async statuspage(svc, opts) {
    const d = await getJson(svc.url.replace(/\/$/, '') + '/api/v2/summary.json', opts);
    const ind = d?.status?.indicator ?? 'none';
    const incidents = (d.incidents ?? []).filter((i) => i.status !== 'resolved').map((i) => i.name);
    const maint = (d.scheduled_maintenances ?? []).filter((m) => m.status === 'in_progress').map((m) => m.name);
    const level =
      ind === 'none' ? (maint.length ? 'maintenance' : 'ok')
      : ind === 'minor' ? 'minor'
      : ind === 'maintenance' ? 'maintenance'
      : 'major'; // major, critical
    return { level, message: d?.status?.description ?? '', incidents: [...incidents, ...maint] };
  },

  async google(svc, opts) {
    const list = await getJson(svc.url, opts);
    const open = list.filter((i) => !i.end && (!svc.product ||
      (i.affected_products ?? []).some((p) => p.title?.toLowerCase().includes(svc.product.toLowerCase()))));
    const outage = open.some((i) => i.status_impact === 'SERVICE_OUTAGE');
    return {
      level: open.length === 0 ? 'ok' : outage ? 'major' : 'minor',
      message: open.length ? `${open.length} offene(r) Vorfall/Vorfälle` : 'Keine Vorfälle',
      incidents: open.map((i) => `${i.service_name}: ${i.external_desc ?? ''}`.trim()),
    };
  },

  async slack(svc, opts) {
    const d = await getJson(svc.url, opts);
    const inc = d.active_incidents ?? [];
    const outage = inc.some((i) => i.type === 'outage');
    return {
      level: inc.length === 0 ? 'ok' : outage ? 'major' : 'minor',
      message: inc.length ? 'Aktive Vorfälle' : 'Keine Vorfälle',
      incidents: inc.map((i) => i.title),
    };
  },

  async rss(svc, opts) {
    const r = await get(svc.url, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const titles = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)].map((m) => m[1].trim());
    return {
      level: titles.length ? 'minor' : 'ok',
      message: titles.length ? `${titles.length} aktive Meldung(en)` : 'Keine Meldungen',
      incidents: titles,
    };
  },

  async http(svc, opts) {
    const start = Date.now();
    let r;
    try {
      // Weiterleitungen (z. B. zur Microsoft-Anmeldung) nicht folgen: eine Antwort genügt als „erreichbar“.
      r = await get(svc.url, { ...opts, timeoutMs: 15000, redirect: 'manual' });
    } catch (e) {
      const why = e.name === 'AbortError' ? 'Timeout' : [e.message, e.cause?.code ?? e.cause?.message].filter(Boolean).join(': ');
      return { level: 'major', message: `Nicht erreichbar (${why})`, incidents: [] };
    }
    const ms = Date.now() - start;
    if (r.status >= 500) return { level: 'major', message: `Server-Fehler HTTP ${r.status}`, incidents: [] };
    return { level: 'ok', message: `Erreichbar (HTTP ${r.status}, ${ms} ms)`, incidents: [] };
  },

  // DATEV-Rechenzentrum: offizielle Status-Schnittstelle von datev-status.de
  async datev(svc, opts) {
    const base = svc.url.replace(/\/$/, '');
    const [incidents, maintenances] = await Promise.all([
      getJson(`${base}/incidents`, opts),
      getJson(`${base}/maintenances`, opts).catch(() => []),
    ]);
    const now = Date.now();
    const match = (name) => !svc.filter?.length || svc.filter.some((f) => name?.toLowerCase().includes(f.toLowerCase()));
    const active = incidents.filter((i) =>
      i.currentState !== 'AVAILABLE' && (!i.endDate || Date.parse(i.endDate) > now) && match(i.serviceInfoDto?.name));
    const STATE = { LIMITED: 'eingeschränkt', NOT_AVAILABLE: 'nicht verfügbar', UNAVAILABLE: 'nicht verfügbar' };
    if (active.length) {
      const major = active.some((i) => /NOT_AVAILABLE|UNAVAILABLE|OUTAGE|FAILURE|DOWN/i.test(i.currentState ?? ''));
      const first = active[0].externalInfo?.split('\n')[0]?.trim();
      return {
        level: major ? 'major' : 'minor',
        message: active.length === 1 && first ? first.slice(0, 200)
          : `${active.length} aktive Meldung${active.length === 1 ? '' : 'en'}`,
        incidents: active.map((i) => `${i.serviceInfoDto?.name ?? 'DATEV'}: ${STATE[i.currentState] ?? i.currentState}`),
      };
    }
    const maint = maintenances.filter((m) =>
      Date.parse(m.startDate) <= now && Date.parse(m.endDate) > now &&
      (m.affectedServicesInfo ?? []).some((a) => match(a.name)));
    if (maint.length) {
      return {
        level: 'maintenance',
        message: 'Wartung läuft',
        incidents: maint.flatMap((m) => (m.affectedServicesInfo ?? []).map((a) => `${a.name}: Wartung`)),
      };
    }
    return { level: 'ok', message: 'Keine Störungen', incidents: [] };
  },

  // DocuWare Cloud: Status je Funktion (Login, Suche, Workflow …) für eine Region
  async docuware(svc, opts) {
    const data = await getJson(svc.url, opts);
    const items = data?.[svc.region ?? 'emea'];
    if (!Array.isArray(items)) throw new Error(`Region ${svc.region} nicht gefunden`);
    const bad = items.filter((i) => (i.status ?? '').toLowerCase() !== 'operational');
    if (!bad.length) return { level: 'ok', message: `Alle ${items.length} Funktionen in Betrieb`, incidents: [] };
    const st = (i) => (i.status ?? '').toLowerCase();
    const level = bad.some((i) => /outage|down|unavailable/.test(st(i))) ? 'major'
      : bad.every((i) => /maint/.test(st(i))) ? 'maintenance' : 'minor';
    return {
      level,
      message: `${bad.length} von ${items.length} Funktionen betroffen`,
      incidents: bad.map((i) => `${i.component?.text ?? i.component?.value ?? 'DocuWare'}: ${i.status}`),
    };
  },

  // Nur im Worker: offizielle M365 Service Health deines Tenants (braucht App-Registrierung).
  async m365graph(svc, opts) {
    const env = opts.env ?? {};
    const { M365_TENANT_ID: tenant, M365_CLIENT_ID: cid, M365_CLIENT_SECRET: secret } = env;
    if (!tenant || !cid || !secret) return { level: 'unknown', message: 'M365-Zugangsdaten fehlen', incidents: [] };
    const f = opts.fetchImpl ?? fetch;
    const tok = await f(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cid, client_secret: secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }).toString(),
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error('Token-Fehler: ' + (tok.error_description ?? tok.error));
    const d = await getJson(
      "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$filter=isResolved eq false&$top=50",
      { ...opts, headers: { Authorization: `Bearer ${tok.access_token}` } },
    );
    const issues = d.value ?? [];
    const incidents = issues.filter((i) => i.classification === 'incident');
    return {
      level: incidents.length ? 'major' : issues.length ? 'minor' : 'ok',
      message: issues.length ? `${incidents.length} Vorfall/Vorfälle, ${issues.length - incidents.length} Hinweis(e)` : 'Keine offenen Meldungen',
      incidents: issues.map((i) => `${i.service}: ${i.title}`),
    };
  },
};

// ───────────────────────── Statusseiten & Verlauf ─────────────────────────

/** Menschenlesbare Statusseite je Dienst (für den Knopf „Statusseite öffnen“). */
const STATUS_PAGES = {
  'm365-outlook': 'https://status.cloud.microsoft/',
  'm365-teams': 'https://status.cloud.microsoft/',
  'm365-tenant': 'https://admin.microsoft.com/Adminportal/Home#/servicehealth',
  azure: 'https://azure.status.microsoft/de-de/status',
  'google-workspace': 'https://www.google.com/appsstatus/dashboard/',
  slack: 'https://slack-status.com/',
  datev: 'https://www.datev-status.de/',
  docuware: 'https://status.docuware.cloud/',
  // Ohne offizielle Statusseite: Nutzer-Meldungen bei Allestörungen (allestörungen.de)
  youtube: 'https://xn--allestrungen-9ib.de/stoerung/youtube/',
  netflix: 'https://xn--allestrungen-9ib.de/stoerung/netflix/',
  spotify: 'https://xn--allestrungen-9ib.de/stoerung/spotify/',
  whatsapp: 'https://xn--allestrungen-9ib.de/stoerung/whatsapp/',
  instagram: 'https://xn--allestrungen-9ib.de/stoerung/instagram/',
  odav: 'https://www.odav.de/',
};

export function statusPageUrl(svc) {
  if (STATUS_PAGES[svc.id]) return STATUS_PAGES[svc.id];
  if (svc.kind === 'statuspage') return svc.url;
  return svc.url ?? null;
}

const impactLevel = (impact) =>
  impact === 'critical' || impact === 'major' ? 'major' : impact === 'maintenance' ? 'maintenance' : 'minor';

/**
 * Offizieller Störungsverlauf des Anbieters (sofern vorhanden), neueste zuerst.
 * Eintrag: { title, start, end (ISO oder null = läuft), level }.
 * Gibt null zurück, wenn der Anbieter keinen Verlauf anbietet.
 */
const historyFetchers = {
  async statuspage(svc, opts) {
    const d = await getJson(svc.url.replace(/\/$/, '') + '/api/v2/incidents.json', opts);
    return (d.incidents ?? []).map((i) => ({
      title: i.name,
      start: i.started_at ?? i.created_at,
      end: i.resolved_at ?? (i.status === 'resolved' || i.status === 'postmortem' ? i.updated_at : null),
      level: impactLevel(i.impact),
    }));
  },
  async google(svc, opts) {
    const list = await getJson(svc.url, opts);
    return list
      .filter((i) => !svc.product ||
        (i.affected_products ?? []).some((p) => p.title?.toLowerCase().includes(svc.product.toLowerCase())))
      .map((i) => ({
        title: `${i.service_name}: ${googleTitle(i.external_desc)}`.replace(/: $/, ''),
        start: i.begin,
        end: i.end ?? null,
        level: i.status_impact === 'SERVICE_OUTAGE' ? 'major' : 'minor',
      }));
  },
  async slack(svc, opts) {
    const list = await getJson(svc.url.replace(/current$/, 'history'), opts);
    return (Array.isArray(list) ? list : []).map((i) => ({
      title: i.title,
      start: i.date_created,
      end: i.status === 'resolved' || i.status === 'completed' ? i.date_updated : null,
      level: i.type === 'outage' ? 'major' : i.type === 'notice' ? 'maintenance' : 'minor',
    }));
  },
  async datev(svc, opts) {
    // DATEV liefert den Verlauf nur für die letzten 3 Tage (Schnittstellen-Grenze) –
    // länger laufende Störungen kommen zusätzlich aus der Liste der aktuellen Meldungen.
    const base = svc.url.replace(/\/$/, '');
    const [recent, current] = await Promise.all([
      getJson(`${base}/incidents?lastDays=3`, opts),
      getJson(`${base}/incidents`, opts).catch(() => []),
    ]);
    const byId = new Map([...current, ...recent].map((i) => [i.id ?? `${i.serviceInfoDto?.name}|${i.startDate}`, i]));
    return [...byId.values()].map((i) => ({
      title: i.serviceInfoDto?.name ?? 'DATEV',
      start: i.startDate,
      end: i.endDate ?? null,
      level: /NOT_AVAILABLE|UNAVAILABLE|OUTAGE|FAILURE|DOWN/i.test(i.worstState ?? '') ? 'major' : 'minor',
    }));
  },
};

/** Wie viele Tage der offizielle Verlauf höchstens abdeckt (sonst: so weit er reicht). */
const HISTORY_DAYS = { datev: 3 };

/** Erste inhaltliche Zeile aus Googles Markdown-Text („**Summary:**\nText …“). */
function googleTitle(desc = '') {
  return desc.split('\n').map((l) => l.trim())
    .find((l) => l && !/^\*\*[^*]+:\*\*$/.test(l))?.replace(/\*\*/g, '').slice(0, 140) ?? '';
}

/**
 * Offizieller Verlauf: { entries, coversDays } – coversDays = null heißt „unbegrenzt/so weit geliefert“.
 * null, wenn der Anbieter keinen Verlauf anbietet.
 */
export async function fetchHistory(svc, opts = {}) {
  const fn = historyFetchers[svc.kind];
  if (!fn) return null;
  const items = await fn(svc, opts);
  const entries = items
    .filter((i) => i.start && !Number.isNaN(Date.parse(i.start)))
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  return { entries, coversDays: HISTORY_DAYS[svc.kind] ?? null };
}

/**
 * Fasst einen Verlauf zu 30 Tagesbalken zusammen (ältester zuerst).
 * Jeder Tag bekommt die schlimmste Stufe, die an dem Tag aktiv war, sonst 'ok'.
 * Tage vor `since` (Beginn der Aufzeichnung) bekommen null = keine Daten.
 */
export function dailyBars(history, { days = 30, now = Date.now(), since = null } = {}) {
  const order = { major: 3, minor: 2, maintenance: 1, ok: 0 };
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const bars = [];
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = new Date(startOfToday); dayStart.setDate(dayStart.getDate() - d);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    if (since && dayEnd.getTime() <= Date.parse(since)) { bars.push(null); continue; }
    let worst = 'ok';
    for (const h of history) {
      const s = Date.parse(h.start); const e = h.end ? Date.parse(h.end) : now;
      if (s < dayEnd.getTime() && e >= dayStart.getTime() && order[h.level] > order[worst]) worst = h.level;
    }
    bars.push(worst);
  }
  return bars;
}

/**
 * Kalendertage seit dem Ende der letzten Störung (Wartungen zählen nicht):
 * 0 = heute beendet oder läuft noch, 1 = gestern beendet … null = keine bekannt.
 */
export function daysWithoutIncident(history, now = Date.now()) {
  const incidents = history.filter((h) => h.level !== 'maintenance');
  if (incidents.some((h) => !h.end)) return 0;
  const lastEnd = Math.max(...incidents.map((h) => Date.parse(h.end)));
  if (!Number.isFinite(lastEnd)) return null;
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  return Math.round((day(now) - day(lastEnd)) / 86400000);
}

/** Prüft einen Dienst. Wirft nie – Fehler werden zu level 'unknown'. */
export async function checkService(svc, opts = {}) {
  const fn = checkers[svc.kind];
  const base = { id: svc.id, name: svc.name, checkedAt: new Date().toISOString() };
  if (!fn) return { ...base, level: 'unknown', message: `Unbekannter Typ ${svc.kind}`, incidents: [] };
  try {
    return { ...base, ...(await fn(svc, opts)) };
  } catch (e) {
    return { ...base, level: 'unknown', message: `Abruf fehlgeschlagen: ${e.message}`, incidents: [] };
  }
}

const BAD = new Set(['minor', 'major']);

/**
 * Vergleicht neue Ergebnisse mit gespeichertem Zustand.
 * state: { [id]: { level, pending, streak, seen } }  → gibt { state, changes } zurück.
 * - 'unknown' (Abruf kaputt) ändert nichts, damit es keinen Fehlalarm gibt.
 * - Bleibt ein Dienst gestört, aber es kommen neue Einzelmeldungen dazu,
 *   gibt es eine eigene Änderung mit `fresh` (z. B. neue DATEV-Störung).
 */
export function diffResults(services, results, prevState = {}) {
  const state = { ...prevState };
  const changes = [];
  for (const res of results) {
    const svc = services.find((s) => s.id === res.id);
    const prev = state[res.id] ?? { level: 'ok', streak: 0 };
    if (res.level === 'unknown') continue;
    const seen = res.incidents.slice(0, 50);
    if (res.level === prev.level) {
      // Vor dem ersten Lauf mit dieser Logik gibt es noch kein `seen` → nichts melden.
      const fresh = BAD.has(res.level) && Array.isArray(prev.seen)
        ? res.incidents.filter((i) => !prev.seen.includes(i))
        : [];
      state[res.id] = { level: prev.level, streak: 0, seen };
      if (fresh.length) changes.push({ result: res, from: prev.level, to: res.level, fresh });
      continue;
    }
    const streak = prev.pending === res.level ? (prev.streak ?? 0) + 1 : 1;
    if (streak < confirmRuns(svc)) {
      state[res.id] = { level: prev.level, pending: res.level, streak, seen: prev.seen };
      continue;
    }
    state[res.id] = { level: res.level, streak: 0, seen };
    // Nur melden, wenn Störung beginnt, sich ändert oder endet (Wartung ↔ OK leise).
    if (BAD.has(res.level) || BAD.has(prev.level)) changes.push({ result: res, from: prev.level, to: res.level });
  }
  return { state, changes };
}

export function formatChange({ result, from, to, fresh }) {
  if (fresh?.length) {
    const title = `⚠️ ${result.name}: neue Meldung`;
    return { title, body: fresh.slice(0, 3).join('\n'), recovered: false, from, to };
  }
  const recovered = !BAD.has(to);
  const title = !recovered ? `⚠️ ${result.name}: ${LEVEL_LABEL[to]}`
    : to === 'maintenance' ? `🔧 ${result.name}: Störung beendet, Wartung läuft`
    : `✅ ${result.name}: wieder OK`;
  const body = [result.message, ...result.incidents.slice(0, 3)].filter(Boolean).join('\n');
  return { title, body, recovered, from, to };
}
