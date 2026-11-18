# Hinterkühe – Spielkonzept

Stand: 18.11.2026, Version 0.4 (spielbar; ersetzt das 2D-Konzept 0.1)

Hinterkühe ist ein rundenbasiertes **3D-Taktikspiel** für den Browser. Rivalisierende Höfe schicken ihre Kühe auf die Hinterweide, um sie für sich zu gewinnen. Wer am Zug ist, wählt eine seiner Kühe, läuft mit ihr über das Gelände, solange die Ausdauer reicht, und setzt dann eine Aktion ein: schießen, werfen, heilen, Minen legen. Kühe sammeln Erfahrung und werden in eigene Laufbahnen befördert. Gespielt wird online mit Freunden, ohne Installation und ohne Konto.

> **Vorbild und Eigenständigkeit:** Die Spielweise orientiert sich am Genre der rundenbasierten 3D-Artillerie-Taktik, wie es *Frontschweine* (2000) geprägt hat: Teams aus Tieren, freie Wahl der Figur pro Zug, Ausdauer zum Laufen, Klassen mit Beförderung, Bunker auf einer 3D-Landschaft. Hinterkühe übernimmt diese **Mechaniken**, aber keine Namen, Figuren, Texte, Grafiken, Musik, Karten oder Aussehen. Alle Klassen, Waffen, Karten und Figuren hier sind eigene Erfindungen.

---

## Inhalt

