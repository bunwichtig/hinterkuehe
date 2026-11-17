/**
 * Einstellungs-System von Hinterkühe.
 *
 * Gleiches Muster wie in der Technik-Vorlage (spiel-technik-und-optionen.md, Kap. 7):
 *
 *   Formular ──read──▶ cleanSettings() ──▶ settings ──rulesFor()──▶ rules
 *
 * 1. DEFAULT_SETTINGS  – Standardwerte (das, was der Host in der Lobby sieht).
 * 2. cleanSettings(o)  – macht aus beliebigen Daten gültige Einstellungen.
 * 3. rulesFor(s, n)    – macht daraus die tatsächlich gespielten Regeln.
 * 4. Die Spiellogik liest ausschließlich `rules`, nie `settings`.
 *
 * Neue Option: Schlüssel in DEFAULT_SETTINGS + eine Zeile in cleanSettings
 * + Formularfeld mit gleichem `name` + ggf. Sonderregel in rulesFor.
 */

export const MODES = ['klassisch', 'individuell'] as const;
export const WIND_LEVELS = ['aus', 'leicht', 'normal', 'stark'] as const;
export const MAPS = ['zufall', 'alm', 'moor', 'kornfeld', 'steinbruch', 'winterweide'] as const;
export const BUNKER_LEVELS = ['keine', 'wenige', 'normal', 'viele'] as const;
export const CRATE_LEVELS = ['aus', 'wenig', 'normal', 'viel'] as const;

export type Mode = (typeof MODES)[number];
export type WindLevel = (typeof WIND_LEVELS)[number];
export type MapName = (typeof MAPS)[number];
export type CrateLevel = (typeof CRATE_LEVELS)[number];
export type BunkerLevel = (typeof BUNKER_LEVELS)[number];

export interface Settings {
  mode: Mode;
  /** Kühe pro Hof. */
  teamSize: number;
  /** Lebenspunkte eines Jungrinds zu Rundenbeginn. */
  hp: number;
  /** Zugzeit in Sekunden. */
  turnTime: number;
  /** Ausdauer pro Zug in Prozent des Grundwerts der Laufbahn. */
  stamina: number;
  wind: WindLevel;
  map: MapName;
  bunkers: BunkerLevel;
  crates: CrateLevel;
  /** Kühe sammeln Erfahrung und werden befördert. */
  promotion: boolean;
  /** Rang, mit dem alle Kühe starten (1 = Jungrind). */
  startRank: number;
  fallDamage: boolean;
  /** Minuten bis zum Hochwasser (Sudden Death), 0 = aus. */
  floodAfter: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  mode: 'klassisch',
  teamSize: 4,
  hp: 100,
  turnTime: 60,
  stamina: 100,
  wind: 'normal',
  map: 'zufall',
  bunkers: 'normal',
  crates: 'normal',
  promotion: true,
  startRank: 1,
  fallDamage: true,
  floodAfter: 20,
});

/** Grenzen und Schrittweiten der Zahlenwerte. */
export const LIMITS = {
  teamSize: { min: 2, max: 6, step: 1 },
  hp: { min: 50, max: 200, step: 25 },
  turnTime: { min: 30, max: 120, step: 10 },
  stamina: { min: 50, max: 200, step: 25 },
  startRank: { min: 1, max: 4, step: 1 },
  floodAfter: { min: 0, max: 40, step: 5 },
} as const;

type NumKey = keyof typeof LIMITS;

function pick<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function num(key: NumKey, value: unknown): number {
  const { min, max, step } = LIMITS[key];
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_SETTINGS[key];
  const clamped = Math.min(max, Math.max(min, n));
  return Math.min(max, min + Math.round((clamped - min) / step) * step);
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'on' || value === '1') return true;
  if (value === 'false' || value === 'off' || value === '0') return false;
  return fallback;
}

