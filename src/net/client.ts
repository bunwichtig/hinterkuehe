/**
 * Mitspieler-Sitzung: schickt Befehle an den Host und zeigt an, was er schickt.
 * Keine eigene Vorhersage (Vorlage Kap. 6).
 */
import { CHAT_HISTORY, PROTOCOL, REJECT_TEXT, cleanName, type ClientMessage, type HostMessage } from './protocol';
import { Session } from './session';
import type { ClientTransport } from './transport';

/** Laufrichtung alle 250 ms wiederholen, falls eine Nachricht verloren ging. */
export const WALK_REPEAT_MS = 250;

export class ClientSession extends Session {
  readonly isHost = false;
  private closed = false;
  private walkMs = 0;
  /** Wird erfüllt, sobald der Host den Beitritt annimmt; abgelehnt bei Abweisung. */
  readonly joined: Promise<void>;

  constructor(
    private t: ClientTransport,
    name: string,
    pwHash: string,
  ) {
    super();
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    this.joined = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Unbehandelte Ablehnung vermeiden, wenn niemand wartet.
    this.joined.catch(() => {});

    t.onMessage((raw) => {
      const msg = raw as HostMessage;
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'welcome') {
        this.me = msg.id;
        resolve();
      } else if (msg.t === 'reject') {
        reject(new Error(REJECT_TEXT[msg.reason] ?? 'Abgewiesen.'));
        this.close(REJECT_TEXT[msg.reason] ?? 'Abgewiesen.');
      } else this.receive(msg);
    });
    t.onClose((reason) => {
      reject(new Error(reason));
      this.close(reason);
    });
    t.send({ t: 'join', name: cleanName(name), pw: pwHash, v: PROTOCOL });
  }

  private receive(msg: HostMessage): void {
    switch (msg.t) {
      case 'lobby':
        this.lobby = msg;
        if (msg.phase === 'lobby') this.state = null;
        this.emit('change');
        break;
      case 'state':
        this.state = msg;
        this.emit('change');
        break;
      case 'chatlog':
        this.chat = msg.list.slice(-CHAT_HISTORY);
        this.emit('change');
        break;
      case 'chat': {
        const line = { id: msg.id, name: msg.name, color: msg.color, text: msg.text, ts: msg.ts };
        this.chat = [...this.chat, line].slice(-CHAT_HISTORY);
        this.emit('chat', line);
        break;
      }
      case 'closed':
        this.close(msg.reason);
        break;
    }
  }

  protected post(msg: ClientMessage): void {
    if (!this.closed) this.t.send(msg);
  }

  /** Vom Takt der Oberfläche aufgerufen: Laufrichtung regelmäßig wiederholen. */
  tick(dt: number): void {
    this.walkMs += dt * 1000;
    if (this.walkMs >= WALK_REPEAT_MS) {
      this.walkMs = 0;
      if (this.myTurn) this.repeatWalk();
    }
  }

  leave(): void {
    this.close('Du hast den Raum verlassen.');
  }

  private close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.t.close();
    this.emit('closed', reason);
  }
}
