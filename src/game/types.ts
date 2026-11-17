/** Spielphasen, siehe docs/konzept.md „Zugablauf“. */
export type Phase = 'lobby' | 'turn' | 'retreat' | 'settle' | 'roundEnd';

export interface Cow {
  id: string;
  team: number;
  name: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  /** Blickrichtung: -1 links, 1 rechts. */
  facing: -1 | 1;
}

export interface Team {
  index: number;
  name: string;
  color: string;
  /** Spieler-IDs, die dieses Team steuern (abwechselnd). */
  players: string[];
  /** Index der Kuh, die als Nächstes in diesem Team dran ist. */
  nextCow: number;
}

/** Kleiner Spielstand, den der Host an alle schickt. */
export interface Snapshot {
  phase: Phase;
  round: number;
  /** Team, das gerade am Zug ist (-1 in der Lobby). */
  activeTeam: number;
  /** ID der Kuh, die gerade am Zug ist. */
  activeCow: string | null;
  /** Restzeit des Zugs in ganzen Sekunden. */
  timeLeft: number;
  wind: number;
  /** Seed der Karte; Krater kommen als eigene Liste dazu. */
  mapSeed: number;
  craters: [x: number, y: number, r: number][];
  teams: { index: number; name: string; color: string }[];
  cows: [id: string, team: number, x: number, y: number, hp: number, facing: -1 | 1][];
  msg: string;
}
