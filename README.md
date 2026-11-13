# Störungsmelder (Expo / iOS, ohne Mac)

Zeigt den Status von Diensten (Microsoft 365, YouTube, Google Workspace, GitHub, Discord, …)
und meldet Störungen per Benachrichtigung.

## Wichtig: Was Expo Go kann und was nicht

| | Expo Go | Cloud-Prüfer (ntfy) |
|---|---|---|
| Status-Übersicht in der App | ✅ | – |
| Benachrichtigung, während die App offen ist | ✅ (lokal) | ✅ |
| Benachrichtigung bei **geschlossener** App | ❌ (Apple/Expo-Go-Limit) | ✅ |
| Kosten | kostenlos | kostenlos |

Alternativ zu Expo Go kannst du die App auch als **eigene App** installieren – siehe unten.

Expo Go unterstützt auf iOS **keine Hintergrund-Tasks und keine Remote-Pushes**. Damit du
trotzdem gewarnt wirst, prüft ein kleines Skript per **GitHub Actions** alle ~10 Minuten
und schickt Pushes über die kostenlose App **ntfy** (App Store).

## 1. App starten (Windows/Linux, ohne Mac)

1. Node.js 20+ installieren, dann im Projektordner:
   ```bash
   npm install
   ```
   ```bash
   npx expo start --tunnel
   ```
2. **Expo Go** aus dem App Store installieren, QR-Code mit der iPhone-Kamera scannen.
3. Benachrichtigungen erlauben → „Dienste auswählen“.

## 2. Cloud-Prüfer einrichten (Pushes auch bei geschlossener App)

1. **ntfy** aus dem App Store installieren, „+“ → Thema abonnieren, z. B.
   `stoerung-<langer-zufallsname>` (der Name ist dein „Passwort“ – nicht erratbar wählen).
2. Dieses Projekt als **privates** GitHub-Repository hochladen.
3. Im Repo: *Settings → Secrets and variables → Actions → New secret*:
   `NTFY_TOPIC` = dein Themenname.
4. In der App „Cloud-Konfig teilen“ tippen, den Text in `worker/services.json` einfügen, committen.
5. *Actions → Störungs-Check → Run workflow* zum Testen. Danach läuft es automatisch.

### Zuverlässig alle 5 Minuten prüfen (cron-job.org)

GitHub startet zeitgesteuerte Läufe nur „nach Möglichkeit“ – oft nur etwa stündlich.
Ein Anstoß von außen wird dagegen sofort ausgeführt:

1. **GitHub-Token erstellen:** Profilbild → *Settings* → *Developer settings* →
   *Personal access tokens* → *Fine-grained tokens* → *Generate new token*
   - Name: `cron-job Störungsmelder`, Ablauf: so lang wie möglich
   - *Repository access*: **Only select repositories** → dieses Repository
   - *Permissions* → *Repository permissions* → **Actions: Read and write** (sonst nichts)
   - *Generate token* → Token kopieren (wird nur einmal angezeigt)
2. Auf **cron-job.org** kostenlos registrieren → *Create cronjob*
   - **URL:** `https://api.github.com/repos/<benutzer>/<repo>/actions/workflows/stoerungs-check.yml/dispatches`
     (`<benutzer>/<repo>` durch deins ersetzen)
   - **Zeitplan:** alle 5 Minuten
   - Reiter *Advanced*:
     - **Request method:** `POST`
     - **Headers:**
       - `Accept` = `application/vnd.github+json`
       - `Authorization` = `Bearer <dein Token>`
       - `X-GitHub-Api-Version` = `2022-11-28`
     - **Request body:** `{"ref":"main"}`
   - Speichern → *Test run*: Antwort **204** = alles richtig.
3. Unter *Actions* erscheinen jetzt alle 5 Minuten Läufe mit dem Auslöser „workflow_dispatch“.

Der GitHub-eigene Zeitplan bleibt als Reserve aktiv. Das Token läuft irgendwann ab –
GitHub schickt vorher eine E-Mail; dann neues Token erstellen und bei cron-job.org eintragen.

## Welche Quellen werden genutzt?

- **Offizielle Statusseiten** (Statuspage.io-API): GitHub, Discord, Reddit, Cloudflare, Dropbox,
  Zoom, Atlassian, Notion, Claude; dazu Slack, Google Workspace (offizielles JSON), Azure (RSS).
- **Erreichbarkeit** (antwortet die Seite?): YouTube, Outlook, Teams, Netflix, Spotify, WhatsApp,
  Instagram. YouTube & Co. haben keine öffentliche Status-API; diese Prüfung erkennt nur
  komplette Ausfälle, keine Teilstörungen. Es braucht 2 Fehlschläge in Folge, bevor gemeldet wird.
