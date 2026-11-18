import type { Career } from './careers';
import type { Theme } from './terrain';
import type { WeaponId } from './weapons';

/**
 * Spielphasen, siehe docs/konzept.md „Zugablauf“.
 * select: Spieler wählt eine Kuh · move: laufen, zielen, auslösen ·
 * resolve: Geschosse fliegen, Kühe fallen, danach nächster Zug · roundEnd: Pause vor der nächsten Runde
 */
export type Phase = 'lobby' | 'select' | 'move' | 'resolve' | 'roundEnd';

export interface Cow {
  id: string;
  team: number;
  name: string;
  /** Position in Metern; y ist die Höhe der Hufe. */
  x: number;
  y: number;
  z: number;
  /** Geschwindigkeit (nur in der Luft oder beim Rutschen). */
  vx: number;
  vy: number;
  vz: number;
  /** Fliegt (Sprung, Rückstoß, Sturz). */
  airborne: boolean;
  /** Rutscht nach der Landung noch. */
  sliding: boolean;
  /** Höchster Punkt des laufenden Flugs, für Fallschaden. */
  peakY: number;
  /** Blickrichtung in Grad (0 = +x, gegen den Uhrzeigersinn von oben). */
  heading: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Zug, in dem die Kuh heimgegangen ist (für die Wiederbelebung). */
  homeTurn: number;
  career: Career;
  rank: number;
  xp: number;
  /** Ausdauer im aktuellen Zug. */
  stamina: number;
  /** Bonus-Ausdauer (Faktor) für den nächsten Zug, wenn der letzte ohne Aktion endete. */
  restBonus: number;
  /** Betäubt (Melkschemel): halbe Ausdauer im nächsten Zug. */
  stunned: boolean;
  /** Ausdauer-Abzug im nächsten Zug (Glockenköder). */
  staminaPenalty: number;
  /** Getarnt: für Gegner unsichtbar bis zur nächsten eigenen Aktion. */
  hidden: boolean;
  /** Diese Kuh war im aktuellen Durchgang ihres Hofs schon dran. */
  used: boolean;
  /** Beförderung steht an, aber das Jungrind muss erst eine Laufbahn wählen. */
  needsBranch: boolean;
  /** Munition je Waffe in dieser Runde. */
  ammo: Partial<Record<WeaponId, number>>;
  /** Wer zuletzt getroffen hat (Erfahrung bei Sturz ins Wasser). */
  lastHitBy: string | null;
}

export interface Team {
  index: number;
  name: string;
  color: string;
  /** Spieler-IDs, die diesen Hof steuern (abwechselnd). */
  players: string[];
}

export interface Bunker {
  id: number;
  x: number;
  /** Bodenhöhe des Bunkers. */
  y: number;
  z: number;
  /** Ausrichtung der Schießscharte in Grad. */
  facing: number;
  material: 'holz' | 'stein';
  hp: number;
}

export interface Projectile {
  id: number;
  weapon: WeaponId;
  owner: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Restzeit des Zünders in s (Milchkanne). */
  fuse: number;
  age: number;
  /** Zurückgelegte Strecke (gerade Schüsse). */
  dist: number;
  /** Bunker, durch dessen Scharte der Schuss gerade fliegt. */
  slit: number | null;
}

export interface Mine {
  id: number;
  x: number;
  y: number;
  z: number;
  team: number;
  owner: string;
  /** Ab diesem Zug scharf. */
  armedTurn: number;
}

export interface Satchel {
  id: number;
  x: number;
  y: number;
  z: number;
  team: number;
  owner: string;
  /** Explodiert zu Beginn dieses Zugs. */
  explodeTurn: number;
}

export interface Fence {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Richtung der Zaunlinie in Grad. */
  angle: number;
  hp: number;
}

export type CrateKind = 'futter' | 'waffe' | 'ausdauer' | 'erfahrung' | 'schreck';

export interface Crate {
  id: number;
  kind: CrateKind;
  x: number;
  y: number;
  z: number;
  landed: boolean;
}

/**
 * Ereignisse für Bild und Ton (Explosion, Platschen, Heilung …).
 * Der Host zählt sie hoch; jede Anzeige spielt nur Ereignisse mit neuer Nummer ab.
 */
export type FxKind =
  | 'boom'
  | 'home'
  | 'splash'
  | 'heal'
  | 'dmg'
  | 'crate'
  | 'promo'
  | 'shot'
  | 'bell'
  | 'stun'
  | 'build'
  | 'click'
  | 'flood'
  | 'puff'
  | 'jump'
  | 'melee'
  | 'cloak'
  | 'revive'
  | 'collapse';

/** id, Art, x, y, z, Wert (Radius, Schaden, Heilung …) */
export type Fx = [id: number, kind: FxKind, x: number, y: number, z: number, value: number];

/** id, Hof, x, y, z, Blickrichtung, LP, max. LP, Laufbahn, Rang, Ausdauer, schon dran, Name, wählt Laufbahn, EP, getarnt */
export type CowTuple = [
  id: string,
  team: number,
  x: number,
  y: number,
  z: number,
  heading: number,
  hp: number,
  maxHp: number,
  career: Career,
  rank: number,
  stamina: number,
  used: boolean,
  name: string,
  needsBranch: boolean,
  xp: number,
  hidden: boolean,
];

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
  map: Theme;
  /** Wasserstand in m (steigt bei Hochwasser). */
  water: number;
  /** Sekunden bis zum Hochwasser, 0 = es steigt schon, -1 = aus. */
  floodIn: number;
  /** Krater: x, y, z, Radius. */
  craters: [number, number, number, number][];
  bunkers: [id: number, x: number, y: number, z: number, facing: number, material: 'holz' | 'stein', hp: number][];
  teams: { index: number; name: string; color: string }[];
  cows: CowTuple[];
  /** Fliegende Geschosse: id, Waffe, x, y, z */
  proj: [number, WeaponId, number, number, number][];
  /** Minen: id, x, y, z, Hof, scharf */
  mines: [number, number, number, number, number, boolean][];
  /** Sprengsäcke: id, x, y, z, Hof, Züge bis zur Explosion */
  satchels: [number, number, number, number, number, number][];
  /** Zäune: id, x, y, z, Winkel, LP */
  fences: [number, number, number, number, number, number][];
  /** Kisten: id, x, y, z, gelandet */
  crates: [number, number, number, number, boolean][];
  /** Letzte Ereignisse für Bild und Ton. */
  fx: Fx[];
  /** Waffen der aktiven Kuh: Waffe, Munition (-1 = unbegrenzt). */
  arsenal: [WeaponId, number][];
  /** Ob die aktive Kuh ihre Aktion schon benutzt hat. */
  acted: boolean;
  /** Zielen des Spielers am Zug (für Zuschauer): Richtung, Neigung, Waffe. */
  aim: [number, number, WeaponId] | null;
  /** Sieger der Runde (nur bei roundEnd), null = Unentschieden. */
  winner: number | null;
  msg: string;
}
