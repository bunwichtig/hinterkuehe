import type { Rules } from '../config/settings';
import { CAREERS, RANK_XP, XP, maxHpFor, pendingPromotion, titleFor, type Branch } from './careers';
import { createRng, randInt } from './rng';
import { WATER_LEVEL, generateTerrain, heightAt, type Terrain } from './terrain';
import type { Bunker, Cow, Phase, Snapshot, Team } from './types';

/** Höfe mit Farben. Eigene Gestaltung, siehe docs/konzept.md, Kap. 2. */
export const TEAM_STYLES = [
  { name: 'Lindenhof', color: '#d64933' },
  { name: 'Moorhof', color: '#2e86ab' },
  { name: 'Bergerhof', color: '#f2a541' },
  { name: 'Eichhof', color: '#4c9a2a' },
] as const;

const COW_NAMES = ['Berta', 'Elsa', 'Frieda', 'Gerti', 'Liesl', 'Mira', 'Resi', 'Zenzi', 'Vroni', 'Kathi'];

/** Laufgeschwindigkeit in m/s und Grundkosten an Ausdauer pro Meter. */
export const WALK_SPEED = 3;
export const STAMINA_PER_M = 4;
export const JUMP_COST = 10;
/** Ausdauer-Bonus, wenn ein Zug ohne Aktion endet. */
export const REST_BONUS = 0.2;

/**
 * Spiellogik, läuft nur beim Host.
 *
 * Schnittstelle wie in der Technik-Vorlage (Kap. 20, Schritt 4):
 * addPlayer, removePlayer, startMatch, step, snapshot, phase.
 *
 * Stand: Gerüst mit Zugablauf, freier Kuhwahl, Ausdauer, Erfahrung und Beförderung.
 * Geschosse, Bunker-Treffer und Kisten folgen mit dem Prototyp.
 */
export class Game {
  phase: Phase = 'lobby';
  round = 0;
  teams: Team[] = [];
  cows: Cow[] = [];
  bunkers: Bunker[] = [];
  activeTeam = -1;
  activeCow: string | null = null;
  timeLeftMs = 0;
  wind: [number, number] = [0, 0];
  mapSeed = 0;
  terrain: Terrain | null = null;
  craters: [number, number, number, number][] = [];
  msg = '';
  /** Ob in diesem Zug schon eine Aktion ausgeführt wurde. */
  actedThisTurn = false;
  private rules: Rules | null = null;
  private rng = createRng(1);
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

  cow(id: string | null): Cow | undefined {
    return id === null ? undefined : this.cows.find((c) => c.id === id);
  }

  /** Startet eine neue Runde. rulesFor() wird vorher zu jeder Runde neu aufgerufen. */
  startMatch(rules: Rules, seed: number): void {
    const used = [...new Set(this.players.values())].sort((a, b) => a - b);
    if (used.length < 2) throw new Error('Mindestens zwei Höfe nötig');
    this.rules = rules;
    this.rng = createRng(seed);
    this.mapSeed = seed;
    this.terrain = generateTerrain(seed);
    this.craters = [];
    this.round += 1;

    this.teams = used.map((index) => ({
      index,
      ...TEAM_STYLES[index % TEAM_STYLES.length]!,
      players: [...this.players].filter(([, t]) => t === index).map(([id]) => id),
    }));

    const spots = this.landSpots(this.teams.length * (rules.cowsPerTeam + rules.bunkersPerTeam));
    const career = 'jungrind';
    const rank = 1;
    this.cows = [];
    this.bunkers = [];
    let n = 0;
    for (const team of this.teams) {
      for (let c = 0; c < rules.cowsPerTeam; c++) {
        const [x, z] = spots[n++]!;
        const maxHp = maxHpFor(rules.hp, career, rank);
        this.cows.push({
          id: `k${team.index}-${c}`,
          team: team.index,
          name: COW_NAMES[(c + team.index * 3) % COW_NAMES.length]!,
          x,
          y: heightAt(this.terrain, x, z),
          z,
          heading: randInt(this.rng, 0, 359),
          hp: maxHp,
          maxHp,
          alive: true,
          career,
          rank,
          // Startrang > 1: genug EP, damit die Beförderung beim ersten Zug ansteht.
          xp: rules.promotion ? RANK_XP[rules.startRank - 1]! : 0,
          stamina: 0,
          restBonus: 0,
          used: false,
          needsBranch: false,
        });
      }
      for (let b = 0; b < rules.bunkersPerTeam; b++) {
        const [x, z] = spots[n++]!;
        const material = this.rng() < 0.5 ? 'holz' : 'stein';
        this.bunkers.push({ x, z, facing: randInt(this.rng, 0, 3) * 90, material, hp: material === 'holz' ? 150 : 300 });
      }
    }

    this.activeTeam = this.teams[randInt(this.rng, 0, this.teams.length - 1)]!.index;
    this.beginTurn();
  }