- **Microsoft 365 (eigener Tenant)** – nur im Cloud-Prüfer und nur, wenn du Admin eines
  M365-Tenants bist: App-Registrierung in Entra ID mit Anwendungsberechtigung
  `ServiceHealth.Read.All` (Admin-Zustimmung erteilen), dann Secrets `M365_TENANT_ID`,
  `M365_CLIENT_ID`, `M365_CLIENT_SECRET` setzen und `"m365-tenant"` in `worker/services.json`.
- **Eigene Dienste**: in der App per URL hinzufügen (Erreichbarkeit oder Statuspage.io-Seite).

## Als eigene App installieren (ohne Expo Go, ohne Mac)

GitHub baut die App auf einem Mac-Rechner in der Cloud (Workflow „iOS-App bauen (IPA)“).
Du signierst sie mit deiner kostenlosen Apple-ID und installierst sie per **AltStore**.

**Einmalig einrichten**

1. Auf dem Windows-PC **iTunes** und **iCloud** direkt von apple.com installieren
   (nicht die Microsoft-Store-Versionen), dann **AltServer** von altstore.io installieren.
2. AltServer starten (Symbol unten rechts in der Taskleiste) → in den Einstellungen
   **„Mit Windows starten“** aktivieren.
3. iPhone per Kabel anschließen, in iTunes **„Mit diesem iPhone über WLAN synchronisieren“**
   aktivieren. AltServer-Symbol → *Install AltStore* → dein iPhone → mit Apple-ID anmelden.
4. Auf dem iPhone: *Einstellungen → Datenschutz & Sicherheit → Entwicklermodus* einschalten
   (Neustart), dann *Einstellungen → Allgemein → VPN & Geräteverwaltung* → deiner Apple-ID vertrauen.

**App installieren / aktualisieren**

1. Auf GitHub unter **Releases** die neueste `Stoerungsmelder-x.y.z.ipa` herunterladen
   (direkt auf dem iPhone in Safari → in „Dateien“ speichern).
2. In AltStore → *My Apps* → **„+“** → die IPA auswählen.

**Erneuern alle 7 Tage**

Mit kostenloser Apple-ID läuft die Signatur nach 7 Tagen ab. AltStore erneuert sie automatisch,
wenn dein PC mit laufendem AltServer im selben WLAN ist. Ist der PC alle paar Tage an, merkst du
davon nichts. Falls die App doch abgelaufen ist: AltStore öffnen → *Refresh All* (Daten bleiben erhalten).

Hinweise: Eine kostenlose Apple-ID erlaubt 3 solcher Apps gleichzeitig (AltStore zählt mit).
In der installierten App läuft zusätzlich eine Hintergrund-Prüfung; wie oft, entscheidet iOS.
Zuverlässige Warnungen kommen weiterhin über ntfy.

## Projektaufbau

- `App.tsx` – Oberfläche
- `src/monitor.ts` – Prüfen, Speichern, lokale Benachrichtigungen
- `shared/checks.js` – Prüf-Logik (von App **und** Cloud-Prüfer genutzt)
- `worker/check.mjs`, `.github/workflows/stoerungs-check.yml` – Cloud-Prüfer
- `.github/workflows/ios-ipa.yml` – baut die IPA (manuell oder bei jedem Release)

## Versionierung

[Semantic Versioning](https://semver.org/lang/de/) – `MAJOR.MINOR.PATCH`:

- **PATCH** (1.0.**1**): Fehlerbehebung, z. B. eine Statusquelle repariert
- **MINOR** (1.**1**.0): neue Funktion, z. B. neuer Dienst im Katalog
- **MAJOR** (**2**.0.0): inkompatible Änderung, z. B. neues Format von `worker/services.json`

Neue Version veröffentlichen:

1. Änderungen unter `[Unreleased]` in `CHANGELOG.md` in einen neuen Versionsabschnitt verschieben.
2. Version hochzählen (setzt `package.json`, Commit und Git-Tag):
   ```bash
   npm version minor
   ```
3. Hochladen inklusive Tag:
   ```bash
   git push --follow-tags
   ```

`app.json` übernimmt die Version automatisch (Skript `version` in `package.json`).
Wird auf GitHub ein Release veröffentlicht, baut GitHub automatisch die passende IPA und hängt sie an.
Commit-Nachrichten folgen [Conventional Commits](https://www.conventionalcommits.org/de/) (`feat:`, `fix:`, `docs:` …).
