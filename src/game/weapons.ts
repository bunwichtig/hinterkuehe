/**
 * Waffen und Hilfsmittel. Werte siehe docs/konzept.md, Kap. 5.
 * Reine Daten: Die Spiellogik (game.ts) liest Art, Schaden, Radius und Flugwerte von hier.
 */
export type WeaponKind =
  | 'melee' // Nahkampf direkt vor der Kuh
  | 'straight' // gerader Schuss/Wurf, keine Schwerkraft, kein Wind
  | 'arc' // Bogenschuss mit Schwerkraft
  | 'grenade' // Wurf mit Zünder, springt ab
  | 'airstrike' // Luftschlag auf einen Kartenpunkt
  | 'place' // ablegen (Mine, Sprengsack, Zaun, Unterstand)
  | 'heal' // eigene Kühe heilen
  | 'revive' // heimgeschickte Kuh zurückholen
  | 'detonate' // Fernzünder für eigene Sprengsäcke
  | 'self' // wirkt auf die Kuh selbst (Tarnung, Zug beenden)
  | 'lure'; // Glockenköder

export interface Weapon {
  id: string;
  name: string;
  kind: WeaponKind;
  /** Schaden in der Mitte (bei Heilung: Lebenspunkte). */
  damage: number;
  /** Wirkradius in Metern (0 = nur direkter Treffer). */
  radius: number;
  /** Munition pro Kuh und Runde, Infinity = unbegrenzt. */
  ammo: number;
  wind: boolean;
  /** Startgeschwindigkeit bei voller Kraft in m/s. */
  speed: number;
  /** Höchste Flugstrecke gerader Schüsse in m (bei Luftschlag: größte Entfernung des Ziels). */
  range: number;
  /** Kraterradius in m (0 = kein Krater). */
  crater: number;
  /** Rückstoß in m/s in der Mitte. */
  push: number;
  /** Kleinste Neigung in Grad (Mörser schießt steil). */
  minPitch: number;
  /** Kurzbeschreibung für die Waffenleiste. */
  desc: string;
  icon: string;
}

const w = (
  id: string,
  name: string,
  icon: string,
  kind: WeaponKind,
  damage: number,
  radius: number,
  ammo: number,
  desc: string,
  extra: Partial<Weapon> = {},
): Weapon => ({
  id,
  name,
  icon,
  kind,
  damage,
  radius,
  ammo,
  desc,
  wind: false,
  speed: 0,
  range: 0,
  crater: 0,
  push: damage > 0 ? damage * 0.14 : 0,
  minPitch: -20,
  ...extra,
});

