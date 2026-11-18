/**
 * Host-Sitzung: der Browser, der den Raum erstellt hat.
 *
 * Er rechnet das ganze Spiel (autoritativer Host, Vorlage Kap. 1 und 6), nimmt
 * Beitritte an, prüft jeden Befehl und verteilt Lobby, Spielstand und Chat.
 * Die Zeit kommt von außen über `tick(dt)`, damit sich alles ohne Browser testen lässt.
 */
import { cleanSettings, rulesFor, type Settings } from '../config/settings';
import { Game, TEAM_STYLES } from '../game/game';
import { randInt } from '../game/rng';
import {
  CHAT_FOR_NEW,
  CHAT_HISTORY,
  MAX_CHAT,
  MAX_PLAYERS,
  MAX_TEAMS,
  PROTOCOL,
  cleanName,
  parseClientMessage,
  type ChatLine,
  type ClientMessage,
  type Command,
  type HostMessage,
  type LobbyPlayer,
} from './protocol';
import { Session, type HostControls } from './session';
import { JOIN_TIMEOUT_MS, type HostTransport } from './transport';

/** Feste Schrittweite der Simulation: 60 Hz. */
export const TICK = 1 / 60;
/** Spielstand höchstens alle 3 Schritte verschicken (20 Hz), und nur wenn er sich geändert hat. */
export const SEND_EVERY = 3;
/** Pause nach Rundenende, dann beginnt automatisch die nächste Runde. */
export const ROUND_END_MS = 4000;
export const HOST_ID = 'host';

export interface HostOptions {
  name: string;
  roomName: string;
  /** SHA-256 des Passworts (room.ts → hashPw). */
  pwHash: string;
  settings: unknown;
  transport: HostTransport;
  /** Wird bei jeder Einstellungsänderung aufgerufen (zum Speichern). */
  onSettings?: (s: Settings) => void;
  /** Zufall für Seeds und Spieler-IDs; in Tests fest. */
  random?: () => number;
  /**
   * „Am selben Gerät“: so viele Höfe (2–4) spielen abwechselnd an diesem Gerät.
   * Für jeden weiteren Hof wird ein lokaler Spieler ohne Verbindung angelegt.
   */
  hotseat?: number;
}

interface Member extends LobbyPlayer {
  connId: string | null;
  lastSeq: number;
  walk: [number, number];
}

export class HostSession extends Session implements HostControls {
  readonly isHost = true;
  readonly game = new Game();
  settings: Settings;
  private members = new Map<string, Member>();
  private conns = new Map<string, string>();
  private pending = new Map<string, number>();
  private wins = [0, 0, 0, 0];
  private rotation = [0, 0, 0, 0];
  private controller: string | null = null;
  private seenTurn = -1;
  private roundEndMs = 0;
  private acc = 0;
  private steps = 0;
  private lastSent = '';
  private chatLog: ChatLine[] = [];
  private closed = false;
  private readonly random: () => number;
  private readonly t: HostTransport;

  constructor(private opts: HostOptions) {
    super();
    this.t = opts.transport;
    this.random = opts.random ?? Math.random;
    this.settings = cleanSettings(opts.settings);
    this.me = HOST_ID;
    this.members.set(HOST_ID, this.member(HOST_ID, null, cleanName(opts.name), 0, false));
    this.game.addPlayer(HOST_ID, 0);
    const seats = Math.max(0, Math.min(MAX_TEAMS, Math.round(opts.hotseat ?? 0)));
    for (let t = 1; t < seats; t++) {
      const id = `lokal${t}`;
      this.members.set(id, this.member(id, null, `Spieler ${t + 1}`, t, false));
      this.game.addPlayer(id, t);
    }

    this.t.onConnect((c) => this.pending.set(c, 0));
    this.t.onMessage((c, raw) => this.onMessage(c, raw));
    this.t.onDisconnect((c) => this.onDisconnect(c));
    this.publishLobby();
  }

  // ───────────────────────── Host-Bedienung ─────────────────────────

  setSettings(raw: unknown): void {
    this.settings = cleanSettings(raw);
    this.opts.onSettings?.(this.settings);
    this.publishLobby();
  }