1. [Grundidee und Ton](#1-grundidee-und-ton)
2. [Höfe und Kühe](#2-höfe-und-kühe)
3. [Zugablauf](#3-zugablauf)
4. [Laufbahnen und Beförderung](#4-laufbahnen-und-beförderung)
5. [Waffen und Hilfsmittel](#5-waffen-und-hilfsmittel)
6. [Schlachtfeld in 3D](#6-schlachtfeld-in-3d)
7. [Karten](#7-karten)
8. [Kisten](#8-kisten)
9. [Sieg, Rundenende und Hochwasser](#9-sieg-rundenende-und-hochwasser)
10. [Spielarten](#10-spielarten)
11. [Lobby und Online-Spiel](#11-lobby-und-online-spiel)
12. [Einstellungen](#12-einstellungen)
13. [Steuerung](#13-steuerung)
14. [Grafik und Ton](#14-grafik-und-ton)
15. [Technik in Kürze](#15-technik-in-kürze)
16. [Fahrplan](#16-fahrplan)
17. [Offene Fragen](#17-offene-fragen)

---

## 1. Grundidee und Ton

- **Taktik in 3D:** Hügel, Senken, Wasser, Bäume und Bunker bestimmen, wo man sicher steht und von wo man trifft.
- **Jede Kuh zählt:** Kühe überleben von Runde zu Runde (im Feldzug), sammeln Erfahrung und werden befördert. Eine erfahrene Donnerkuh zu verlieren tut weh.
- **Bauernhof-Humor:** Die Höfe streiten um Gras, nicht um Länder. Geschosse sind Heuballen, Milchkannen und Kürbisse. Getroffene Kühe fallen nicht tot um, sondern „gehen heim in den Stall“ (Rauchwolke, beleidigtes Muhen, weg).
- **Kurze Züge:** Standard 60 s pro Zug, damit niemand lange wartet.

## 2. Höfe und Kühe

- **2 bis 4 Höfe** (Teams), jeder mit **2 bis 6 Kühen** (Standard 4).
- **Mehrere Menschen pro Hof** sind möglich: Sie wechseln sich Zug für Zug ab.
- Jede Kuh hat **Lebenspunkte** (Standard 100), **Ausdauer**, eine **Laufbahn mit Rang**, **Erfahrung** und einen Namen.

| Hof | Farbe | Rasse (Aussehen) | Wappen |
|---|---|---|---|
| Lindenhof | Rot | Fleckvieh, weiß mit rotbraunen Flecken | Lindenblatt |
| Moorhof | Blau | Schwarzbunte | Wassertropfen |
| Bergerhof | Gelb | Hochlandrind, zottelig, lange Hörner | Berggipfel |
| Eichhof | Grün | Braunvieh | Eichel |

Die Rassen unterscheiden sich nur im Aussehen. Unterschiede im Spiel kommen allein aus den Laufbahnen (Kap. 4).

## 3. Zugablauf

Die Höfe sind reihum dran. **In jedem Zug wählt der Spieler frei eine seiner Kühe aus.** Jede Kuh darf aber erst wieder, wenn alle anderen lebenden Kühe des Hofs einmal dran waren (so kann man nicht immer mit der besten Kuh spielen).

```
Zug beginnt ──▶ Kuh wählen (Kamera fährt zu ihr)
                    │
                    ▼
               [move] Laufen und Springen, kostet Ausdauer      Zugzeit läuft (Standard 60 s)
                    │  Aktion wählen
                    ▼
               [aim] Zielen: Richtung, Neigung, Kraft (Wind beachten)
                    │  auslösen
                    ▼
               [resolve] Geschoss fliegt, Krater, Schaden, Rückstoß, Fallschaden
                    │
                    ▼
               nächster Hof ──▶ oder Sieg, wenn nur noch ein Hof Kühe hat
```

- **Ausdauer:** Jede Kuh hat pro Zug eine feste Menge (je nach Laufbahn, Kap. 4). Laufen bergauf kostet mehr, bergab weniger, Springen kostet einen festen Betrag. Ist die Ausdauer leer, bleibt die Kuh stehen, kann aber noch zielen.
- **Eine Aktion pro Zug:** Schießen, Werfen, Heilen, Mine legen usw. Danach ist der Zug vorbei.
- **Ohne Aktion beenden:** Knopf „Zug beenden“. Wer nichts tut, bekommt einen kleinen Ausdauer-Bonus im nächsten Zug dieser Kuh (+20 %).
- **Zeit abgelaufen:** Der Zug endet sofort.
- **Wind** wird zu jedem Zug neu ausgewürfelt (Richtung und Stärke, Anzeige als Windfahne). Er wirkt auf Bogenwaffen.
- **Bunker:** Steht eine Kuh in einem Bunker, kann sie nur aus der Schießscharte feuern, ist aber gegen Bogenwaffen geschützt (Kap. 6).
- **Wer das Spiel verlässt:** Seine Kühe bleiben stehen und werden übersprungen. Kommt er zurück, übernimmt er sie wieder.

## 4. Laufbahnen und Beförderung

Jede Kuh beginnt als **Jungrind**. Mit Erfahrung steigt sie auf. Bei der ersten Beförderung wählt der Spieler eine von vier **Laufbahnen**, danach geht es in dieser Laufbahn weiter nach oben.

**Erfahrung (EP)** gibt es für:

| Ereignis | EP |
|---|---|
| Schaden an gegnerischer Kuh (je 10 Punkte) | 1 |
| Gegnerische Kuh heimgeschickt | 5 |
| Eigene Kuh geheilt (je 10 Punkte) | 1 |
| Kiste eingesammelt | 1 |
| Runde überlebt | 2 |

**Ränge:** Rang 1 ab 0 EP, Rang 2 ab 10 EP, Rang 3 ab 25 EP, Rang 4 ab 45 EP. Wer einen neuen Rang erreicht, wird **zu Beginn seines nächsten Zugs** befördert (kurze Einblendung), bekommt +10 maximale Lebenspunkte und neue Waffen.

```
                         ┌─▶ Schleuderkuh ──▶ Kanonierin ──▶ Donnerkuh        (Feuer)
                         ├─▶ Pionierin ─────▶ Zaunmeisterin ─▶ Sprengmeisterin (Technik)
Jungrind ──(10 EP)──────┼─▶ Melkerin ──────▶ Hofärztin ────▶ Kräuterkundige  (Pflege)
                         └─▶ Späherin ──────▶ Nachtkuh ─────▶ Schattenkuh     (Schleichen)
```

| Laufbahn | Stärke | Ausdauer | Lebenspunkte | Besonderheit |
|---|---|---|---|---|
| Jungrind | Allrounder, schwach | 100 | 100 | nur Grundwaffen |
| **Feuer** | große Krater, hoher Schaden | 80 (schwer bepackt) | +20 | schwere Bogenwaffen, Rang 4 ruft einen Heuballen-Hagel |
| **Technik** | Gelände und Fallen | 100 | ±0 | Minen, Zäune, sprengt Bunker, Rang 4 baut eigenen Unterstand |
| **Pflege** | heilen und stützen | 110 | ±0 | Heilen aus der Nähe, Rang 3 heilt in einem Umkreis, Rang 4 belebt eine heimgeschickte Kuh einmal pro Runde |
| **Schleichen** | weit laufen, präzise | 140 | −10 | Fernglas-Schuss (gerade, ohne Wind), Rang 3 tarnt sich für einen Zug (für Gegner unsichtbar) |

Einstellbar: **Beförderung aus** (alle bleiben Jungrind) oder **Startrang** höher setzen (z. B. alle fangen als Rang 2 an und wählen sofort eine Laufbahn).

## 5. Waffen und Hilfsmittel

Jede Kuh hat die Grundwaffen. Laufbahn und Rang schalten weitere frei. Munition ist pro Kuh und Runde begrenzt (∞ = unbegrenzt). Schaden fällt von der Mitte der Explosion nach außen auf 0 ab. Getroffene Kühe werden weggestoßen, ein tiefer Sturz kostet zusätzlich Punkte.

| Waffe | Wer (ab Rang) | Art | Schaden / Wirkung | Wind | Munition |
|---|---|---|---|---|---|
| **Hornstoß** | alle | Nahkampf | 20, stößt weit weg (gut, um Gegner ins Wasser zu schubsen) | – | ∞ |
| **Mistgabel** | alle | gerader Wurf, kurze Reichweite | 15 | nein | ∞ |
| **Milchkanne** | alle | Wurf mit Zünder 1–5 s, springt ab | 35, mittlerer Krater | nein | 2 |
| **Heuballen-Schleuder** | Feuer 2 | Bogenschuss | 40, mittlerer Krater | ja | 4 |
| **Kürbis-Mörser** | Feuer 3 | steiler Bogenschuss | 55, großer Krater | ja | 2 |
| **Heuballen-Hagel** | Feuer 4 | Luftschlag auf einen Punkt der Karte | 5 × 25 | ja | 1 |
| **Kuhfladen-Mine** | Technik 2 | ablegen, scharf ab nächstem Zug | 45 beim Betreten | – | 3 |
| **Weidezaun** | Technik 3 | Deckung aufstellen (zerstörbar, 60 LP) | – | – | 2 |
| **Sprengsack** | Technik 3 | ablegen, Zünder 3 Züge oder per Fernzünder | 70, sprengt Bunker | – | 1 |
| **Unterstand** | Technik 4 | baut einen kleinen Bunker an Ort und Stelle | – | – | 1 |
| **Melkschemel-Wurf** | Pflege 2 | kurzer Bogen | 15, betäubt (Gegner verliert halbe Ausdauer im nächsten Zug) | ja | 3 |
| **Heilkräuter** | Pflege 2 | eigene Kuh in Reichweite 4 m | +30 LP | – | 3 |
| **Kräuterdampf** | Pflege 3 | Umkreis 8 m um sich | +20 LP für alle eigenen | – | 1 |
| **Fernglas-Schuss** | Schleichen 2 | gerader Schuss, sehr weit | 35, bei Kopftreffer 60 | nein | 3 |
| **Glockenköder** | Schleichen 3 | wirft eine Kuhglocke, Gegner im Umkreis drehen sich weg und verlieren 20 Ausdauer | – | ja | 2 |
| **Kuhglocken-Ruf** | Pflege 4 | holt die zuletzt heimgegangene eigene Kuh mit 40 % LP zurück | – | – | 1 |
| **Fernzünder** | wer einen Sprengsack gelegt hat | zündet die eigenen Sprengsäcke sofort | – | – | ∞ |
| **Tarnung** | Schleichen 3 | für einen Zug unsichtbar, bis zur nächsten eigenen Aktion | – | – | 1 |
| **Zug beenden** | alle | – | +20 % Ausdauer beim nächsten Zug dieser Kuh | – | ∞ |

Aus Kisten (Kap. 8) gibt es zusätzlich Einzelschüsse höherer Waffen, auch für andere Laufbahnen.

## 6. Schlachtfeld in 3D

- **Gelände:** Höhenkarte (Raster, z. B. 128 × 128 Felder à 1 m) mit weichen Übergängen. Ringsum Wasser. Wer ins Wasser fällt, geht heim.
- **Zerstörbar:** Explosionen drücken runde Krater ins Gelände (Höhenkarte wird abgesenkt). Steile Kraterwände kann man nicht hochlaufen, aber hinunterrutschen.
- **Objekte:** Bäume (Deckung, fallen bei großem Schaden um), Felsen (unzerstörbar), Heuhaufen (brennen nicht, schlucken aber Schaden), Zäune.
- **Bunker:** kleine Gebäude aus Stein oder Holz mit Eingang und Schießscharte. Eine Kuh darin:
  - ist gegen Bogenwaffen von oben geschützt, nur gerade Schüsse durch die Scharte und Sprengsäcke treffen,
  - kann nur in Richtung der Scharte feuern,
  - Bunker haben Lebenspunkte (Holz 150, Stein 300) und stürzen bei 0 ein (Schaden an allen darin).
- **Physik** läuft nur beim Host mit fester Schrittweite (60 Schritte pro Sekunde): Schwerkraft, Wind, Abprallen, Rutschen an Hängen.
- **Sicht:** Alle sehen das ganze Feld (außer getarnten Kühen). Nebel des Krieges ist eine spätere Option.

## 7. Karten

Karten werden aus einem **Seed** und einem **Thema** erzeugt. Gleicher Seed = gleiche Karte, so lassen sich gute Karten weitergeben. Jedes Thema hat eigenes Gelände, Farben, Objekte und Bunkerstil.

| Karte | Gelände | Besonderheit |
|---|---|---|
| **Alm** | sanfte Hügel, viel Wiese, Holzbunker | Standard, ausgeglichen |
| **Moor** | flach, viele Wasserlöcher | Schlamm kostet doppelte Ausdauer |
| **Kornfeld** | flach mit Feldwegen, Heuhaufen, Silo | Silo als hoher Aussichtspunkt |
| **Steinbruch** | Terrassen, steile Kanten, Steinbunker | Fels bekommt kleinere Krater |
| **Winterweide** | Schneehügel, gefrorener See | Eis ist rutschig, Kühe gleiten nach |
| **Zufall** | eines der obigen | zu jeder Runde neu |

Später: **Karteneditor** im Browser (Höhen malen, Bunker setzen, als Code teilen).

## 8. Kisten

Zu Beginn jedes Zugs fällt mit eingestellter Wahrscheinlichkeit eine Kiste an einem Fallschirm aus Heu herab. Eine Kuh sammelt sie ein, indem sie darüber läuft.

- **Futterkiste:** +25 LP.
- **Waffenkiste:** ein Schuss einer zufälligen höheren Waffe, auch laufbahnfremd.
- **Ausdauerkiste:** volle Ausdauer für den Rest des Zugs.
- **Erfahrungskiste:** +5 EP.
- **Schreckkiste:** explodiert beim Berühren (selten).

## 9. Sieg, Rundenende und Hochwasser

- Eine Runde endet, wenn **höchstens ein Hof** noch Kühe auf dem Feld hat. Dieser Hof gewinnt (bei 0 Höfen: Unentschieden).
- **Hochwasser (Sudden Death):** Nach der eingestellten Zeit (Standard 20 min, abschaltbar) steigt nach jedem vollen Durchgang aller Höfe das Wasser um 1 m. Tief gelegene Kühe gehen heim, Bunker im Tal laufen voll.
- **Endlos-Gefechte** wie in der Technik-Vorlage: Jeder Rundensieg zählt in der Rangliste. Mit „Zur Lobby“ beginnt eine neue Sitzung.
- **Erfahrung über Runden:** Im Gefecht startet jede Runde wieder bei Jungrind (oder dem Startrang). Im Feldzug (Kap. 10) behalten Kühe Rang und Erfahrung.

## 10. Spielarten

| Spielart | Wer | Beschreibung | Wann |
|---|---|---|---|
| **Gefecht online** | 2–8 Menschen | Lobby, Höfe wählen, Endlos-Runden | Prototyp |
| **Am selben Gerät** | 2–4 Menschen | Höfe wechseln sich an einem Gerät ab, kein Netz nötig | Prototyp |
| **Gegen den Computer** | 1 Mensch | Computer-Höfe mit drei Stufen (Kälbchen, Stier, Leitkuh) | später |
| **Feldzug** | 1–2 Menschen | Folge von Gefechten auf eigenen Karten mit Geschichte um die Hinterweide. Kühe behalten Rang und Erfahrung, wer heimgeht, fehlt bis zur nächsten Etappe. | später |

## 11. Lobby und Online-Spiel

Ablauf nach der Technik-Vorlage (`spiel-technik-und-optionen.md`, Kap. 4 und 13):

1. **Startseite:** Name, Raumname, Passwort, „Raum erstellen“ und „Beitreten“, Zufallsvorschläge und Einladungslink.
2. **Lobby:** Spieler nach Höfen sortiert, jeder wählt seinen Hof, der Host kann Spieler verschieben. Chat. Nur der Host ändert Einstellungen, alle anderen sehen sie ausgegraut.
3. **Start:** sobald mindestens zwei Höfe besetzt sind.
4. **Im Spiel:** Chat bleibt offen. Wer später kommt, schaut zu und spielt ab der nächsten Runde mit.
5. **Ende:** Geht der Host, ist der Raum für alle zu.

**Umsetzung (0.3.0):**

| Teil | Datei | Was |
|---|---|---|
| Protokoll | `src/net/protocol.ts` | Nachrichten mit Feld `t`, Prüfung aller Mitspieler-Nachrichten (`parseClientMessage`) |
| Host | `src/net/host.ts` | nimmt Beitritte an (Passwort-Hash, Version, max. 8 Spieler, 10 s Zeitlimit), Lobby, Hofwahl, Chat, rechnet das Spiel mit 60 Hz, schickt den Spielstand höchstens 20-mal pro Sekunde und nur bei Änderung |
| Mitspieler | `src/net/client.ts` | schickt Befehle, wiederholt die Laufrichtung alle 250 ms, zeigt nur an, was der Host schickt |
| Transport | `src/net/peer.ts`, `src/net/local.ts` | PeerJS (Kennung `hinterkuehe-v1-<raum>`, 15 s Zeitlimit) und `?local` über BroadcastChannel |

**Züge:** Befehle (`select`, `branch`, `fire`, `end`) tragen einen Zähler und wirken nur einmal. Laufen ist ein Zustand (Richtung in Weltkoordinaten, relativ zur Kamera berechnet). Nur der Spieler, der den Zug steuert (`ctrl`), wird gehört. Mehrere Spieler eines Hofs wechseln sich ab. Ein Hof ohne anwesende Spieler wird übersprungen; bleibt nur ein besetzter Hof übrig, geht es zurück in die Lobby.

**Datenmenge:** Weil das Spiel rundenbasiert ist, schickt der Host Positionen nur, solange sich etwas bewegt (Kuh läuft, Geschoss fliegt), sonst nur bei Änderungen. Die Karte geht als Seed plus Kraterliste über das Netz, nicht als Höhenkarte.

## 12. Einstellungen

Gleiches Muster wie in der Technik-Vorlage (Kap. 7). Code: `src/config/settings.ts`.

```
Formular ──▶ cleanSettings() ──▶ settings ──rulesFor()──▶ rules (nur diese liest die Spiellogik)
```

- **Klassisch:** feste, ausgewogene Werte (★). Wählbar sind nur Kühe pro Hof und Karte.
- **Individuell:** alles frei.

| Schlüssel | Bedeutung | Werte | Standard |
|---|---|---|---|
| `mode` | Modus | klassisch, individuell | klassisch |
| `teamSize` | Kühe pro Hof | 2–6 | 4 |
| `hp` | Lebenspunkte Jungrind | 50–200 (25er-Schritte) | 100 ★ |
| `turnTime` | Zugzeit in s | 30–120 (10er-Schritte) | 60 ★ |
| `stamina` | Ausdauer in % | 50–200 (25er-Schritte) | 100 ★ |
| `wind` | Windstärke | aus, leicht, normal, stark | normal ★ |
| `map` | Karte | zufall, alm, moor, kornfeld, steinbruch, winterweide | zufall |
| `bunkers` | Bunker | keine, wenige, normal, viele | normal ★ |
| `crates` | Kisten | aus, wenig, normal, viel | normal ★ |
| `promotion` | Beförderung | an, aus | an ★ |
| `startRank` | Startrang | 1–4 | 1 ★ |
| `fallDamage` | Fallschaden | an, aus | an ★ |
| `floodAfter` | Hochwasser nach Minuten | 0 (aus)–40 (5er-Schritte) | 20 ★ |

**Pro Gerät** (nicht übertragen): Ton, Grafikqualität (niedrig/mittel/hoch), Kamera-Empfindlichkeit, Steuerungsart am Handy, Chat-Popup. Gespeichert mit Präfix `hk-`.

## 13. Steuerung

| Aktion | PC | Handy |
|---|---|---|
| Kuh wählen | Tab / Klick auf Kuh | Antippen der Kuh |
| Laufen | W A S D | linker Daumen-Stick |
| Springen | Leertaste | Knopf ⤒ |
| Kamera drehen | rechte Maustaste ziehen / Q E | Ziehen mit einem Finger auf freier Fläche |
| Zoom | Mausrad | zwei Finger |
| Waffe wählen | 1–9 / Waffenrad mit R | Waffenleiste unten |
| Zielen | Maus (Richtung und Neigung) | Ziehen am Zielkreis |
| Kraft und Auslösen | linke Maustaste halten, loslassen | Feuerknopf halten, loslassen |
| Übersicht | M | Knopf 🗺 |
| Zug beenden | Eingabe | Knopf ⏭ |

## 14. Grafik und Ton

- **Grafik:** 3D mit **Three.js**, eigener **Low-Poly-Stil**: kantige, freundliche Kühe aus wenigen Flächen, Fell-Flecken als Farbflächen, Halstuch in Hoffarbe, Rangabzeichen als kleine Glocke (Bronze, Silber, Gold, Kristall). Keine Bilddateien nötig, alles aus Grundformen erzeugt, damit die Seite klein bleibt.
- **Kamera:** folgt der aktiven Kuh von hinten, schwenkt beim Zielen über die Schulter, folgt dem Geschoss, zeigt den Einschlag.
- **HUD:** oben Hof am Zug, Zeit, Windfahne. Unten Waffenleiste, Ausdauer- und Lebensbalken der aktiven Kuh. Über jeder Kuh Name, Lebenspunkte und Rangglocke.
- **Ton:** Web Audio API ohne Dateien: Muhen (tiefer Ton mit Abfall), Glocken für Beförderung, dumpfe Explosionen, Platschen, Wind.
- **Leistung:** Ziel 60 Bilder pro Sekunde auf Mittelklasse-Handys. Stufe „niedrig“ ohne Schatten und mit gröberem Gelände.

## 15. Technik in Kürze

| Teil | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript | Fehler früh finden, Nachrichten sauber typisiert |
| Build | Vite | schneller Entwicklungsserver, kleine Ausgabe für GitHub Pages |
| 3D | Three.js | verbreitet, läuft im Browser und am Handy, keine Installation |
| Verbindung | PeerJS (WebRTC) | **kein eigener Server**, wie in der Technik-Vorlage |
| Spielrechnung | autoritativer Host | Host rechnet, andere schicken nur Befehle und zeigen an |
| Zufall | eigener Seed-Generator | Karten und Wind reproduzierbar |
| Tests | Vitest | Spiellogik und Einstellungen ohne Browser testbar |
| Veröffentlichung | GitHub Actions → GitHub Pages | wie in der Vorlage |

**Kennungen** (`src/config/ids.ts`): PeerJS-Präfix `hinterkuehe-v1-`, Hash-Salz `hinterkuehe|`, Speicher-Präfix `hk-`.

**Ordner:**

```
src/config/   Kennungen, Einstellungen, Speicher
src/net/      Raumname/Passwort, Nachrichten-Protokoll, Transport-Schnittstellen
src/game/     Spiellogik (nur beim Host): Game, Laufbahnen, Waffen, Gelände, Zufall
src/ui/       3D-Darstellung mit Three.js
tests/        Vitest-Tests
docs/         dieses Konzept
```

## 16. Fahrplan

1. **Gerüst und Konzept** (erledigt, 0.2.0): Laufbahnen, Waffenliste und Beförderung als Daten mit Tests, Zugablauf mit freier Kuhwahl, 3D-Kartenvorschau.
2. **Verbindung und Einstellungen** (erledigt, 0.3.0): PeerJS und `?local`, Räume mit Passwort, Einladungslink, Lobby mit Höfen, Chat, Einstellungsformular, Züge über den Host. Grundlage: `spiel-technik-und-optionen.md`. Details in Kap. 11.
3. **Spielbares Spiel** (erledigt, 0.4.0): Zielen mit Kamera, Neigung und Kraft, Geschossflug mit Schwerkraft und Wind, Krater in der Höhenkarte, Schaden mit Abfall, Rückstoß, Fallschaden, Rutschen, Wasser. Alle Waffen aus Kap. 5, Erfahrung und Beförderung, Bunker mit Scharte und Einsturz, Minen, Sprengsäcke, Zäune, Kisten, Hochwasser, fünf Kartenthemen, Sieg und Rundenende, Ton und Effekte ohne Dateien, Namensschilder, Zielhilfe. Online synchron und am selben Gerät spielbar. Details in Kap. 18.
4. **Ausbau:** Rangliste über Sitzungen, Handy-Daumenstick, Nebel des Krieges.
6. **Später:** Computergegner, Feldzug, Karteneditor.

## 17. Offene Fragen

- **Freie Kuhwahl oder feste Reihenfolge?** Jetzt: frei, aber jede Kuh erst wieder, wenn alle anderen dran waren.
- **Laufbahn wählen oder zufällig?** Jetzt: wählen bei der ersten Beförderung.
- **Erfahrung im Gefecht behalten?** Jetzt: nein, nur im Feldzug.
- **Nebel des Krieges** als Option?
- **Hochformat am Handy** unterstützen oder Querformat erzwingen?

## 18. Umsetzung des Spiels (0.4.0)

| Teil | Datei | Was |
|---|---|---|
| Spiellogik und Physik | `src/game/game.ts` | Zug, Aktionen, Geschosse (60 Hz, Unterschritte von 0,3 m), Explosionen, Kühe in der Luft, Minen, Kisten, Hochwasser, Schnappschuss |
| Waffen | `src/game/weapons.ts` | Werte je Waffe: Art, Schaden, Radius, Krater, Rückstoß, Geschwindigkeit, Reichweite |
| Kartenthemen | `src/game/terrain.ts` | Alm, Moor (Schlamm), Kornfeld, Steinbruch (Terrassen, kleinere Krater), Winterweide (rutschig) |
| Zielhilfe | `src/game/predict.ts` | erste 0,75 s der Flugbahn ohne Wind, Zielring, Ablageort |
| Anzeige | `src/ui/scene3d.ts` | Geschosse, Krater, Bunker, Zäune, Minen (nur eigene sichtbar), Kisten am Fallschirm, Partikel, Namensschilder |
| Ton | `src/ui/audio.ts` | Web Audio ohne Dateien |

**Regeln im Detail:**

- **Zielen:** Richtung = Blickrichtung der Kamera, Neigung −20° bis 85°, Kraft durch Halten (1,5 s bis voll). Gerade Schüsse brauchen keine Kraft.
- **Schaden** fällt vom Mittelpunkt linear auf 0 am Rand ab. Rückstoß wirft Kühe; Sturz über 4 m kostet 5 LP pro Meter. Wasser oder Kartenrand: die Kuh geht heim.
- **Bunker** schützen gegen alles außer geraden Schüssen durch die Scharte, Sprengsäcke und Explosionen im Inneren. Sie nehmen 60 % des Schadens (Sprengsack 350 %), bei 0 LP stürzen sie ein (30 Schaden an allen darin).
- **Ein Zug endet** nach der Aktion, sobald nichts mehr fliegt oder rollt (0,9 s Ruhe). Tarnung ist die Ausnahme: danach darf man noch laufen.
- **Netz:** Neue Befehle `fire` (mit Zünder) und `jump`, Zustand `aim` (höchstens alle 100 ms) für die Zielanzeige der Zuschauer. Ereignisse (Explosion, Platschen …) gehen nummeriert im Schnappschuss mit, jedes Gerät spielt nur neue ab. Protokollversion 2.
- **Am selben Gerät:** Startseite „Hier zusammen spielen“, 2–4 Höfe wechseln sich an einem Gerät ab, ohne Netz.