  /** Kühe, die der Hof am Zug jetzt wählen darf. */
  selectableCows(): Cow[] {
    return this.cows.filter((c) => c.team === this.activeTeam && c.alive && !c.used);
  }

  /** Spieler wählt zu Beginn des Zugs eine Kuh. */
  selectCow(cowId: string): boolean {
    if (this.phase !== 'select' || !this.rules) return false;
    const cow = this.selectableCows().find((c) => c.id === cowId);
    if (!cow) return false;
    this.activeCow = cow.id;
    cow.used = true;
    this.applyPromotion(cow);
    const base = CAREERS[cow.career].stamina * this.rules.staminaFactor;
    cow.stamina = Math.round(base * (1 + cow.restBonus));
    cow.restBonus = 0;
    this.phase = 'move';
    this.msg = `${this.teamName(cow.team)}: ${titleFor(cow.career, cow.rank)} ${cow.name}`;
    return true;
  }

  /** Jungrind wählt bei der ersten Beförderung seine Laufbahn. */
  chooseBranch(cowId: string, branch: Branch): boolean {
    const cow = this.cow(cowId);
    if (!cow || !cow.needsBranch) return false;
    cow.career = branch;
    cow.needsBranch = false;
    this.applyPromotion(cow);
    return true;
  }

  /**
   * Läuft mit der aktiven Kuh in Richtung (dirX, dirZ) für dt Sekunden.
   * Bergauf kostet mehr Ausdauer, Wasser und Kartenrand stoppen.
   */
  walk(dirX: number, dirZ: number, dt: number): void {
    const cow = this.cow(this.activeCow);
    if (this.phase !== 'move' || !cow || !this.terrain) return;
    const len = Math.hypot(dirX, dirZ);
    if (len === 0 || cow.stamina <= 0) return;
    const step = WALK_SPEED * dt;
    const nx = cow.x + (dirX / len) * step;
    const nz = cow.z + (dirZ / len) * step;
    const ny = heightAt(this.terrain, nx, nz);
    if (ny < WATER_LEVEL + 0.2) return;
    const climb = Math.max(0, ny - cow.y) / step;
    if (climb > 1.5) return; // zu steil
    const cost = step * STAMINA_PER_M * (1 + climb * 2);
    if (cost > cow.stamina) {
      cow.stamina = 0;
      return;
    }
    cow.stamina -= cost;
    cow.x = nx;
    cow.z = nz;
    cow.y = ny;
    cow.heading = (Math.atan2(-dirZ, dirX) * 180) / Math.PI;
  }

  /** Erfahrung gutschreiben (Beförderung wird beim nächsten Zug der Kuh wirksam). */
  addXp(cowId: string, amount: number): void {
    const cow = this.cow(cowId);
    if (cow && this.rules?.promotion) cow.xp += amount;
  }

  /** Schaden an einer Kuh; `from` bekommt Erfahrung. */
  damage(cowId: string, amount: number, from?: string): void {
    const cow = this.cow(cowId);
    if (!cow || !cow.alive) return;
    const dealt = Math.min(cow.hp, Math.max(0, Math.round(amount)));
    cow.hp -= dealt;
    const attacker = this.cow(from ?? null);
    const enemy = attacker && attacker.team !== cow.team;
    if (enemy) this.addXp(attacker.id, Math.floor(dealt / 10) * XP.damagePer10);
    if (cow.hp <= 0) {
      cow.alive = false;
      if (enemy) this.addXp(attacker.id, XP.sentHome);
    }
  }

  /** Markiert, dass die aktive Kuh ihre Aktion benutzt hat. */
  act(): void {
    if (this.phase !== 'move') return;
    this.actedThisTurn = true;
    this.phase = 'resolve';
    this.timeLeftMs = 0;
  }

