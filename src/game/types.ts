import type { Career } from './careers';

/**
 * Spielphasen, siehe docs/konzept.md „Zugablauf“.
 * select: Spieler wählt eine Kuh · move: laufen und zielen · resolve: Geschoss fliegt
 */
export type Phase = 'lobby' | 'select' | 'move' | 'resolve' | 'roundEnd';

export interface Cow {
  id: string;
  team: number;
  name: string;
  /** Position in Metern; y ist die Höhe. */
  x: number;
  y: number;
  z: number;
  /** Blickrichtung in Grad (0 = +x, gegen den Uhrzeigersinn von oben). */
  heading: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  career: Career;
  rank: number;
  xp: number;
  /** Ausdauer im aktuellen Zug. */
  stamina: number;
  /** Bonus-Ausdauer (Faktor) für den nächsten Zug, wenn der letzte ohne Aktion endete. */
  restBonus: number;
  /** Diese Kuh war im aktuellen Durchgang ihres Hofs schon dran. */
  used: boolean;
  /** Beförderung steht an, aber das Jungrind muss erst eine Laufbahn wählen. */
  needsBranch: boolean;
}

export interface Team {
  index: number;
  name: string;
  color: string;
  /** Spieler-IDs, die diesen Hof steuern (abwechselnd). */
  players: string[];
}

export interface Bunker {
  x: number;
  z: number;
  /** Ausrichtung der Schießscharte in Grad. */
  facing: number;
  material: 'holz' | 'stein';
  hp: number;
}

/** Kompakter Spielstand, den der Host an alle schickt. */
export interface Snapshot {
  phase: Phase;
  round: number;
  /** Zugzähler, steigt mit jedem neuen Zug. */
  turn: number;
  activeTeam: number;
  activeCow: string | null;
  /** Restzeit des Zugs in ganzen Sekunden. */
  timeLeft: number;
  /** Wind als Vektor [x, z] in m/s². */
  wind: [number, number];
  mapSeed: number;
  /** Krater: x, y, z, Radius. */
  craters: [number, number, number, number][];
  bunkers: [x: number, z: number, facing: number, material: 'holz' | 'stein', hp: number][];
  teams: { index: number; name: string; color: string }[];
  /** id, Hof, x, y, z, Blickrichtung, LP, max. LP, Laufbahn, Rang, Ausdauer, schon dran, Name, wählt Laufbahn */
  cows: [string, number, number, number, number, number, number, number, Career, number, number, boolean, string, boolean][];
  msg: string;
}
