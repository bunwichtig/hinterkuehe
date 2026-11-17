/**
 * Transport über PeerJS (WebRTC), Vorlage Kap. 4.
 *
 * - Host-Kennung = PEER_PREFIX + Raum-Slug. Fehler „unavailable-id“ = Raum gibt es schon.
 * - Mitspieler verbinden sich mit dieser Kennung. Fehler „peer-unavailable“ = Raum gibt es nicht.
 * - 15 s Zeitlimit beim Verbinden, Nachrichten zuverlässig (reliable) als JSON.
 *
 * PeerJS wird erst beim ersten Verbinden geladen, damit die Startseite schnell ist.
 */
import type { DataConnection, Peer as PeerType } from 'peerjs';
import { peerIdFor } from './room';
import { CONNECT_TIMEOUT_MS, type ClientTransport, type HostTransport } from './transport';

async function loadPeer(): Promise<typeof PeerType> {
  const mod = await import('peerjs');
  return mod.Peer;
}

function errType(e: unknown): string {
  return (e as { type?: string })?.type ?? '';
}

export async function hostPeer(room: string): Promise<HostTransport> {
  const Peer = await loadPeer();
  const peer = new Peer(peerIdFor(room), { debug: 0 });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Der Vermittlungsserver antwortet nicht. Bitte später nochmal versuchen.')), CONNECT_TIMEOUT_MS);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    peer.once('error', (e) => {
      clearTimeout(timer);
      peer.destroy();
      reject(new Error(errType(e) === 'unavailable-id' ? 'Diesen Raum gibt es schon. Wähle einen anderen Namen oder tritt bei.' : `Verbindung fehlgeschlagen (${errType(e) || 'unbekannt'}).`));
    });
  });

  const conns = new Map<string, DataConnection>();
  let onConnect: (id: string) => void = () => {};
  let onMessage: (id: string, msg: unknown) => void = () => {};
  let onDisconnect: (id: string) => void = () => {};

  peer.on('connection', (conn) => {
    const id = conn.connectionId;
    const gone = () => {
      if (conns.delete(id)) onDisconnect(id);
    };
    conn.on('open', () => {
      conns.set(id, conn);
      onConnect(id);
    });
    conn.on('data', (d) => onMessage(id, d));
    conn.on('close', gone);
    conn.on('error', gone);
  });
  // Verbindung zum Vermittlungsserver verloren: bestehende Spieler bleiben verbunden,
  // für neue Beitritte wieder anmelden.
  peer.on('disconnected', () => {
    if (!peer.destroyed) peer.reconnect();
  });

  return {
    onConnect: (cb) => (onConnect = cb),
    onMessage: (cb) => (onMessage = cb),
    onDisconnect: (cb) => (onDisconnect = cb),
    send: (id, msg) => {
      const c = conns.get(id);
      if (c?.open) void c.send(msg);
    },
    drop: (id) => {
      const c = conns.get(id);
      conns.delete(id);
      // Kurz warten, damit eine Abweisung noch ankommt.
      setTimeout(() => c?.close(), 300);
    },
    close: () => setTimeout(() => peer.destroy(), 300),
  };
}

export async function joinPeer(room: string): Promise<ClientTransport> {
  const Peer = await loadPeer();
  const peer = new Peer({ debug: 0 });
  const conn = await new Promise<DataConnection>((resolve, reject) => {
    const fail = (text: string) => {
      clearTimeout(timer);
      peer.destroy();
      reject(new Error(text));
    };
    const timer = setTimeout(() => fail('Keine Verbindung zum Raum. Gibt es ihn noch?'), CONNECT_TIMEOUT_MS);
    peer.once('error', (e) =>
      fail(errType(e) === 'peer-unavailable' ? 'Diesen Raum gibt es nicht (oder der Gastgeber ist gegangen).' : `Verbindung fehlgeschlagen (${errType(e) || 'unbekannt'}).`),
    );
    peer.once('open', () => {
      const c = peer.connect(peerIdFor(room), { reliable: true, serialization: 'json' });
      c.once('open', () => {
        clearTimeout(timer);
        resolve(c);
      });
    });
  });

  let onClose: (reason: string) => void = () => {};
  let closed = false;
  const lost = () => {
    if (closed) return;
    closed = true;
    onClose('Verbindung zum Gastgeber verloren.');
    peer.destroy();
  };
  conn.on('close', lost);
  conn.on('error', lost);

  return {
    onMessage: (cb) => conn.on('data', cb),
    onClose: (cb) => (onClose = cb),
    send: (msg) => {
      if (conn.open) void conn.send(msg);
    },
    close: () => {
      closed = true;
      peer.destroy();
    },
  };
}
