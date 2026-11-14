// Läuft per GitHub Actions (alle ~5 Min über cron-job.org), prüft die Dienste und schickt bei
// Änderungen eine Push-Nachricht über ntfy (https://ntfy.sh) an dein iPhone.
import { readFile, writeFile } from 'node:fs/promises';
import { resolveServices, checkService, diffResults, formatChange } from '../shared/checks.js';

const dir = new URL('.', import.meta.url);
const topic = process.env.NTFY_TOPIC;
const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
if (!topic) throw new Error('Secret NTFY_TOPIC fehlt');

const services = resolveServices(JSON.parse(await readFile(new URL('services.json', dir), 'utf8')));
const statePath = new URL('state.json', dir);
const prev = await readFile(statePath, 'utf8').then(JSON.parse).catch(() => ({}));

const results = await Promise.all(services.map((s) => checkService(s, { env: process.env })));
for (const r of results) console.log(`${r.level.padEnd(11)} ${r.name} – ${r.message}`);

const { state, changes } = diffResults(services, results, prev);
// Tippen auf die Nachricht (oder den Knopf) öffnet die Störungsmelder-App auf dem iPhone.
const APP_URL = process.env.APP_URL || 'stoerungsmelder://';

for (const c of changes) {
  const n = formatChange(c);
  // Veröffentlichen als JSON: erlaubt Umlaute/Emojis ohne Header-Kodierung und Aktionen.
  const res = await fetch(server, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic,
      title: n.title,
      message: n.body || n.title,
      priority: n.recovered ? 3 : 4, // 3 = normal, 4 = hoch
      click: APP_URL,
      actions: [{ action: 'view', label: 'Störungsmelder öffnen', url: APP_URL, clear: true }],
    }),
  });
  console.log(`ntfy → ${n.title}: HTTP ${res.status}`);
}
await writeFile(statePath, JSON.stringify(state, null, 2));