  step(dt: number): void {
    if (this.phase === 'lobby' || this.phase === 'roundEnd' || !this.rules) return;
    if (this.phase === 'resolve') {
      // Platzhalter: Geschossflug folgt mit dem Prototyp.
      this.endTurn();
      return;
    }
    this.timeLeftMs -= dt * 1000;
    if (this.timeLeftMs <= 0) this.endTurn();
  }

  /** Beendet den Zug und gibt an den nächsten Hof mit lebenden Kühen weiter. */
  endTurn(): void {
    const cow = this.cow(this.activeCow);
    if (cow && !this.actedThisTurn) cow.restBonus = REST_BONUS;
    const alive = this.teams.filter((t) => this.cows.some((c) => c.team === t.index && c.alive));
    if (alive.length <= 1) {
      this.phase = 'roundEnd';
      this.activeCow = null;
      this.msg = alive.length === 1 ? `${alive[0]!.name} gewinnt die Runde` : 'Unentschieden';
      for (const c of this.cows) if (c.alive) this.addXp(c.id, XP.survivedRound);
      return;
    }
    const pos = alive.findIndex((t) => t.index === this.activeTeam);
    this.activeTeam = alive[(pos + 1) % alive.length]!.index;
    this.beginTurn();
  }

  private beginTurn(): void {
    if (this.selectableCows().length === 0) {
      for (const c of this.cows) if (c.team === this.activeTeam) c.used = false;
    }
    this.activeCow = null;
    this.actedThisTurn = false;
    this.phase = 'select';
    this.timeLeftMs = this.rules!.turnMs;
    const angle = this.rng() * Math.PI * 2;
    const strength = this.rng() * this.rules!.windMax;
    this.wind = [round(Math.cos(angle) * strength, 2), round(Math.sin(angle) * strength, 2)];
    this.msg = `${this.teamName(this.activeTeam)} ist dran – Kuh wählen`;
  }

  private applyPromotion(cow: Cow): void {
    if (!this.rules?.promotion) return;
    const target = pendingPromotion(cow.rank, cow.xp);
    if (target === null) return;
    if (cow.career === 'jungrind') {
      cow.needsBranch = true;
      return;
    }
    const before = cow.maxHp;
    cow.rank = target;
    cow.maxHp = maxHpFor(this.rules.hp, cow.career, cow.rank);
    cow.hp = Math.max(1, cow.hp + (cow.maxHp - before));
    this.msg = `${cow.name} wird befördert: ${titleFor(cow.career, cow.rank)}`;
  }

  private teamName(index: number): string {
    return this.teams.find((t) => t.index === index)?.name ?? '?';
  }

  private leastFilledTeam(): number {
    const counts = [0, 0];
    for (const t of this.players.values()) counts[t] = (counts[t] ?? 0) + 1;
    let best = 0;
    for (let i = 1; i < counts.length; i++) if ((counts[i] ?? 0) < (counts[best] ?? 0)) best = i;
    return best;
  }

  /** Zufällige Plätze auf trockenem, nicht zu steilem Land mit Mindestabstand. */
  private landSpots(count: number): [number, number][] {
    const t = this.terrain!;
    const span = (t.size - 1) * t.cell;
    const spots: [number, number][] = [];
    let minDist = span / 6;
    for (let tries = 0; spots.length < count; tries++) {
      if (tries > 0 && tries % 400 === 0) minDist *= 0.8;
      const x = span * (0.15 + this.rng() * 0.7);
      const z = span * (0.15 + this.rng() * 0.7);
      if (heightAt(t, x, z) < WATER_LEVEL + 0.8) continue;
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < minDist)) continue;
      spots.push([round(x, 2), round(z, 2)]);
    }
    return spots;
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
      bunkers: this.bunkers.map((b) => [b.x, b.z, b.facing, b.material, b.hp]),
      teams: this.teams.map(({ index, name, color }) => ({ index, name, color })),
      cows: this.cows
        .filter((c) => c.alive)
        .map((c) => [
          c.id,
          c.team,
          round(c.x, 2),
          round(c.y, 2),
          round(c.z, 2),
          Math.round(c.heading),
          c.hp,
          c.maxHp,
          c.career,
          c.rank,
          Math.round(c.stamina),
          c.used,
        ]),
      msg: this.msg,
    };
  }
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
