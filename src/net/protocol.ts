/**
 * Nachrichten zwischen Host und Mitspielern.
 *
 * Alle Nachrichten sind JSON-Objekte mit Feld `t` (wie in der Technik-Vorlage, Kap. 5).
 * Der Host rechnet das Spiel (autoritativer Host), Mitspieler schicken nur Befehle.
 *
 * „Zähler statt Knopf“ (Vorlage Kap. 5 und 10): Jeder Befehl trägt einen Zähler `seq`.
 * Der Host führt ihn nur aus, wenn `seq` größer ist als der zuletzt gesehene Wert dieses
 * Spielers. So geht nichts verloren und nichts passiert doppelt, auch wenn ein Befehl
 * wiederholt wird. Laufen ist dagegen ein Zustand (`walk`) und wird alle 250 ms wiederholt.
 */
import type { Settings } from '../config/settings';
import { BRANCHES, type Branch } from '../game/careers';
import type { Snapshot } from '../game/types';

/** Protokollversion. Mitspieler mit anderer Version werden abgewiesen. */
export const PROTOCOL = 1;

export interface LobbyPlayer {
  id: string;
  name: string;
  /** Hof 0–3. */
  team: number;
  color: string;
  /** Kam während einer Runde dazu: schaut zu, spielt ab der nächsten Runde mit. */
  waiting: boolean;
}

/** Einzelne Spielbefehle während einer Runde. */
export type Command =
  | { k: 'select'; cow: string }
  | { k: 'branch'; cow: string; branch: Branch }
  /** Aktion auslösen. Im Prototyp beendet sie den Zug (Geschossflug folgt in Schritt 3). */
  | { k: 'fire'; weapon: string; aim: number; pitch: number; power: number }
  | { k: 'end' };

export interface ChatLine {
  id: string;
  name: string;
  color: string;
  text: string;
  ts: number;
}

export type ClientMessage =
  | { t: 'join'; name: string; pw: string; v: number }
  | { t: 'cmd'; seq: number; cmd: Command }
  /** Laufrichtung als Zustand: [x, z] in Weltkoordinaten, je −1 bis 1, [0, 0] = stehen. */
  | { t: 'walk'; dir: [number, number] }
  | { t: 'team'; team: number }
  | { t: 'chat'; text: string }
  | { t: 'rename'; name: string };

export type RejectReason = 'passwort' | 'voll' | 'version' | 'zeit';

export type HostMessage =
  | { t: 'welcome'; id: string }
  | { t: 'reject'; reason: RejectReason }
  | {
      t: 'lobby';
      players: LobbyPlayer[];
      phase: Snapshot['phase'];
      settings: Settings;
      roomName: string;
      /** Rundensiege pro Hof in dieser Sitzung. */
      wins: number[];
    }
  /** Spielstand. `ctrl` = Spieler, der den aktuellen Zug steuert. */
  | { t: 'state'; s: Snapshot; ctrl: string | null }
  | ({ t: 'chat' } & ChatLine)
  | { t: 'chatlog'; list: ChatLine[] }
  | { t: 'closed'; reason: string };

export const MAX_PLAYERS = 8;
export const MAX_TEAMS = 4;
export const MAX_CHAT = 200;
export const MAX_NAME = 16;
export const CHAT_HISTORY = 50;
export const CHAT_FOR_NEW = 20;

export const REJECT_TEXT: Record<RejectReason, string> = {
  passwort: 'Falsches Passwort.',
  voll: 'Der Raum ist voll.',
  version: 'Der Gastgeber hat eine andere Spielversion. Bitte beide die Seite neu laden.',
  zeit: 'Keine Antwort vom Gastgeber.',
};

/** Name säubern: Leerraum zusammenfassen, Länge begrenzen, nie leer. */
export function cleanName(name: unknown, fallback = 'Kuhhirte'): string {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  return s || fallback;
}

/**
 * Prüft eine Nachricht eines Mitspielers. Alles von außen ist unsicher,
 * darum nur bekannte Formen durchlassen.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  switch (m.t) {
    case 'join':
      return typeof m.pw === 'string' && num(m.v) ? { t: 'join', name: cleanName(m.name), pw: m.pw, v: m.v as number } : null;
    case 'walk': {
      const d = m.dir;
      if (!Array.isArray(d) || d.length !== 2 || !d.every(num)) return null;
      // Richtung in Weltkoordinaten (der Mitspieler rechnet die Kamera schon heraus).
      const c = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
      return { t: 'walk', dir: [c(d[0] as number), c(d[1] as number)] };
    }
    case 'team':
      return num(m.team) ? { t: 'team', team: m.team as number } : null;
    case 'chat':
      return typeof m.text === 'string' ? { t: 'chat', text: m.text } : null;
    case 'rename':
      return { t: 'rename', name: cleanName(m.name) };
    case 'cmd': {
      if (!num(m.seq) || !m.cmd || typeof m.cmd !== 'object') return null;
      const c = m.cmd as Record<string, unknown>;
      const seq = m.seq as number;
      if (c.k === 'select' && typeof c.cow === 'string') return { t: 'cmd', seq, cmd: { k: 'select', cow: c.cow } };
      if (c.k === 'branch' && typeof c.cow === 'string' && (BRANCHES as readonly string[]).includes(c.branch as string))
        return { t: 'cmd', seq, cmd: { k: 'branch', cow: c.cow, branch: c.branch as Branch } };
      if (c.k === 'end') return { t: 'cmd', seq, cmd: { k: 'end' } };
      if (c.k === 'fire' && typeof c.weapon === 'string' && num(c.aim) && num(c.pitch) && num(c.power))
        return {
          t: 'cmd',
          seq,
          cmd: {
            k: 'fire',
            weapon: c.weapon,
            aim: c.aim as number,
            pitch: c.pitch as number,
            power: Math.max(0, Math.min(1, c.power as number)),
          },
        };
      return null;
    }
    default:
      return null;
  }
}
