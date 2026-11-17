import type { Rules } from '../config/settings';
import { createRng, randInt } from './rng';
import { generateTerrain, type Terrain } from './terrain';
import type { Cow, Phase, Snapshot, Team } from './types';

/** Teamfarben und -namen. Eigene Gestaltung, siehe docs/konzept.md. */
export const TEAM_STYLES = [
  { name: 'Fleckvieh', color: '#e4572e' },
  { name: 'Braunvieh', color: '#8a5a44' },
  { name: 'Schwarzbunte', color: '#2e86ab' },
  { name: 'Hochlandrinder', color: '#f2a541' },
] as const;

const COW_NAMES = ['Berta', 'Elsa', 'Frieda', 'Gerti', 'Liesl', 'Mira', 'Resi', 'Zenzi'];

/**
 * Spiellogik, läuft nur beim Host.
 *
 * Schnittstelle wie in der Technik-Vorlage (Kap. 20, Schritt 4):
 * addPlayer, removePlayer, startMatch, step, snapshot, phase.
 *
 * Stand: Gerüst. Physik, Waffen und Schaden folgen mit dem Prototyp (Schritt 3).
 */
export class Game {
  phase: Phase = 'lobby';
  round = 0;
  teams: Team[] = [];
  cows: Cow[] = [];
  activeTeam = -1;
  activeCow: string | null = null;
  timeLeftMs = 0;
  wind = 0;
  mapSeed = 0;
  terrain: Terrain | null = null;
  craters: [number, number, number][] = [];
  msg = '';
  private rules: Rules | null = null;
  private rng = createRng(1);
  /** Spieler-ID → Teamindex. */
  private players = new Map<string, number>();

  addPlayer(id: string, team?: number): number {
    const t = team ?? this.leastFilledTeam();
    this.players.set(id, t);
    return t;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    for (const team of this.teams) team.players = team.players.filter((p) => p !== id);
  }

  get playerCount(): number {
    return this.players.size;
  }

  /** Startet eine neue Runde mit den übergebenen Regeln (rulesFor zu jeder Runde neu). */
  startMatch(rules: Rules, seed: number): void {
    const used = [...new Set(this.players.values())].sort((a, b) => a - b);
    if (used.length < 2) throw new Error('Mindestens zwei Teams nötig');
    this.rules = rules;
    this.rng = createRng(seed);
    this.mapSeed = seed;
    this.terrain = generateTerrain(seed);
    this.craters = [];
    this.round += 1;

    this.teams = used.map((index) => ({
      index,
      name: TEAM_STYLES[index % TEAM_STYLES.length]!.name,
      color: TEAM_STYLES[index % TEAM_STYLES.length]!.color,
      players: [...this.players].filter(([, t]) => t === index).map(([id]) => id),
      nextCow: 0,
    }));

    this.cows = [];
    const total = this.teams.length * rules.cowsPerTeam;
    const slots = this.spawnSlots(total);
    let n = 0;
    for (let c = 0; c < rules.cowsPerTeam; c++) {
      for (const team of this.teams) {
        const x = slots[n++]!;
        this.cows.push({
          id: `k${team.index}-${c}`,
          team: team.index,
          name: COW_NAMES[c % COW_NAMES.length]!,
          x,
          y: this.terrain.ground[Math.round(x)]!,
          hp: rules.hp,
          alive: true,
          facing: x < this.terrain.width / 2 ? 1 : -1,
        });
      }
    }

    this.activeTeam = this.teams[randInt(this.rng, 0, this.teams.length - 1)]!.index;
    this.beginTurn();
  }

  /** Feste Schrittweite in Sekunden. */
  step(dt: number): void {
    if (this.phase === 'lobby' || this.phase === 'roundEnd' || !this.rules) return;
    this.timeLeftMs -= dt * 1000;
    if (this.timeLeftMs > 0) return;
    if (this.phase === 'turn') {
      // Zeit abgelaufen ohne Schuss: Zug endet sofort.
      this.endTurn();
    } else if (this.phase === 'retreat') {
      this.phase = 'settle';
      this.timeLeftMs = 0;
    } else if (this.phase === 'settle') {
      this.endTurn();
    }
  }

  /** Beendet den Zug und gibt an das nächste Team mit lebenden Kühen weiter. */
  endTurn(): void {
    const alive = this.teams.filter((t) => this.cows.some((c) => c.team === t.index && c.alive));
    if (alive.length <= 1) {
      this.phase = 'roundEnd';
      this.activeCow = null;
      this.msg = alive.length === 1 ? `${alive[0]!.name} gewinnt die Runde` : 'Unentschieden';
      return;
    }
    const pos = alive.findIndex((t) => t.index === this.activeTeam);
    this.activeTeam = alive[(pos + 1) % alive.length]!.index;
    this.beginTurn();
  }

  private beginTurn(): void {
    const team = this.teams.find((t) => t.index === this.activeTeam)!;
    const own = this.cows.filter((c) => c.team === team.index && c.alive);
    const cow = own[team.nextCow % own.length]!;
    team.nextCow = (team.nextCow + 1) % own.length;
    this.activeCow = cow.id;
    this.phase = 'turn';
    this.timeLeftMs = this.rules!.turnMs;
    this.wind = Math.round((this.rng() * 2 - 1) * this.rules!.windMax);
    this.msg = `${team.name}: ${cow.name} ist dran`;
  }

  private leastFilledTeam(): number {
    const counts = [0, 0];
    for (const t of this.players.values()) counts[t] = (counts[t] ?? 0) + 1;
    let best = 0;
    for (let i = 1; i < counts.length; i++) if ((counts[i] ?? 0) < (counts[best] ?? 0)) best = i;
    return best;
  }

  /** Gleichmäßig verteilte Startplätze mit etwas Zufall, gemischt. */
  private spawnSlots(count: number): number[] {
    const w = this.terrain!.width;
    const gap = w / (count + 1);
    const xs = Array.from({ length: count }, (_, i) => gap * (i + 1) + (this.rng() - 0.5) * gap * 0.5);
    for (let i = xs.length - 1; i > 0; i--) {
      const j = randInt(this.rng, 0, i);
      [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
    return xs;
  }

  snapshot(): Snapshot {
    return {
      phase: this.phase,
      round: this.round,
      activeTeam: this.activeTeam,
      activeCow: this.activeCow,
      timeLeft: Math.ceil(Math.max(0, this.timeLeftMs) / 1000),
      wind: this.wind,
      mapSeed: this.mapSeed,
      craters: this.craters,
      teams: this.teams.map(({ index, name, color }) => ({ index, name, color })),
      cows: this.cows
        .filter((c) => c.alive)
        .map((c) => [c.id, c.team, Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, c.hp, c.facing]),
      msg: this.msg,
    };
  }
}
