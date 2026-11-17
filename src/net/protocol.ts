/**
 * Nachrichten zwischen Host und Mitspielern.
 *
 * Alle Nachrichten sind JSON-Objekte mit Feld `t` (wie in der Technik-Vorlage, Kap. 5).
 * Der Host rechnet das Spiel (autoritativer Host), Mitspieler schicken nur Befehle.
 *
 * Aktionen werden als Zähler `seq` geschickt („Zähler statt Knopf“): Der Host führt
 * eine Aktion nur aus, wenn `seq` größer ist als der zuletzt gesehene Wert. So geht
 * nichts verloren und nichts passiert doppelt, auch wenn Nachrichten wiederholt werden.
 *
 * Stand: Gerüst. Wird in Schritt 2 (Verbindung und Einstellungen) vervollständigt.
 */
import type { Settings } from '../config/settings';
import type { Snapshot } from '../game/types';

export interface LobbyPlayer {
  id: string;
  name: string;
  team: number;
  color: string;
  waiting?: boolean;
}

/** Steuerung während des eigenen Zugs. */
export interface TurnInput {
  /** Laufen: -1 links, 0 stehen, 1 rechts (Zustand, wird wiederholt). */
  walk: -1 | 0 | 1;
  /** Zielwinkel in Grad, 0 = rechts, 90 = oben. */
  aim: number;
  /** Zähler: Sprung. */
  jump: number;
  /** Zähler: Waffe abfeuern; `power` 0–1 gilt für diesen Schuss. */
  fire: number;
  power: number;
  /** Gewählte Waffe (Schlüssel aus der Waffenliste). */
  weapon: string;
}

export type ClientMessage =
  | { t: 'join'; name: string; pw: string }
  | { t: 'input'; input: TurnInput }
  | { t: 'team'; team: number }
  | { t: 'chat'; text: string }
  | { t: 'rename'; name: string };

export type HostMessage =
  | { t: 'welcome'; id: string }
  | { t: 'reject'; reason: 'passwort' | 'voll' | 'version' }
  | { t: 'lobby'; players: LobbyPlayer[]; phase: Snapshot['phase']; settings: Settings; roomName: string }
  | ({ t: 'state' } & Snapshot)
  | { t: 'chat'; id: string; name: string; color: string; text: string; ts: number }
  | { t: 'chatlog'; list: { id: string; name: string; color: string; text: string; ts: number }[] };

export const MAX_PLAYERS = 8;
export const MAX_CHAT = 200;
export const MAX_NAME = 24;
