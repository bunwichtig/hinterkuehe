/**
 * Transport-Schicht: verbindet Host und Mitspieler.
 *
 * Umsetzungen (nach spiel-technik-und-optionen.md Kap. 4):
 *  - peer.ts:  PeerJS/WebRTC, Host-Kennung = PEER_PREFIX + Raum-Slug,
 *              15 s Zeitlimit beim Verbinden.
 *  - local.ts: BroadcastChannel für Tests mit `?local` in mehreren Tabs.
 *  - tests/helpers.ts: im Speicher, für die automatischen Tests.
 *
 * Die Sitzungen (host.ts, client.ts) kennen nur diese Schnittstellen, nicht PeerJS.
 * Nachrichten kommen als `unknown` an und werden in den Sitzungen geprüft.
 */
import type { ClientMessage, HostMessage } from './protocol';

/** Zeitlimits wie in der Vorlage. */
export const CONNECT_TIMEOUT_MS = 15_000;
export const JOIN_TIMEOUT_MS = 10_000;

/** Sicht des Hosts: viele Verbindungen. */
export interface HostTransport {
  onConnect(cb: (connId: string) => void): void;
  onMessage(cb: (connId: string, msg: unknown) => void): void;
  onDisconnect(cb: (connId: string) => void): void;
  send(connId: string, msg: HostMessage): void;
  /** Eine Verbindung trennen (abgewiesen, zu langsam). */
  drop(connId: string): void;
  close(): void;
}

/** Sicht eines Mitspielers: eine Verbindung zum Host. */
export interface ClientTransport {
  onMessage(cb: (msg: unknown) => void): void;
  onClose(cb: (reason: string) => void): void;
  send(msg: ClientMessage): void;
  close(): void;
}