  /** Startet das Spiel. Gibt einen Grund zurück, falls es nicht geht. */
  startGame(): string | null {
    if (this.game.phase !== 'lobby') return 'Das Spiel läuft schon.';
    if (this.activeTeams().length < 2) return 'Mindestens zwei Höfe müssen besetzt sein.';
    this.wins = [0, 0, 0, 0];
    this.startRound();
    return null;
  }

  /** Alle zurück in die Lobby, Siege der Sitzung auf 0. */
  toLobby(): void {
    this.game.toLobby();
    this.controller = null;
    this.wins = [0, 0, 0, 0];
    for (const m of this.members.values()) m.waiting = false;
    this.syncGamePlayers();
    this.publishLobby();
    this.publishState();
  }

  /** Host verschiebt einen Spieler in einen anderen Hof (nur in der Lobby). */
  movePlayer(id: string, team: number): void {
    this.changeTeam(id, team);
  }

  leave(): void {
    if (this.closed) return;
    this.closed = true;
    for (const m of this.members.values()) if (m.connId) this.t.send(m.connId, { t: 'closed', reason: 'Der Gastgeber hat das Spiel verlassen.' });
    this.t.close();
  }

  /** Spielen mehrere Höfe an diesem Gerät? */
  get hotseat(): boolean {
    return [...this.members.keys()].some((id) => id.startsWith('lokal'));
  }

  /** Am selben Gerät steuert man auch die Züge der lokalen Mitspieler. */
  override get myTurn(): boolean {
    const c = this.state?.ctrl;
    return !!c && (c === this.me || this.isLocal(c));
  }

  private isLocal(id: string): boolean {
    const m = this.members.get(id);
    return !!m && m.connId === null && id !== HOST_ID;
  }

  protected post(msg: ClientMessage): void {
    // Spielbefehle gehören dem lokalen Spieler, der gerade am Zug ist.
    const play = msg.t === 'cmd' || msg.t === 'walk' || msg.t === 'aim';
    const actor = play && this.controller && this.isLocal(this.controller) ? this.controller : HOST_ID;
    this.handle(actor, msg);
  }

  // ───────────────────────── Zeit ─────────────────────────

