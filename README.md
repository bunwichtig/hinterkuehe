# Hinterkühe

Rundenbasiertes 3D-Taktikspiel im Browser: Höfe schicken ihre Kühe auf die Hinterweide. Pro Zug eine Kuh wählen, mit der Ausdauer laufen, dann schießen, werfen, heilen oder Minen legen. Kühe sammeln Erfahrung und werden in vier Laufbahnen befördert. Online mit Freunden, ohne Installation und ohne eigenen Server.

- **Spielkonzept:** [docs/konzept.md](docs/konzept.md)
- **Stand:** Version 0.4.0: voll spielbar. Online (PeerJS, Lobby, Chat, Einladungslink) oder am selben Gerät. Zielen mit Neigung und Kraft, Wind, Krater, Schaden, Rückstoß, alle 19 Waffen und Hilfsmittel, Beförderung in vier Laufbahnen, Bunker, Minen, Zäune, Kisten, Hochwasser, fünf Kartenthemen, Ton und Effekte.

## Loslegen

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver, http://localhost:5173
npm run check      # Typprüfung, Lint und Tests
npm run build      # fertige Seite in dist/
```

Zum Testen mehrerer Spieler auf einem Rechner ohne Internet: `http://localhost:5173/?local` in mehreren Tabs öffnen (Verbindung über `BroadcastChannel` statt PeerJS). Im ersten Tab „Raum erstellen“, den Einladungslink im zweiten Tab öffnen.

## So läuft ein Online-Spiel

1. Raum erstellen: Name, Raumname und Passwort eintragen (🎲 würfelt Vorschläge). Dein Browser wird Gastgeber.
2. Einladungslink kopieren oder teilen. Wer ihn öffnet, ist sofort im Raum (das Passwort steht als Hex hinter dem `#` und geht nie an einen Server). Alternativ Raumname und Passwort von Hand eintragen und „Beitreten“.
3. In der Lobby wählt jeder seinen Hof (bis zu 4 Höfe, bis zu 8 Spieler). Der Gastgeber stellt die Regeln ein und startet, sobald zwei Höfe besetzt sind.
4. Spielen mehrere Menschen in einem Hof, steuern sie die Züge abwechselnd. Wer später kommt, schaut zu und spielt ab der nächsten Runde mit.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/config/` | Kennungen (`ids.ts`), Einstellungen (`settings.ts`), Browser-Speicher |
| `src/net/` | Verbindung: Protokoll, Host-Sitzung (`host.ts`, rechnet das Spiel), Mitspieler-Sitzung (`client.ts`), Transporte PeerJS (`peer.ts`) und `?local` (`local.ts`), Einladungslink |
| `src/game/` | Spiellogik (läuft nur beim Host): Zugablauf, Laufbahnen, Waffen, Gelände, Zufall |
| `src/ui/` | 3D-Darstellung mit Three.js, Einstellungsformular |
| `tests/` | Tests mit Vitest |

Technik nach der Vorlage *spiel-technik-und-optionen.md*: PeerJS (WebRTC) mit autoritativem Host, Einstellungen über `DEFAULT_SETTINGS → cleanSettings → rulesFor → rules`.

## Veröffentlichen

Jeder Push auf `main` baut die Seite und veröffentlicht sie auf GitHub Pages. Einmalig nötig: *Settings → Pages → Source: „GitHub Actions“*.

## Lizenz

MIT