export const WEAPONS = {
  hornstoss: w('hornstoss', 'Hornstoß', '🐂', 'melee', 20, 2.4, Infinity, 'Nahkampf, stößt weit weg', { push: 11 }),
  mistgabel: w('mistgabel', 'Mistgabel', '🔱', 'straight', 15, 0, Infinity, 'gerader Wurf, kurze Reichweite', {
    speed: 45,
    range: 22,
    push: 2,
  }),
  milchkanne: w('milchkanne', 'Milchkanne', '🥛', 'grenade', 35, 3, 2, 'Wurf mit Zünder 1–5 s, springt ab', {
    speed: 20,
    crater: 2.6,
  }),
  heuschleuder: w('heuschleuder', 'Heuballen-Schleuder', '🌾', 'arc', 40, 3, 4, 'Bogenschuss, Wind wirkt', {
    speed: 32,
    crater: 2.8,
    wind: true,
  }),
  kuerbismoerser: w('kuerbismoerser', 'Kürbis-Mörser', '🎃', 'arc', 55, 4.5, 2, 'steiler Bogenschuss, großer Krater', {
    speed: 30,
    crater: 4,
    wind: true,
    minPitch: 40,
  }),
  heuhagel: w('heuhagel', 'Heuballen-Hagel', '☄️', 'airstrike', 25, 2.5, 1, 'Luftschlag: 5 Ballen auf einen Punkt', {
    crater: 2.2,
    wind: true,
    range: 80,
  }),
  fladenmine: w('fladenmine', 'Kuhfladen-Mine', '💩', 'place', 45, 2.5, 3, 'ablegen, scharf ab dem nächsten Zug', {
    crater: 2,
  }),
  weidezaun: w('weidezaun', 'Weidezaun', '🚧', 'place', 0, 0, 2, 'Deckung aufstellen (60 LP)'),
  sprengsack: w('sprengsack', 'Sprengsack', '💣', 'place', 70, 5, 1, 'Zünder 3 Züge oder Fernzünder, sprengt Bunker', {
    crater: 4.5,
  }),
  fernzuender: w('fernzuender', 'Fernzünder', '📡', 'detonate', 0, 0, Infinity, 'eigene Sprengsäcke jetzt zünden'),
  unterstand: w('unterstand', 'Unterstand', '🛖', 'place', 0, 0, 1, 'baut einen Holzbunker an Ort und Stelle'),
  melkschemel: w('melkschemel', 'Melkschemel-Wurf', '🪑', 'arc', 15, 1.4, 3, 'kurzer Bogen, betäubt', {
    speed: 18,
    wind: true,
    push: 3,
  }),
  heilkraeuter: w('heilkraeuter', 'Heilkräuter', '🌿', 'heal', 30, 4, 3, '+30 LP für eine eigene Kuh in 4 m'),
  kraeuterdampf: w('kraeuterdampf', 'Kräuterdampf', '♨️', 'heal', 20, 8, 1, '+20 LP für alle eigenen in 8 m'),
  wiederbeleben: w('wiederbeleben', 'Kuhglocken-Ruf', '🔔', 'revive', 40, 0, 1, 'holt eine heimgeschickte Kuh zurück (40 %)'),
  fernglas: w('fernglas', 'Fernglas-Schuss', '🔭', 'straight', 35, 0, 3, 'gerade, sehr weit, Kopftreffer 60', {
    speed: 140,
    range: 95,
    push: 2,
  }),
  glockenkoeder: w('glockenkoeder', 'Glockenköder', '🛎️', 'lure', 0, 6, 2, 'Gegner im Umkreis verlieren 20 Ausdauer', {
    speed: 20,
    wind: true,
  }),
  tarnung: w('tarnung', 'Tarnung', '🌫️', 'self', 0, 0, 1, 'unsichtbar bis zur nächsten eigenen Aktion'),
  zugende: w('zugende', 'Zug beenden', '⏭️', 'self', 0, 0, Infinity, '+20 % Ausdauer beim nächsten Zug'),
} as const satisfies Record<string, Weapon>;

export type WeaponId = keyof typeof WEAPONS;

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && Object.hasOwn(WEAPONS, v);
}

export function weapon(id: WeaponId): Weapon {
  return WEAPONS[id];
}

/** Waffen, die in Waffenkisten stecken können (ein Schuss, auch laufbahnfremd). */
export const CRATE_WEAPONS: WeaponId[] = [
  'heuschleuder',
  'kuerbismoerser',
  'heuhagel',
  'fladenmine',
  'sprengsack',
  'melkschemel',
  'fernglas',
  'glockenkoeder',
  'milchkanne',
  'heilkraeuter',
];

/** Schwerkraft in m/s². */
export const GRAVITY = 9.81;

/** Richtung aus Blickwinkel (Grad, 0 = +x, gegen den Uhrzeigersinn von oben). */
export function dirOf(yawDeg: number): [number, number] {
  const r = (yawDeg * Math.PI) / 180;
  return [Math.cos(r), -Math.sin(r)];
}

/** Startgeschwindigkeit eines Geschosses. */
export function launchVelocity(wp: Weapon, yaw: number, pitch: number, power: number): [number, number, number] {
  const [dx, dz] = dirOf(yaw);
  const p = (Math.max(wp.minPitch, pitch) * Math.PI) / 180;
  const speed = wp.kind === 'straight' ? wp.speed : wp.speed * Math.max(0.08, Math.min(1, power));
  return [Math.cos(p) * dx * speed, Math.sin(p) * speed, Math.cos(p) * dz * speed];
}
