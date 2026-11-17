/**
 * Transport-Schicht: verbindet Host und Mitspieler.
 *
 * Geplant (Schritt 2, nach spiel-technik-und-optionen.md Kap. 4):
 *  - PeerTransport: PeerJS/WebRTC, Host-Kennung = PEER_PREFIX + Raum-Slug,
 *    15 s Zeitlimit beim Verbinden, 10 s für die join-Nachricht.
 *  - LocalTransport: BroadcastChannel für Tests mit `?local` in mehreren Tabs.
 *
 * Die Spiellogik kennt nur diese Schnittstellen, nicht PeerJS.
 */
import type { ClientMessage, HostMessage } from './protocol';

/** Sicht des Hosts: viele Verbindungen. */
export interface HostTransport {
  onConnect(cb: (connId: string) => void): void;
  onMessage(cb: (connId: string, msg: ClientMessage) => void): void;
  onDisconnect(cb: (connId: string) => void): void;
  send(connId: string, msg: HostMessage): void;
  broadcast(msg: HostMessage): void;
  close(): void;
}

/** Sicht eines Mitspielers: eine Verbindung zum Host. */
export interface ClientTransport {
  onMessage(cb: (msg: HostMessage) => void): void;
  onClose(cb: (reason: string) => void): void;
  send(msg: ClientMessage): void;
  close(): void;
}