/** Macht aus beliebigen Daten (Formular, Speicher, Netzwerk) gültige Einstellungen. */
export function cleanSettings(input: unknown): Settings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    mode: pick(MODES, o.mode, d.mode),
    teamSize: num('teamSize', o.teamSize),
    hp: num('hp', o.hp),
    turnTime: num('turnTime', o.turnTime),
    stamina: num('stamina', o.stamina),
    wind: pick(WIND_LEVELS, o.wind, d.wind),
    map: pick(MAPS, o.map, d.map),
    bunkers: pick(BUNKER_LEVELS, o.bunkers, d.bunkers),
    crates: pick(CRATE_LEVELS, o.crates, d.crates),
    promotion: bool(o.promotion, d.promotion),
    startRank: num('startRank', o.startRank),
    fallDamage: bool(o.fallDamage, d.fallDamage),
    floodAfter: num('floodAfter', o.floodAfter),
  };
}

/** Die tatsächlich gespielten Regeln. Nur diese liest die Spiellogik. */
export interface Rules {
  cowsPerTeam: number;
  hp: number;
  turnMs: number;
  /** Faktor auf die Grund-Ausdauer der Laufbahn (1 = 100 %). */
  staminaFactor: number;
  /** Höchste Windbeschleunigung in m/s² auf Bogengeschosse, 0 = kein Wind. */
  windMax: number;
  map: Exclude<MapName, 'zufall'>;
  /** Bunker pro Hof auf der Karte. */
  bunkersPerTeam: number;
  /** Wahrscheinlichkeit pro Zug, dass eine Kiste abgeworfen wird. */
  crateChance: number;
  promotion: boolean;
  startRank: number;
  fallDamage: boolean;
  floodAfterMs: number;
}

const WIND_MAX: Record<WindLevel, number> = { aus: 0, leicht: 1.5, normal: 3, stark: 5 };
const BUNKERS: Record<BunkerLevel, number> = { keine: 0, wenige: 1, normal: 2, viele: 3 };
const CRATE_CHANCE: Record<CrateLevel, number> = { aus: 0, wenig: 0.15, normal: 0.3, viel: 0.6 };

/** Werte, die der Modus „Klassisch“ fest vorgibt. */
export const CLASSIC: Readonly<Partial<Settings>> = Object.freeze({
  hp: 100,
  turnTime: 60,
  stamina: 100,
  wind: 'normal',
  bunkers: 'normal',
  crates: 'normal',
  promotion: true,
  startRank: 1,
  fallDamage: true,
  floodAfter: 20,
});

/**
 * Regeln für eine Runde. Wird zu jeder Runde neu aufgerufen, damit Änderungen
 * des Hosts „ab nächster Runde“ gelten.
 *
 * @param pickMap  liefert eine Karte, wenn `map` auf „zufall“ steht (seed-basiert).
 */
export function rulesFor(
  input: Settings,
  teamCount: number,
  pickMap: (choices: readonly Exclude<MapName, 'zufall'>[]) => Exclude<MapName, 'zufall'> = (c) => c[0]!,
): Rules {
  const s: Settings = input.mode === 'klassisch' ? { ...input, ...CLASSIC } : input;
  const realMaps = MAPS.filter((m): m is Exclude<MapName, 'zufall'> => m !== 'zufall');
  // Bei vielen Höfen nicht mehr als 16 Kühe auf dem Feld.
  const maxPerTeam = Math.max(2, Math.floor(16 / Math.max(1, teamCount)));
  return {
    cowsPerTeam: Math.min(s.teamSize, maxPerTeam),
    hp: s.hp,
    turnMs: s.turnTime * 1000,
    staminaFactor: s.stamina / 100,
    windMax: WIND_MAX[s.wind],
    map: s.map === 'zufall' ? pickMap(realMaps) : s.map,
    bunkersPerTeam: BUNKERS[s.bunkers],
    crateChance: CRATE_CHANCE[s.crates],
    promotion: s.promotion,
    startRank: s.startRank,
    fallDamage: s.fallDamage,
    floodAfterMs: s.floodAfter * 60_000,
  };
}
