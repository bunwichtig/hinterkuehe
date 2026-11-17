/**
 * Waffen und Hilfsmittel. Werte siehe docs/konzept.md, Kap. 5.
 * Reine Daten: Die Physik liest Art, Schaden und Radius von hier.
 */
export type WeaponKind =
  | 'melee' // Nahkampf direkt vor der Kuh
  | 'straight' // gerader Schuss/Wurf, kein Wind
  | 'arc' // Bogenschuss, Wind wirkt
  | 'grenade' // Wurf mit Zünder, springt ab
  | 'airstrike' // Luftschlag auf einen Kartenpunkt
  | 'place' // ablegen (Mine, Sprengsack, Zaun, Unterstand)
  | 'heal' // eigene Kühe heilen
  | 'self' // wirkt auf die Kuh selbst (Tarnung, Zug beenden)
  | 'lure'; // Glockenköder

export interface Weapon {
  id: string;
  name: string;
  kind: WeaponKind;
  /** Schaden in der Mitte (negativ = Heilung). */
  damage: number;
  /** Wirkradius in Metern (0 = nur direkter Treffer). */
  radius: number;
  /** Munition pro Kuh und Runde, Infinity = unbegrenzt. */
  ammo: number;
  wind: boolean;
}

const w = (
  id: string,
  name: string,
  kind: WeaponKind,
  damage: number,
  radius: number,
  ammo: number,
  wind = false,
): Weapon => ({ id, name, kind, damage, radius, ammo, wind });

export const WEAPONS = {
  hornstoss: w('hornstoss', 'Hornstoß', 'melee', 20, 1.5, Infinity),
  mistgabel: w('mistgabel', 'Mistgabel', 'straight', 15, 0, Infinity),
  milchkanne: w('milchkanne', 'Milchkanne', 'grenade', 35, 3, 2),
  heuschleuder: w('heuschleuder', 'Heuballen-Schleuder', 'arc', 40, 3, 4, true),
  kuerbismoerser: w('kuerbismoerser', 'Kürbis-Mörser', 'arc', 55, 4.5, 2, true),
  heuhagel: w('heuhagel', 'Heuballen-Hagel', 'airstrike', 25, 2.5, 1, true),
  fladenmine: w('fladenmine', 'Kuhfladen-Mine', 'place', 45, 2.5, 3),
  weidezaun: w('weidezaun', 'Weidezaun', 'place', 0, 0, 2),
  sprengsack: w('sprengsack', 'Sprengsack', 'place', 70, 5, 1),
  unterstand: w('unterstand', 'Unterstand', 'place', 0, 0, 1),
  melkschemel: w('melkschemel', 'Melkschemel-Wurf', 'arc', 15, 1, 3, true),
  heilkraeuter: w('heilkraeuter', 'Heilkräuter', 'heal', -30, 4, 3),
  kraeuterdampf: w('kraeuterdampf', 'Kräuterdampf', 'heal', -20, 8, 1),
  fernglas: w('fernglas', 'Fernglas-Schuss', 'straight', 35, 0, 3),
  glockenkoeder: w('glockenkoeder', 'Glockenköder', 'lure', 0, 6, 2, true),
  tarnung: w('tarnung', 'Tarnung', 'self', 0, 0, 1),
  zugende: w('zugende', 'Zug beenden', 'self', 0, 0, Infinity),
} as const satisfies Record<string, Weapon>;

export type WeaponId = keyof typeof WEAPONS;
