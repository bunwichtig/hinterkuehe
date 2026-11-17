# Hinterkühe

Rundenbasiertes 3D-Taktikspiel im Browser: Höfe schicken ihre Kühe auf die Hinterweide. Pro Zug eine Kuh wählen, mit der Ausdauer laufen, dann schießen, werfen, heilen oder Minen legen. Kühe sammeln Erfahrung und werden in vier Laufbahnen befördert. Online mit Freunden, ohne Installation und ohne eigenen Server.

- **Spielkonzept:** [docs/konzept.md](docs/konzept.md)
- **Stand:** Gerüst mit 3D-Vorschau (Version 0.2.0). Online-Verbindung und spielbarer Prototyp folgen.

## Loslegen

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver, http://localhost:5173
npm run check      # Typprüfung, Lint und Tests
npm run build      # fertige Seite in dist/
```

Zum Testen mehrerer Spieler auf einem Rechner (sobald die Verbindung steht): `http://localhost:5173/?local` in mehreren Tabs öffnen.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/config/` | Kennungen (`ids.ts`), Einstellungen (`settings.ts`), Browser-Speicher |
| `src/net/` | Raumname und Passwort-Hash, Nachrichten-Protokoll, Transport-Schnittstellen |
| `src/game/` | Spiellogik (läuft nur beim Host): Zugablauf, Laufbahnen, Waffen, Gelände, Zufall |
| `src/ui/` | 3D-Darstellung mit Three.js |
| `tests/` | Tests mit Vitest |

Technik nach der Vorlage *spiel-technik-und-optionen.md*: PeerJS (WebRTC) mit autoritativem Host, Einstellungen über `DEFAULT_SETTINGS → cleanSettings → rulesFor → rules`.

## Veröffentlichen

Jeder Push auf `main` baut die Seite und veröffentlicht sie auf GitHub Pages. Einmalig nötig: *Settings → Pages → Source: „GitHub Actions“*.

## Lizenz

MIT
