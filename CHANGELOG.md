# Changelog

Alle wichtigen Änderungen an diesem Projekt. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionen nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Behoben
- Erreichbarkeits-Check folgt keinen Weiterleitungen mehr (Fehlalarm bei Outlook), Fehlerursache wird genauer protokolliert.
- GitHub Actions auf Node-24-Versionen aktualisiert.
- Zustand wird auch bei „Re-run“ gespeichert (vorher doppelte Meldungen möglich).
- Doppeltes Warn-Emoji in ntfy-Nachrichten entfernt.

### Geändert
- Reserve-Zeitplan auf ungerade 5-Minuten-Takte; Anleitung für zuverlässigen 5-Minuten-Takt über cron-job.org.

## [1.0.0] – 2026-11-13

### Hinzugefügt
- Expo-App (iOS über Expo Go): Status-Übersicht, Dienst-Auswahl, eigene Dienste per URL.
- Lokale Benachrichtigungen bei Störung und Entwarnung, Prüfung alle 2 Minuten bei geöffneter App.
- Prüfquellen: Statuspage.io (GitHub, Discord, Reddit, Cloudflare, Dropbox, Zoom, Atlassian, Notion, Claude),
  Slack, Google Workspace, Azure (RSS), Erreichbarkeits-Checks (YouTube, Outlook, Teams u. a.).
- Cloud-Prüfer über GitHub Actions mit Push-Nachrichten per ntfy, optional M365 Service Health (Graph API).
- Hintergrund-Prüfung für eigene Builds (nicht in Expo Go verfügbar).
- IPA-Build über GitHub Actions (macOS) zum Installieren per AltStore/Sideloadly, IPA wird an Releases angehängt.

[Unreleased]: https://github.com/Talados-25/Stoerungs-App/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Talados-25/Stoerungs-App/releases/tag/v1.0.0
