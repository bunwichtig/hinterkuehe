/**
 * Einladungslink und Zufallsvorschläge (Vorlage Kap. 17).
 *
 * Link: …/hinterkuehe/#raum=Freitagsweide&pwx=3438322e6b666d
 * Alles nach `#` geht nie an einen Server. Das Passwort steht als Hex im Link,
 * weil manche Apps Links kleinschreiben.
 */

export interface Invite {
  room: string;
  pw: string | null;
}

const toHex = (s: string) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex: string): string | null {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Einladungslink zur aktuellen Seite bauen. */
export function inviteLink(base: string, room: string, pw: string | null): string {
  // ?local bleibt erhalten, damit lokale Tests mit Einladungslink funktionieren.
  const url = base.split('#')[0]!;
  const parts = [`raum=${encodeURIComponent(room)}`];
  if (pw) parts.push(`pwx=${toHex(pw)}`);
  return `${url}#${parts.join('&')}`;
}

/** Einladung aus dem Teil nach `#` lesen. Alte Form `pw=` wird auch verstanden. */
export function readInvite(hash: string): Invite | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const room = params.get('raum')?.trim();
  if (!room) return null;
  const pwx = params.get('pwx');
  const pw = pwx !== null ? fromHex(pwx) : params.get('pw');
  return { room: room.slice(0, 24), pw: pw ?? null };
}

const NAMES = [
  'Anna', 'Ben', 'Clara', 'David', 'Ella', 'Felix', 'Greta', 'Hannes', 'Ida', 'Jonas',
  'Kim', 'Lena', 'Max', 'Nora', 'Oskar', 'Paula', 'Quirin', 'Rosa', 'Sami', 'Tilda',
  'Uwe', 'Vera', 'Willi', 'Xaver', 'Yara', 'Zoe', 'Lotta', 'Emil', 'Mia', 'Theo',
];

const ROOMS = [
  'Hinterweide', 'Freitagsrunde', 'Almabtrieb', 'Stallgeflüster', 'Kuhglocke', 'Heuboden',
  'Melkstand', 'Grasnarbe', 'Weidezaun', 'Mistgabel', 'Kälberwiese', 'Sonntagsweide',
  'Bergalm', 'Moorwiese', 'Kornfeld', 'Steinbruch', 'Winterweide', 'Hofkapelle',
];

function pick<T>(list: readonly T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length)]!;
}

function cryptoRandom(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! / 2 ** 32;
}

export function suggestName(rnd: () => number = Math.random): string {
  return pick(NAMES, rnd);
}

export function suggestRoom(rnd: () => number = Math.random): string {
  return `${pick(ROOMS, rnd)} ${Math.floor(rnd() * 90 + 10)}`;
}

/** Passwort im Format „482.kfm“: 3 Ziffern, Punkt, 3 Buchstaben. */
export function suggestPassword(rnd: () => number = cryptoRandom): string {
  const digits = Array.from({ length: 3 }, () => Math.floor(rnd() * 10)).join('');
  const letters = Array.from({ length: 3 }, () => 'abcdefghjkmnpqrstuvwxyz'[Math.floor(rnd() * 23)]).join('');
  return `${digits}.${letters}`;
}
