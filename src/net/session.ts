/**
 * Gemeinsame Sicht von Host und Mitspieler auf eine Sitzung.
 *
 * Die Oberfläche arbeitet nur mit dieser Schnittstelle. Ob der eigene Browser
 * Host ist (rechnet das Spiel) oder Mitspieler (schickt Befehle), ist ihr egal.
 */
import type { Settings } from '../config/settings';
import type { ChatLine, ClientMessage, Command, HostMessage } from './protocol';

export type LobbyState = Extract<HostMessage, { t: 'lobby' }>;
export type GameState = Extract<HostMessage, { t: 'state' }>;

export interface SessionEvents {
  /** Lobby oder Spielstand hat sich geändert. */
  change: () => void;
  chat: (line: ChatLine) => void;
  /** Sitzung ist zu (Host weg, abgewiesen, Verbindung verloren). */
  closed: (reason: string) => void;
}

export abstract class Session {
  /** Eigene Spieler-ID ('host' beim Host). */
  me = '';
  lobby: LobbyState | null = null;
  state: GameState | null = null;
  chat: ChatLine[] = [];
  abstract readonly isHost: boolean;

  private seq = 0;
  private lastWalk: [number, number] = [0, 0];
  private listeners: { [K in keyof SessionEvents]: SessionEvents[K][] } = { change: [], chat: [], closed: [] };

  on<K extends keyof SessionEvents>(event: K, cb: SessionEvents[K]): () => void {
    this.listeners[event].push(cb);
    return () => {
      this.listeners[event] = this.listeners[event].filter((f) => f !== cb) as never;
    };
  }

  protected emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): void {
    for (const cb of this.listeners[event]) (cb as (...a: unknown[]) => void)(...args);
  }

  /** Nachricht an den Host (beim Host: direkt an sich selbst). */
  protected abstract post(msg: ClientMessage): void;

  /** Spielbefehl mit Zähler schicken („Zähler statt Knopf“). */
  command(cmd: Command): void {
    this.seq += 1;
    this.post({ t: 'cmd', seq: this.seq, cmd });
  }

  /** Laufrichtung setzen. Wird nur bei Änderung sofort geschickt, sonst regelmäßig wiederholt. */
  walk(dir: [number, number]): void {
    if (dir[0] === this.lastWalk[0] && dir[1] === this.lastWalk[1]) return;
    this.lastWalk = dir;
    this.post({ t: 'walk', dir });
  }

  /** Letzte Laufrichtung erneut schicken (Mitspieler: alle 250 ms). */
  protected repeatWalk(): void {
    this.post({ t: 'walk', dir: this.lastWalk });
  }

  setTeam(team: number): void {
    this.post({ t: 'team', team });
  }

  say(text: string): void {
    const t = text.trim();
    if (t) this.post({ t: 'chat', text: t });
  }

  rename(name: string): void {
    this.post({ t: 'rename', name });
  }

  /** Steuert der eigene Browser gerade den Zug? */
  get myTurn(): boolean {
    return !!this.state && this.state.ctrl === this.me;
  }

  abstract leave(): void;
}

/** Zusätzliche Möglichkeiten des Hosts. */
export interface HostControls {
  setSettings(raw: unknown): void;
  startGame(): string | null;
  toLobby(): void;
  movePlayer(id: string, team: number): void;
  readonly settings: Settings;
}