  /** Vom Host-Takt aufgerufen. Holt höchstens 1 s nach (Hintergrund-Tab). */
  tick(dt: number): void {
    if (this.closed) return;
    for (const [c, age] of this.pending) {
      const a = age + dt * 1000;
      if (a >= JOIN_TIMEOUT_MS) {
        this.pending.delete(c);
        this.t.send(c, { t: 'reject', reason: 'zeit' });
        this.t.drop(c);
      } else this.pending.set(c, a);
    }

    this.acc = Math.min(1, this.acc + dt);
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.stepOnce();
      if (++this.steps % SEND_EVERY === 0) this.publishState();
    }
  }

  private stepOnce(): void {
    const g = this.game;
    if (g.phase === 'lobby') return;
    if (g.phase === 'roundEnd') {
      this.roundEndMs -= TICK * 1000;
      if (this.roundEndMs <= 0) this.startRound();
      return;
    }
    const ctrl = this.controller ? this.members.get(this.controller) : undefined;
    if (g.phase === 'move' && ctrl && (ctrl.walk[0] || ctrl.walk[1])) g.walk(ctrl.walk[0], ctrl.walk[1], TICK);
    g.step(TICK);
    this.afterGameChange();
  }

  /** Nach jeder Änderung am Spiel: neuer Zug? Rundenende? */
  private afterGameChange(skipped = 0): void {
    const g = this.game;
    if (g.phase === 'roundEnd') {
      if (this.roundEndMs <= 0) {
        this.roundEndMs = ROUND_END_MS;
        this.controller = null;
        if (g.winner !== null) this.wins[g.winner] = (this.wins[g.winner] ?? 0) + 1;
        this.publishLobby();
      }
      return;
    }
    if (g.turn !== this.seenTurn) {
      this.seenTurn = g.turn;
      this.controller = this.nextController(g.activeTeam);
      for (const m of this.members.values()) m.walk = [0, 0];
    }
    // Hof ohne anwesende Spieler: Zug überspringen. Seine Kühe bleiben stehen.
    // startRound/onDisconnect sorgen dafür, dass mindestens zwei Höfe besetzt sind.
    if (this.controller === null && (g.phase === 'select' || g.phase === 'move')) {
      if (skipped >= MAX_TEAMS) {
        // Kein Hof mit lebenden Kühen hat noch Spieler: Runde kann nicht weitergehen.
        this.toLobby();
        this.system('Keiner der übrigen Höfe ist besetzt, zurück in die Lobby.');
        return;
      }
      g.endTurn();
      this.afterGameChange(skipped + 1);
    }
  }

  private startRound(): void {
    for (const m of this.members.values()) m.waiting = false;
    this.syncGamePlayers();
    const teams = this.activeTeams().length;
    if (teams < 2) {
      this.toLobby();
      return;
    }
    const seed = Math.floor(this.random() * 2 ** 31);
    const rules = rulesFor(this.settings, teams, (choices) => choices[seed % choices.length]!);
    this.roundEndMs = 0;
    this.seenTurn = -1;
    this.game.startMatch(rules, seed);
    this.afterGameChange();
    this.publishLobby();
    this.publishState();
  }

  /** Reihum: Spieler eines Hofs steuern abwechselnd. */
  private nextController(team: number): string | null {
    const list = [...this.members.values()].filter((m) => m.team === team && !m.waiting).map((m) => m.id);
    if (list.length === 0) return null;
    const i = this.rotation[team]! % list.length;
    this.rotation[team] = i + 1;
    return list[i]!;
  }

  // ───────────────────────── Nachrichten ─────────────────────────

  private onMessage(connId: string, raw: unknown): void {
    const msg = parseClientMessage(raw);
    if (!msg) return;
    if (this.pending.has(connId)) {
      if (msg.t === 'join') this.onJoin(connId, msg);
      return;
    }
    const id = this.conns.get(connId);
    if (id) this.handle(id, msg);
  }

  private onJoin(connId: string, msg: Extract<ClientMessage, { t: 'join' }>): void {
    this.pending.delete(connId);
    const reject = (reason: 'passwort' | 'voll' | 'version') => {
      this.t.send(connId, { t: 'reject', reason });
      this.t.drop(connId);
    };
    if (msg.v !== PROTOCOL) return reject('version');
    if (msg.pw !== this.opts.pwHash) return reject('passwort');
    if (this.members.size >= MAX_PLAYERS) return reject('voll');

    let id = '';
    do id = 'p' + Array.from({ length: 6 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[randInt(this.random, 0, 31)]).join('');
    while (this.members.has(id));
    const waiting = this.game.phase !== 'lobby';
    const m = this.member(id, connId, this.uniqueName(msg.name), this.leastFilledTeam(), waiting);
    this.members.set(id, m);
    this.conns.set(connId, id);
    if (!waiting) this.game.addPlayer(id, m.team);

    this.t.send(connId, { t: 'welcome', id });
    this.t.send(connId, { t: 'chatlog', list: this.chatLog.slice(-CHAT_FOR_NEW) });
    this.publishLobby();
    if (this.state) this.t.send(connId, this.state);
    this.system(`${m.name} ist da${waiting ? ' und spielt ab der nächsten Runde mit' : ''}.`);
  }

  private onDisconnect(connId: string): void {
    this.pending.delete(connId);
    const id = this.conns.get(connId);
    if (!id) return;
    this.conns.delete(connId);
    const m = this.members.get(id);
    this.members.delete(id);
    this.game.removePlayer(id);
    if (m) this.system(`${m.name} ist gegangen.`);

    const g = this.game;
    if (g.phase !== 'lobby' && this.activeTeams().length < 2) {
      this.toLobby();
      this.system('Zu wenige Höfe besetzt, zurück in die Lobby.');
      return;
    }
    if (this.controller === id) {
      this.controller = this.nextController(g.activeTeam);
      this.afterGameChange();
    }
    this.publishLobby();
    this.publishState();
  }

  /** Eine geprüfte Nachricht eines aufgenommenen Spielers ausführen. */
  private handle(id: string, msg: ClientMessage): void {
    const m = this.members.get(id);
    if (!m || this.closed) return;
    switch (msg.t) {
      case 'chat': {
        const text = msg.text.trim().slice(0, MAX_CHAT);
        if (text) this.addChat({ id, name: m.name, color: m.color, text, ts: Date.now() });
        return;
      }
      case 'rename': {
        m.name = this.uniqueName(msg.name, id);
        this.publishLobby();
        return;
      }
      case 'team':
        this.changeTeam(id, msg.team);
        return;
      case 'walk':
        if (this.controller === id) m.walk = msg.dir;
        return;
      case 'aim':
        if (this.controller === id) this.game.setAim(msg.yaw, msg.pitch, msg.weapon);
        return;
      case 'cmd':
        if (msg.seq <= m.lastSeq) return; // schon ausgeführt
        m.lastSeq = msg.seq;
        if (this.controller !== id) return; // nicht am Zug
        this.runCommand(msg.cmd);
        return;
      case 'join':
        return;
    }
  }

  private runCommand(cmd: Command): void {
    const g = this.game;
    switch (cmd.k) {
      case 'select':
        g.selectCow(cmd.cow);
        break;
      case 'branch':
        if (g.cow(cmd.cow)?.team === g.activeTeam) g.chooseBranch(cmd.cow, cmd.branch);
        break;
      case 'fire':
        g.fire(cmd);
        break;
      case 'jump':
        g.jump();
        break;
      case 'end':
        if (g.phase === 'select' || g.phase === 'move') g.endTurn();
        break;
    }
    this.afterGameChange();
    this.publishState();
  }

  // ───────────────────────── Lobby ─────────────────────────

  private changeTeam(id: string, team: number): void {
    const m = this.members.get(id);
    if (!m || !Number.isInteger(team) || team < 0 || team >= MAX_TEAMS) return;
    if (this.game.phase !== 'lobby' && !m.waiting) return; // im Spiel erst ab der Lobby
    m.team = team;
    m.color = TEAM_STYLES[team]!.color;
    if (!m.waiting) this.game.addPlayer(id, team);
    this.publishLobby();
  }

  private activeTeams(): number[] {
    return [...new Set([...this.members.values()].filter((m) => !m.waiting).map((m) => m.team))];
  }

  private syncGamePlayers(): void {
    for (const id of [...this.game.playerTeams.keys()]) if (!this.members.has(id)) this.game.removePlayer(id);
    for (const m of this.members.values()) if (!m.waiting) this.game.addPlayer(m.id, m.team);
  }

  private leastFilledTeam(): number {
    const counts = [0, 0, 0, 0];
    for (const m of this.members.values()) counts[m.team]! += 1;
    // Nur Hof 0 und 1 automatisch füllen; Hof 3 und 4 wählt man selbst.
    return counts[1]! < counts[0]! ? 1 : 0;
  }

  private uniqueName(name: string, self?: string): string {
    const taken = new Set([...this.members.values()].filter((m) => m.id !== self).map((m) => m.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) {
      const n = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(n.toLowerCase())) return n;
    }
  }

  private member(id: string, connId: string | null, name: string, team: number, waiting: boolean): Member {
    return { id, connId, name, team, color: TEAM_STYLES[team]!.color, waiting, lastSeq: 0, walk: [0, 0] };
  }

  // ───────────────────────── Verteilen ─────────────────────────

  private sendAll(msg: HostMessage): void {
    for (const m of this.members.values()) if (m.connId) this.t.send(m.connId, msg);
  }

  private publishLobby(): void {
    this.lobby = {
      t: 'lobby',
      players: [...this.members.values()].map(({ id, name, team, color, waiting }) => ({ id, name, team, color, waiting })),
      phase: this.game.phase,
      settings: this.settings,
      roomName: this.opts.roomName,
      wins: [...this.wins],
    };
    this.sendAll(this.lobby);
    this.emit('change');
  }

  /** Spielstand nur verschicken, wenn er sich geändert hat (Datenmenge, Konzept Kap. 11). */
  private publishState(): void {
    if (this.game.phase === 'lobby') {
      if (this.state) {
        this.state = null;
        this.lastSent = '';
        this.emit('change');
      }
      return;
    }
    const msg: HostMessage = { t: 'state', s: this.game.snapshot(), ctrl: this.controller };
    const json = JSON.stringify(msg);
    if (json === this.lastSent) return;
    this.lastSent = json;
    this.state = msg;
    this.sendAll(msg);
    this.emit('change');
  }

  private addChat(line: ChatLine): void {
    this.chatLog.push(line);
    if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
    this.chat = this.chatLog;
    this.sendAll({ t: 'chat', ...line });
    this.emit('chat', line);
  }

  private system(text: string): void {
    this.addChat({ id: '', name: '', color: '', text, ts: Date.now() });
  }
}
