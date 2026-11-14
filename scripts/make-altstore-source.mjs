// Erzeugt eine AltStore-Quelle (source.json) für das aktuelle Release.
// Wird im Workflow „iOS-App bauen (IPA)“ aufgerufen, nachdem die IPA gebaut wurde.
//
// Aufruf: node scripts/make-altstore-source.mjs <Info.plist als JSON> <IPA-Datei> <Ausgabe>
// Umgebungsvariablen: REPO (owner/name), TAG (z. B. v1.1.0), RELEASE_NOTES (optional)
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [plistPath, ipaPath, outPath] = process.argv.slice(2);
const { REPO, TAG, RELEASE_NOTES = '' } = process.env;
if (!plistPath || !ipaPath || !outPath || !REPO || !TAG) {
  console.error('Aufruf: REPO=… TAG=… node make-altstore-source.mjs <plist.json> <ipa> <out>');
  process.exit(1);
}

const info = JSON.parse(readFileSync(plistPath, 'utf8'));
const ipaName = basename(ipaPath);
const size = statSync(ipaPath).size;
const downloadURL = `https://github.com/${REPO}/releases/download/${TAG}/${encodeURIComponent(ipaName)}`;
const iconURL = `https://raw.githubusercontent.com/${REPO}/main/assets/icon.png`;
const date = new Date().toISOString();
const notes = RELEASE_NOTES.trim() || `Version ${info.CFBundleShortVersionString}`;

// AltStore 2 prüft, dass alle Datenschutz-Abfragen der App in der Quelle stehen.
const privacy = Object.fromEntries(
  Object.entries(info).filter(([k, v]) => /^NS\w+UsageDescription$/.test(k) && typeof v === 'string'),
);

const version = {
  version: info.CFBundleShortVersionString,
  buildVersion: String(info.CFBundleVersion),
  date,
  localizedDescription: notes,
  downloadURL,
  size,
  minOSVersion: info.MinimumOSVersion,
};

const source = {
  name: 'Störungsmelder',
  identifier: `io.github.${REPO.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`,
  subtitle: 'Eigene Quelle für den Störungsmelder',
  website: `https://github.com/${REPO}`,
  apps: [
    {
      name: info.CFBundleDisplayName ?? info.CFBundleName,
      bundleIdentifier: info.CFBundleIdentifier,
      developerName: REPO.split('/')[0],
      subtitle: 'Störungsmeldungen für deine Dienste',
      localizedDescription:
        'Zeigt den Status von Diensten wie Microsoft 365, YouTube, Google Workspace oder GitHub ' +
        'und meldet Störungen per Benachrichtigung.',
      iconURL,
      tintColor: '#0a66d8',
      versions: [version],
      // Ältere AltStore-Versionen lesen diese Felder direkt am App-Eintrag:
      version: version.version,
      versionDate: date,
      versionDescription: notes,
      downloadURL,
      size,
      appPermissions: { entitlements: [], privacy },
    },
  ],
  news: [],
};

writeFileSync(outPath, JSON.stringify(source, null, 2) + '\n');
console.log(`source.json für ${source.apps[0].name} ${version.version} (Build ${version.buildVersion}) erzeugt`);
