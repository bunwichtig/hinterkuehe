/**
 * Laufbahnen, Ränge und Beförderung. Siehe docs/konzept.md, Kap. 4.
 *
 * Jede Kuh startet als Jungrind (Laufbahn 'jungrind', Rang 1). Ab Rang 2 gehört
 * sie zu einer der vier Laufbahnen und steigt darin bis Rang 4 auf.
 */
import type { WeaponId } from './weapons';

export type Career = 'jungrind' | 'feuer' | 'technik' | 'pflege' | 'schleichen';
export const BRANCHES = ['feuer', 'technik', 'pflege', 'schleichen'] as const satisfies readonly Career[];
export type Branch = (typeof BRANCHES)[number];

/** EP-Schwellen: Rang n wird ab RANK_XP[n - 1] erreicht. */
export const RANK_XP = [0, 10, 25, 45] as const;
export const MAX_RANK = RANK_XP.length;
/** Zusätzliche maximale Lebenspunkte je Beförderung. */
export const HP_PER_RANK = 10;

/** Erfahrung pro Ereignis. */
export const XP = {
  damagePer10: 1,
  sentHome: 5,
  healPer10: 1,
  crate: 1,
  survivedRound: 2,
} as const;

export interface CareerInfo {
  label: string;
  /** Titel je Rang (Index 0 = Rang 1). Jungrind hat nur Rang 1. */
  titles: string[];
  /** Grund-Ausdauer pro Zug. */
  stamina: number;
  /** Lebenspunkte relativ zum eingestellten Grundwert. */
  hpBonus: number;
  /** Waffen, die je Rang dazukommen (Index 0 = Rang 1). */
  unlocks: WeaponId[][];
}

const BASE: WeaponId[] = ['hornstoss', 'mistgabel', 'milchkanne', 'zugende'];

export const CAREERS: Record<Career, CareerInfo> = {
  jungrind: { label: 'Jungrind', titles: ['Jungrind'], stamina: 100, hpBonus: 0, unlocks: [BASE] },
  feuer: {
    label: 'Feuer',
    titles: ['Jungrind', 'Schleuderkuh', 'Kanonierin', 'Donnerkuh'],
    stamina: 80,
    hpBonus: 20,
    unlocks: [BASE, ['heuschleuder'], ['kuerbismoerser'], ['heuhagel']],
  },
  technik: {
    label: 'Technik',
    titles: ['Jungrind', 'Pionierin', 'Zaunmeisterin', 'Sprengmeisterin'],
    stamina: 100,
    hpBonus: 0,
    unlocks: [BASE, ['fladenmine'], ['weidezaun', 'sprengsack'], ['unterstand']],
  },
  pflege: {
    label: 'Pflege',
    titles: ['Jungrind', 'Melkerin', 'Hofärztin', 'Kräuterkundige'],
    stamina: 110,
    hpBonus: 0,
    unlocks: [BASE, ['melkschemel', 'heilkraeuter'], ['kraeuterdampf'], []],
  },
  schleichen: {
    label: 'Schleichen',
    titles: ['Jungrind', 'Späherin', 'Nachtkuh', 'Schattenkuh'],
    stamina: 140,
    hpBonus: -10,
    unlocks: [BASE, ['fernglas'], ['glockenkoeder', 'tarnung'], []],
  },
};

/** Rang, der zu einer EP-Zahl gehört. */
export function rankForXp(xp: number): number {
  let rank = 1;
  for (let i = 0; i < RANK_XP.length; i++) if (xp >= RANK_XP[i]!) rank = i + 1;
  return rank;
}

/** Alle Waffen, die eine Kuh mit dieser Laufbahn und diesem Rang hat. */
export function weaponsFor(career: Career, rank: number): WeaponId[] {
  const unlocks = CAREERS[career].unlocks;
  return unlocks.slice(0, Math.min(rank, unlocks.length)).flat();
}

export function titleFor(career: Career, rank: number): string {
  const t = CAREERS[career].titles;
  return t[Math.min(rank, t.length) - 1]!;
}

/** Maximale Lebenspunkte aus Grundwert, Laufbahn und Rang. */
export function maxHpFor(baseHp: number, career: Career, rank: number): number {
  const bonus = career === 'jungrind' ? 0 : CAREERS[career].hpBonus;
  return baseHp + bonus + (rank - 1) * HP_PER_RANK;
}

/**
 * Prüft, ob eine Beförderung ansteht. Rückgabe: neuer Rang oder null.
 * Ein Jungrind braucht dafür zuerst eine Laufbahn (siehe Game.chooseBranch).
 */
export function pendingPromotion(rank: number, xp: number): number | null {
  const target = rankForXp(xp);
  return target > rank ? target : null;
}
