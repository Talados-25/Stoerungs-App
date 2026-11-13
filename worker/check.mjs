// Läuft per GitHub Actions alle ~10 Min, prüft die Dienste und schickt bei
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
for (const c of changes) {
  const n = formatChange(c);
  // Header müssen ASCII sein → Titel per RFC 2047 kodieren
  const title = `=?UTF-8?B?${Buffer.from(n.title).toString('base64')}?=`;
  const res = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    body: n.body || n.title,
    // Kein Tags-Header: das Emoji steht schon im Titel (sonst doppelt)
    headers: { Title: title, Priority: n.recovered ? 'default' : 'high' },
  });
  console.log(`ntfy → ${n.title}: HTTP ${res.status}`);
}
await writeFile(statePath, JSON.stringify(state, null, 2));
