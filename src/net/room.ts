import { HASH_SALT, PEER_PREFIX } from '../config/ids';

/** Raumname → Slug: klein, ohne Akzente, nur a–z0–9 und '-', max. 40 Zeichen. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** PeerJS-Kennung des Hosts für einen Raum. */
export function peerIdFor(room: string): string {
  return PEER_PREFIX + slug(room);
}

/** Passwort nur als SHA-256-Hash vergleichen und verschicken, nie im Klartext. */
export async function hashPw(room: string, pw: string): Promise<string> {
  const data = new TextEncoder().encode(HASH_SALT + slug(room) + '|' + pw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
