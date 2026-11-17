/**
 * Transport über BroadcastChannel für Tests ohne Internet: `?local` an die Adresse
 * hängen, dann sprechen mehrere Tabs desselben Browsers miteinander (Vorlage Kap. 1).
 */
import { CHANNEL_PREFIX } from '../config/ids';
import { slug } from './room';
import type { ClientTransport, HostTransport } from './transport';

type Packet =
  | { k: 'ping' }
  | { k: 'pong' }
  | { k: 'open'; from: string }
  | { k: 'opened'; to: string }
  | { k: 'msg'; from?: string; to?: string; data: unknown }
  | { k: 'close'; from?: string; to?: string };

const channelFor = (room: string) => new BroadcastChannel(CHANNEL_PREFIX + slug(room));
const randomId = () => Math.random().toString(36).slice(2, 10);

export async function hostLocal(room: string): Promise<HostTransport> {
  const ch = channelFor(room);
  // Gibt es schon einen Host in diesem Raum?
  const taken = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 300);
    ch.onmessage = (e: MessageEvent<Packet>) => {
      if (e.data.k === 'pong') {
        clearTimeout(t);
        resolve(true);
      }
    };
    ch.postMessage({ k: 'ping' } satisfies Packet);
  });
  if (taken) {
    ch.close();
    throw new Error('Diesen Raum gibt es schon. Wähle einen anderen Namen oder tritt bei.');
  }

  const open = new Set<string>();
  let onConnect: (id: string) => void = () => {};
  let onMessage: (id: string, msg: unknown) => void = () => {};
  let onDisconnect: (id: string) => void = () => {};
  const post = (p: Packet) => ch.postMessage(p);

  ch.onmessage = (e: MessageEvent<Packet>) => {
    const p = e.data;
    if (p.k === 'ping') post({ k: 'pong' });
    else if (p.k === 'open') {
      open.add(p.from);
      post({ k: 'opened', to: p.from });
      onConnect(p.from);
    } else if (p.k === 'msg' && p.from && open.has(p.from)) onMessage(p.from, p.data);
    else if (p.k === 'close' && p.from && open.delete(p.from)) onDisconnect(p.from);
  };
  addEventListener('pagehide', () => post({ k: 'close' }));

  return {
    onConnect: (cb) => (onConnect = cb),
    onMessage: (cb) => (onMessage = cb),
    onDisconnect: (cb) => (onDisconnect = cb),
    send: (to, data) => {
      if (open.has(to)) post({ k: 'msg', to, data });
    },
    drop: (to) => {
      open.delete(to);
      setTimeout(() => post({ k: 'close', to }), 100);
    },
    close: () => {
      post({ k: 'close' });
      ch.close();
    },
  };
}

export async function joinLocal(room: string): Promise<ClientTransport> {
  const ch = channelFor(room);
  const me = randomId();
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      ch.close();
      reject(new Error('Diesen Raum gibt es nicht (lokal: Host-Tab offen?).'));
    }, 1500);
    ch.onmessage = (e: MessageEvent<Packet>) => {
      if (e.data.k === 'opened' && e.data.to === me) {
        clearTimeout(t);
        resolve();
      }
    };
    ch.postMessage({ k: 'open', from: me } satisfies Packet);
  });

  let onMessage: (msg: unknown) => void = () => {};
  let onClose: (reason: string) => void = () => {};
  let closed = false;
  ch.onmessage = (e: MessageEvent<Packet>) => {
    const p = e.data;
    if (p.k === 'msg' && p.to === me) onMessage(p.data);
    // Host weg (close ohne Ziel) oder diese Verbindung getrennt.
    if (p.k === 'close' && !p.from && (!p.to || p.to === me) && !closed) {
      closed = true;
      onClose('Verbindung zum Gastgeber verloren.');
      ch.close();
    }
  };
  addEventListener('pagehide', () => {
    if (!closed) ch.postMessage({ k: 'close', from: me } satisfies Packet);
  });

  return {
    onMessage: (cb) => (onMessage = cb),
    onClose: (cb) => (onClose = cb),
    send: (data) => {
      if (!closed) ch.postMessage({ k: 'msg', from: me, data } satisfies Packet);
    },
    close: () => {
      if (closed) return;
      closed = true;
      ch.postMessage({ k: 'close', from: me } satisfies Packet);
      ch.close();
    },
  };
}
