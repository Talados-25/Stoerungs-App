# Roadmap & offene Punkte

Hier steht, was geplant, entschieden oder noch offen ist – damit nichts verloren geht,
auch wenn ein Chat endet oder neu beginnt. **Keine persönlichen Daten hier eintragen**
(Repository ist öffentlich): keine MAC-Adressen, IPs, Zugangsdaten, IDs.

## Geplant (später, sobald Zeit ist)

### Widget „PC starten“ (Wake-on-LAN + AnyDesk)
Homescreen-Widget, das den Windows-PC über die FRITZ!Box weckt und danach AnyDesk öffnet.

- **Ablauf:** Widget = nur ein Knopf mit Deep Link `stoerungsmelder://wol` (kein App Group,
  keine Intents → funktioniert mit kostenloser Apple-ID). Die App schickt per **TR-064** an die
  FRITZ!Box `X_AVM-DE_WakeOnLANByMACAddress` (Port 49000, `/upnp/control/hosts`) mit eigener
  **HTTP-Digest-Anmeldung** in TypeScript, zeigt einen Countdown (Standard 45 s) und öffnet AnyDesk.
- **Unterwegs:** über die WireGuard-App („Bei Bedarf“); die App selbst baut kein VPN auf.
  Ist die FRITZ!Box nicht erreichbar: Hinweis „Nicht im Heim-WLAN und WireGuard-VPN nicht verbunden?“.
- **Einstellungen nur auf dem Gerät** (Passwort im Schlüsselbund via expo-secure-store):
  FRITZ!Box-Adresse (Standard 192.168.178.1), MAC des PCs, Benutzer/Passwort, AnyDesk-ID,
  Wartezeit, Knopf „Jetzt testen“. ATS-Ausnahme `NSAllowsLocalNetworking` + `fritz.box`,
  `NSLocalNetworkUsageDescription`.
- **Bereits geprüft:**
  - Widget-Target per `@bacons/apple-targets` (v5) wird im bestehenden Prebuild erzeugt,
    Bundle-ID `com.stoerungsmelder.app.widget`, keine Zusatzberechtigungen.
  - AltStore: Erweiterung braucht eine eigene App-ID; mit AltStore + App + Widget sind die
    **3 App-Plätze** der kostenlosen Apple-ID voll.
  - AnyDesk hat auf iOS **kein offiziell dokumentiertes URL-Schema**. Plan: `anydesk:<ID>` →
    `anydesk://` → sonst App-Store-Seite; dazu Einstellungsfeld „AnyDesk-Link“ zum Testen.
- **Version:** v1.6.0

### Wake-on-LAN am PC – Stand
- Windows: Magic Packet, Shutdown-Wake-On-LAN und „darf wecken“ sind aktiv; Schnellstart ist aus;
  PC hängt per LAN-Kabel am Router.
- **Offen:** Praxistest über die FRITZ!Box-Oberfläche (*Heimnetz → Netzwerk →
  Netzwerkverbindungen → PC → Bearbeiten → „Computer starten“*). Falls er nicht startet:
  im BIOS „ErP/EuP“ aus und „Wake on LAN“ bzw. „Power On by PCI-E“ an.
- **Offen:** Prüfen, ob die FRITZ!Box bei MyFRITZ! angemeldet ist und HTTPS-Zugriff sowie
  der Benutzer-Zugriff aus dem Internet erlaubt sind (nur nötig für Wecken ohne VPN).
- Hinweis: AltStore/AltServer funktionieren **nicht über VPN** (Bonjour) – Updates nur im Heimnetz.

## Entschieden

- **100 % kostenlos:** kein Apple-Developer-Account, kein Pushover, kein Mac.
- **DATEV:** alle Bereiche bleiben überwacht (auch „Wissen“ wie Lernplattform/Videoportal).
- **Benachrichtigungen:** zuverlässig über ntfy; die eigenen Meldungen der App sind standardmäßig aus.

## Termine

- **11.02.2027:** Das GitHub-Token für cron-job.org läuft ab → vorher neues Fine-grained Token
  (nur dieses Repository, *Actions: Read and write*) erstellen und bei cron-job.org im
  `Authorization`-Header als `Bearer …` ersetzen. Danach Testlauf → 204.

## Ideen (noch nicht entschieden)

- Nur echte Ausfälle melden (Teilstörungen je Dienst ignorieren).
- Ruhezeiten: ntfy-Meldungen nachts leise.
- Prio-Modus über ntfy (höchste Stufe, kommt durch einen Fokus, nicht durch den Stummschalter).
- Feste Adresse für die AltStore-Quelle (keine Fehlermeldung während ein Build läuft).
