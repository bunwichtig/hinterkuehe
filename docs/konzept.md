# Hinterkühe – Spielkonzept

Stand: 17.11.2026, Version 0.1 (Entwurf)

Hinterkühe ist ein rundenbasiertes Artillerie-Taktikspiel für den Browser. Zwei bis vier Teams aus Kühen stehen sich auf einer zerstörbaren Weide gegenüber. Wer am Zug ist, läuft mit einer Kuh, zielt, liest den Wind und feuert. Gespielt wird online mit Freunden, ohne Installation und ohne Konto.

> **Eigenständigkeit:** Hinterkühe gehört zum Genre der rundenbasierten Artillerie-Spiele, übernimmt aber von keinem bestehenden Spiel Namen, Figuren, Grafik, Musik, Karten oder Aussehen. Alle Figuren, Waffen und Karten hier sind eigene Erfindungen.

---

## Inhalt

1. [Grundidee und Ton](#1-grundidee-und-ton)
2. [Teams und Kühe](#2-teams-und-kühe)
3. [Zugablauf](#3-zugablauf)
4. [Steuerung](#4-steuerung)
5. [Waffen und Werkzeuge](#5-waffen-und-werkzeuge)
6. [Gelände und Physik](#6-gelände-und-physik)
7. [Karten](#7-karten)
8. [Kisten](#8-kisten)
9. [Rundenende und Hochwasser](#9-rundenende-und-hochwasser)
10. [Lobby und Online-Spiel](#10-lobby-und-online-spiel)
11. [Einstellungen](#11-einstellungen)
12. [Grafik und Ton](#12-grafik-und-ton)
13. [Technik in Kürze](#13-technik-in-kürze)
14. [Fahrplan](#14-fahrplan)
15. [Offene Fragen](#15-offene-fragen)

---

## 1. Grundidee und Ton

- **Kurze Runden, große Wirkung:** Eine Runde dauert 5 bis 15 Minuten. Jeder Zug ist kurz (Standard 45 s), damit Wartende nicht einschlafen.
- **Bauernhof-Humor statt Krieg:** Die Kühe verteidigen ihre Weide. Geschosse sind Heuballen, Milchkannen und Kuhglocken. Getroffene Kühe fallen nicht tot um, sondern „gehen in den Stall“ (Rauchwölkchen, Muhen, weg).
- **Taktik vor Tempo:** Zielen mit Winkel und Kraft, Wind, Gelände formen. Wer gut plant, gewinnt, nicht wer am schnellsten klickt.
- **Für Handy und PC:** Alles mit Maus/Tastatur und mit Touch bedienbar.

## 2. Teams und Kühe

- **2 bis 4 Teams**, jedes Team hat **1 bis 6 Kühe** (Standard 4). Insgesamt höchstens 16 Kühe auf dem Feld.
- **Mehrere Menschen pro Team** sind möglich: Sie steuern ihre Kühe abwechselnd.
- Jede Kuh hat **Lebenspunkte** (Standard 100), einen Namen (Berta, Elsa, Frieda …) und trägt ein **Halsband in Teamfarbe**.

**Teams (Rassen) und Farben:**

| Team | Farbe | Aussehen |
|---|---|---|
| Fleckvieh | Rot-Orange | weiß mit rotbraunen Flecken |
| Braunvieh | Braun | einfarbig braun, helle Schnauze |
| Schwarzbunte | Blau | weiß mit schwarzen Flecken |
| Hochlandrinder | Gelb | zottelig, lange Hörner |

Rassen sind nur Aussehen, sie spielen sich gleich. So bleibt das Spiel fair und leicht zu lernen. (Klassen mit eigenen Fähigkeiten sind eine mögliche Erweiterung, siehe Kap. 15.)

## 3. Zugablauf

Eine Runde besteht aus Zügen. Die Teams sind reihum dran, innerhalb eines Teams wechselt die Kuh jedes Mal (Kuh 1, Kuh 2, …, dann wieder Kuh 1).

```
Zug beginnt ──▶ [turn] Laufen, Springen, Zielen, Waffe wählen  (Zugzeit, Standard 45 s)
                    │ Schuss
                    ▼
               [retreat] Rückzugszeit: nur noch laufen/springen   (Standard 3 s)
                    │
                    ▼
               [settle] Geschosse fliegen aus, Gelände rutscht, Schaden wird gezählt
                    │
                    ▼
               nächstes Team ──▶ oder [roundEnd], wenn nur noch ein Team steht
```

- **Ein Schuss pro Zug.** Werkzeuge wie das Lasso beenden den Zug nicht (Kap. 5).
- **Zeit abgelaufen ohne Schuss:** Der Zug endet sofort, ohne Rückzugszeit.
- **Wind** wird zu jedem Zug neu ausgewürfelt und als Pfeil oben angezeigt.
- **Schaden wird gesammelt** und erst in der Phase `settle` als schwebende Zahlen gezeigt. So sieht jeder, was der Zug gebracht hat.
- **Wer verlässt das Spiel?** Seine Kühe bleiben stehen und werden übersprungen (der Zug dauert dann 0 s). Kommt er zurück, übernimmt er sie wieder.

## 4. Steuerung

| Aktion | PC | Handy |
|---|---|---|
| Laufen | ← → oder A D | Knöpfe ◀ ▶ |
| Springen | Eingabe / W | Knopf ⤒ |
| Zielen (Winkel) | ↑ ↓ | Ziehen am Zielkreis |
| Kraft und Schuss | Leertaste halten, loslassen | Feuerknopf halten, loslassen |
| Waffe wählen | Zahlen 1–9 oder Mausrad | Waffenleiste antippen |
| Kamera | Maus an den Rand / Ziehen mit rechter Taste | Wischen mit zwei Fingern |

Während man **nicht dran** ist, kann man frei die Kamera bewegen und chatten.

## 5. Waffen und Werkzeuge

Waffen sind in **Waffensätze** gruppiert, die der Host in der Lobby wählt. Munition ist pro Team und Runde begrenzt (∞ = unbegrenzt).

| Waffe | Art | Wirkung | Wind | Munition | Satz |
|---|---|---|---|---|---|
| **Heuballen-Schleuder** | Bogenschuss | Explodiert beim Aufprall, mittlerer Krater, 45 Schaden in der Mitte | ja | ∞ | alle |
| **Milchkanne** | Wurf mit Zünder (1–5 s) | Springt vom Boden ab, explodiert nach Zünderzeit, 50 Schaden | nein | 3 | alle |
| **Kuhglocke** | Nahkampf | Schallwelle direkt vor der Kuh, 30 Schaden, schleudert weit weg | nein | 2 | Standard, Chaos |
| **Mistgabel-Wurf** | gerader Schuss | Fliegt fast gerade, kleiner Krater, 25 Schaden, durchschlägt dünne Wände | nein | ∞ | Standard |
| **Butterfass** | Bogenschuss | Zerplatzt in 5 kleine Butterbrocken, je 15 Schaden | ja | 1 | Standard, Chaos |
| **Güllefass** | abgestellt | Läuft den Hang hinunter, wer drin steht, verliert 5 Punkte pro Zug (3 Züge) | nein | 1 | Chaos |
| **Weidezaun** | Werkzeug | Setzt ein kurzes Stück Zaun als Deckung (zerstörbar) | – | 2 | Standard |
| **Lasso** | Werkzeug | Schwingt die Kuh an einen Punkt im Gelände, Zug endet nicht | – | 3 | alle |
| **Strohsack** | Werkzeug | Fallschirm-Ersatz: Kuh gleitet langsam, kein Fallschaden | – | 2 | alle |
| **Futterabwurf** | Luftschlag | Ein Traktor-Anhänger kippt 4 Heuballen über einer Zielstelle ab | teils | 1 (nur aus Kisten) | Chaos |
| **Zug aussetzen** | – | Beendet den Zug sofort | – | ∞ | alle |

**Waffensätze:**

- **Standard:** ausgewogen, alle Waffen außer Güllefass und Futterabwurf.
- **Nur Wurf:** Heuballen-Schleuder, Milchkanne und die Werkzeuge. Für Zielübungen.
- **Chaos:** alles, doppelte Munition, mehr Kisten.

**Schaden** fällt von der Mitte der Explosion nach außen linear auf 0 ab. Getroffene Kühe werden weggeschleudert, ein Sturz aus großer Höhe kostet zusätzlich Punkte (abschaltbar).

## 6. Gelände und Physik

- **Zerstörbar:** Jede Explosion schneidet einen runden Krater ins Gelände. Gelände darüber rutscht nach.
- **Ausbaustufen:**
  1. *Gerüst (jetzt):* Höhenprofil (eine Bodenhöhe pro Pixelspalte). Einfach, schnell, klein im Netz.
  2. *Prototyp:* Bitmaske (Pixel fest/leer) für Höhlen, Brücken und Überhänge. Übertragen wird nur der Seed der Karte plus die Liste der Krater, nicht die Pixel.
- **Physik** läuft nur beim Host mit fester Schrittweite (60 Schritte pro Sekunde). Geschosse: Schwerkraft + Wind. Kühe: rutschen an steilen Hängen, fallen ins Wasser (Kap. 9).
- **Rand:** Links und rechts ist die Welt durch Wasser begrenzt. Wer hineinfällt, ist aus der Runde.

## 7. Karten

Karten werden aus einem **Seed** erzeugt. Gleicher Seed = gleiche Karte, so lassen sich gute Karten weitergeben. Jedes Thema hat eigene Farben, Formen und Deko.

| Karte | Gelände | Besonderheit |
|---|---|---|
| **Alm** | sanfte Hügel, Wiese, Holzzäune | Standardkarte, wenig Hindernisse |
| **Kornfeld** | flach mit Heuhaufen und Silo | Silo als hoher Turm in der Mitte |
| **Steinbruch** | steile Kanten, Felsplateaus | Felsen sind härter (kleinere Krater) |
| **Gletscher** | Eis und Schneeberge | Eis ist rutschig, Kühe gleiten nach |
| **Zufall** | eine der obigen | wird zu jeder Runde neu gewählt |

Später möglich: eigene Karten aus einem Bild (schwarz = Boden, weiß = Luft).

## 8. Kisten

Mit eingestellter Wahrscheinlichkeit fällt zu Beginn eines Zugs eine Kiste vom Himmel (am Fallschirm).

- **Futterkiste:** heilt die Kuh, die sie berührt, um 25 Punkte.
- **Werkzeugkiste:** eine zufällige Waffe mit 1 Schuss (auch Futterabwurf).
- **Schreck-Kiste:** explodiert bei Berührung (selten).

## 9. Rundenende und Hochwasser

- Eine Runde endet, wenn **höchstens ein Team** noch Kühe hat. Dieses Team gewinnt die Runde (bei 0 Teams: Unentschieden).
- **Hochwasser (Sudden Death):** Nach der eingestellten Zeit (Standard 15 min, abschaltbar) werden alle Kühe auf **1 Lebenspunkt** gesetzt, und nach jedem Zug steigt das Wasser ein Stück. So endet jede Runde sicher.
- **Endlos-Runden** wie in der Technik-Vorlage: Jeder Rundensieg zählt in der Rangliste. Erst „Zur Lobby“ setzt die Siege der Sitzung zurück.

## 10. Lobby und Online-Spiel

Ablauf wie in der Technik-Vorlage (`spiel-technik-und-optionen.md`, Kap. 4 und 13):

1. **Startseite:** Name, Raumname, Passwort. Knöpfe „Raum erstellen“ und „Beitreten“, Zufallsvorschläge für Namen und Räume, Einladungslink.
2. **Lobby:** Spielerliste nach Teams sortiert. Jeder kann sein Team wählen (Teamknöpfe), der Host kann Spieler verschieben. Chat. Nur der Host sieht die Einstellungen änderbar, alle anderen sehen sie ausgegraut.
3. **Start:** Der Host startet, sobald mindestens zwei Teams besetzt sind.
4. **Im Spiel:** Chat bleibt offen. Wer später kommt, schaut zu und spielt ab der nächsten Runde mit.
5. **Ende:** Geht der Host, ist der Raum für alle zu. Geht ein Mitspieler, bleiben seine Kühe stehen (Kap. 3).

**Teilnehmer:** bis zu 8 Menschen pro Raum, 2 bis 4 Teams. Allein mit zwei Teams zum Üben ist erlaubt (man steuert beide abwechselnd).

## 11. Einstellungen

Gleiches Muster wie in der Technik-Vorlage (Kap. 7). Code: `src/config/settings.ts`.

```
Formular ──▶ cleanSettings() ──▶ settings ──rulesFor()──▶ rules (nur diese liest die Spiellogik)
```

Zwei Modi:

- **Klassisch:** feste, ausgewogene Werte (in der Tabelle mit ★ markiert). Nur Teamgröße und Karte sind wählbar.
- **Individuell:** alles frei.

| Schlüssel | Bedeutung | Werte | Standard |
|---|---|---|---|
| `mode` | Modus | klassisch, individuell | klassisch |
| `teamSize` | Kühe pro Team | 1–6 | 4 |
| `hp` | Lebenspunkte | 50–200 (25er-Schritte) | 100 ★ |
| `turnTime` | Zugzeit in s | 15–90 (5er-Schritte) | 45 ★ |
| `retreatTime` | Rückzugszeit in s | 0–10 | 3 ★ |
| `wind` | Windstärke | aus, leicht, normal, stark | normal ★ |
| `map` | Karte | zufall, alm, kornfeld, steinbruch, gletscher | zufall |
| `crates` | Kisten | aus, wenig, normal, viel | normal ★ |
| `weapons` | Waffensatz | standard, nur-wurf, chaos | standard ★ |
| `fallDamage` | Fallschaden | an, aus | an ★ |
| `floodAfter` | Hochwasser nach Minuten | 0 (aus)–30 | 15 ★ |

**Pro Gerät** (nicht vom Host, nicht übertragen): Ton an/aus, Steuerungsart am Handy, Chat-Popup. Gespeichert im Browser mit Präfix `hk-`.

> Die Verbindungs- und Einstellungsschicht wird im nächsten Schritt nach `spiel-technik-und-optionen.md` gebaut. Die Struktur oben ist so angelegt, dass sie dort direkt eingesetzt werden kann.

## 12. Grafik und Ton

- **Grafik:** komplett auf ein Canvas gezeichnet, aus einfachen Formen. Keine Bilddateien nötig. Eigener, freundlicher Comic-Stil: runde Kühe mit Flecken, Halsband in Teamfarbe, Himmel mit Verlauf, Gras als Kante auf braunem Boden.
- **Kamera:** folgt der aktiven Kuh und dem Geschoss. Zoom am Handy mit zwei Fingern.
- **HUD:** oben Wind und Restzeit, unten Waffenleiste, über jeder Kuh Name und Lebenspunkte in Teamfarbe.
- **Ton:** mit der Web Audio API erzeugt (keine Dateien): Muhen (tiefer Ton mit Tonhöhenabfall), Glockenklang, Platsch beim Wasser, dumpfer Knall bei Explosionen. Ton-Auslöser werden aus Unterschieden zwischen zwei Schnappschüssen abgeleitet.

## 13. Technik in Kürze

| Teil | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript | Fehler früh finden, Nachrichten sauber typisiert |
| Build | Vite | schneller Entwicklungsserver, kleine Ausgabe für GitHub Pages |
| Verbindung | PeerJS (WebRTC) | **kein eigener Server**, wie in der Technik-Vorlage |
| Spielrechnung | autoritativer Host | Host rechnet, andere schicken nur Befehle und zeigen an |
| Takt | 60 Schritte/s, Versand bei Änderung bzw. 20/s während Flugphasen | rundenbasiert braucht weniger Daten als Echtzeit |
| Zufall | eigener Seed-Generator | Karten und Wind reproduzierbar |
| Tests | Vitest | Spiellogik und Einstellungen ohne Browser testbar |
| Veröffentlichung | GitHub Actions → GitHub Pages | wie in der Vorlage |

**Kennungen** (`src/config/ids.ts`): PeerJS-Präfix `hinterkuehe-v1-`, Hash-Salz `hinterkuehe|`, Speicher-Präfix `hk-`. Damit landet niemand in fremden Räumen anderer Spiele auf derselben Domain.

**Ordner:**

```
src/config/   Kennungen, Einstellungen, Speicher
src/net/      Raumname/Passwort, Nachrichten-Protokoll, Transport-Schnittstellen
src/game/     Spiellogik (nur beim Host): Game, Gelände, Zufall, Typen
src/ui/       Zeichnen auf Canvas
tests/        Vitest-Tests
docs/         dieses Konzept
```

## 14. Fahrplan

1. **Gerüst und Konzept** (dieser Stand): Projekt, Tests, Einstellungs-Muster, Spielschleife mit Zugwechsel, Kartenvorschau.
2. **Verbindung und Einstellungen:** Transport mit PeerJS und `?local`, Räume mit Passwort, Lobby mit Teams, Chat, Einstellungsformular. Grundlage: `spiel-technik-und-optionen.md`.
3. **Spielbarer Prototyp für 2 Spieler:** Laufen, Springen, Zielen, Heuballen-Schleuder und Milchkanne, Krater, Schaden, Rundenende.
4. **Ausbau:** restliche Waffen, Kisten, Hochwasser, Kartenthemen, Ton, Handy-Steuerung, Rangliste.

## 15. Offene Fragen

- **Klassen mit Fähigkeiten?** Z. B. ein starker Bulle mit mehr Lebenspunkten oder eine Kuh, die heilen kann. Macht das Spiel taktischer, aber schwerer zu lernen.
- **Zugreihenfolge der Kühe:** fest reihum (jetzt) oder frei wählbar (Taste „nächste Kuh“)?
- **Zuschauer-Chat** während des Spiels für alle sichtbar oder nur im eigenen Team?
- **Bildschirmformat am Handy:** Querformat erzwingen oder auch Hochformat unterstützen?
