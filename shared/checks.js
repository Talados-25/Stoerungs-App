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
 * state: { [id]: { level, pending, streak } }  → gibt { state, changes } zurück.
 * 'unknown' (Abruf kaputt) ändert nichts, damit es keinen Fehlalarm gibt.
 */
export function diffResults(services, results, prevState = {}) {
  const state = { ...prevState };
  const changes = [];
  for (const res of results) {
    const svc = services.find((s) => s.id === res.id);
    const prev = state[res.id] ?? { level: 'ok', streak: 0 };
    if (res.level === 'unknown') continue;
    if (res.level === prev.level) {
      state[res.id] = { level: prev.level, streak: 0 };
      continue;
    }
    const streak = prev.pending === res.level ? (prev.streak ?? 0) + 1 : 1;
    if (streak < confirmRuns(svc)) {
      state[res.id] = { level: prev.level, pending: res.level, streak };
      continue;
    }
    state[res.id] = { level: res.level, streak: 0 };
    // Nur melden, wenn Störung beginnt, sich ändert oder endet (Wartung ↔ OK leise).
    if (BAD.has(res.level) || BAD.has(prev.level)) changes.push({ result: res, from: prev.level, to: res.level });
  }
  return { state, changes };
}

export function formatChange({ result, from, to }) {
  const recovered = !BAD.has(to);
  const title = recovered ? `✅ ${result.name}: wieder OK` : `⚠️ ${result.name}: ${LEVEL_LABEL[to]}`;
  const body = [result.message, ...result.incidents.slice(0, 3)].filter(Boolean).join('\n');
  return { title, body, recovered, from, to };
}
