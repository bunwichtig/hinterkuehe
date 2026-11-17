import type { ClientMessage, HostMessage } from '../src/net/protocol';
import type { ClientTransport, HostTransport } from '../src/net/transport';

/**
 * Transport im Speicher für Tests. Nachrichten werden wie beim echten Netz
 * als JSON kopiert und sofort zugestellt.
 */
export function memoryNetwork() {
  const toClient = new Map<string, (m: unknown) => void>();
  const closeClient = new Map<string, (r: string) => void>();
  let hostConnect: (id: string) => void = () => {};
  let hostMessage: (id: string, m: unknown) => void = () => {};
  let hostDisconnect: (id: string) => void = () => {};
  const sent: { to: string; msg: HostMessage }[] = [];
  let n = 0;
  const copy = <T>(m: T): T => JSON.parse(JSON.stringify(m)) as T;

  const host: HostTransport = {
    onConnect: (cb) => (hostConnect = cb),
    onMessage: (cb) => (hostMessage = cb),
    onDisconnect: (cb) => (hostDisconnect = cb),
    send: (to, msg) => {
      sent.push({ to, msg: copy(msg) });
      toClient.get(to)?.(copy(msg));
    },
    drop: (to) => {
      toClient.delete(to);
      closeClient.get(to)?.('getrennt');
      closeClient.delete(to);
    },
    close: () => {
      for (const [id, cb] of closeClient) {
        closeClient.delete(id);
        cb('Host weg');
      }
    },
  };

  /** Neue Verbindung eines Mitspielers. `raw` schickt beliebige Daten (für Angriffs-Tests). */
  function connect() {
    const id = `c${++n}`;
    let gone = false;
    const t: ClientTransport & { raw(m: unknown): void; id: string } = {
      id,
      onMessage: (cb) => toClient.set(id, cb),
      onClose: (cb) => closeClient.set(id, cb),
      send: (msg: ClientMessage) => {
        if (!gone) hostMessage(id, copy(msg));
      },
      raw: (m: unknown) => hostMessage(id, m),
      close: () => {
        if (gone) return;
        gone = true;
        toClient.delete(id);
        closeClient.delete(id);
        hostDisconnect(id);
      },
    };
    hostConnect(id);
    return t;
  }

  return { host, connect, sent };
}
