import type { Rules } from '../config/settings';
import { CAREERS, RANK_XP, XP, maxHpFor, pendingPromotion, titleFor, weaponsFor, type Branch, type Career } from './careers';
import { createRng, randInt } from './rng';
import { THEMES, WATER_LEVEL, carveCrater, generateTerrain, heightAt, inside, spanOf, type Terrain } from './terrain';
import type { Bunker, Cow, Crate, CrateKind, Fence, Fx, FxKind, Mine, Phase, Projectile, Satchel, Snapshot, Team } from './types';
import { CRATE_WEAPONS, GRAVITY, WEAPONS, WEAPON_IDS, dirOf, isWeaponId, launchVelocity, type WeaponId } from './weapons';

/** Höfe mit Farben. Eigene Gestaltung, siehe docs/konzept.md, Kap. 2. */
export const TEAM_STYLES = [
  { name: 'Lindenhof', color: '#d64933' },
  { name: 'Moorhof', color: '#2e86ab' },
  { name: 'Bergerhof', color: '#f2a541' },
  { name: 'Eichhof', color: '#4c9a2a' },
] as const;

const COW_NAMES = ['Berta', 'Elsa', 'Frieda', 'Gerti', 'Liesl', 'Mira', 'Resi', 'Zenzi', 'Vroni', 'Kathi', 'Hanni', 'Loni'];

/** Laufgeschwindigkeit in m/s und Grundkosten an Ausdauer pro Meter. */
export const WALK_SPEED = 3;
export const STAMINA_PER_M = 4;
export const JUMP_COST = 10;
/** Ausdauer-Bonus, wenn ein Zug ohne Aktion endet. */
export const REST_BONUS = 0.2;
/** Wartezeit, wenn alles zur Ruhe gekommen ist, bevor der nächste Zug beginnt. */
export const SETTLE_MS = 900;
/** Trefferkugel einer Kuh: Radius und Höhe des Mittelpunkts über den Hufen. */
export const COW_RADIUS = 0.9;
export const COW_CENTER = 1.1;
/** Fallschaden: sicher bis 4 m, danach 5 LP pro Meter. */
export const FALL_SAFE = 4;
export const FALL_DMG_PER_M = 5;
/** Bunker: halbe Länge (Scharte an +x), halbe Breite, Höhe. */
export const BUNKER_HALF_X = 2;
export const BUNKER_HALF_Z = 1.7;
export const BUNKER_HEIGHT = 2.4;
/** Schaden an allen Kühen in einem einstürzenden Bunker. */
export const BUNKER_COLLAPSE_DMG = 30;
/** Zaun: halbe Länge und Höhe. */
export const FENCE_HALF = 1.6;
export const FENCE_HEIGHT = 1.8;
export const SATCHEL_TURNS = 3;
/** Kisten sinken am Heu-Fallschirm mit 3 m/s. */
export const CRATE_FALL = 3;
export const MAX_FX = 30;
/** Höchster Winkel, um den eine Kuh im Bunker neben der Scharte vorbei zielen kann. */
export const SLIT_CONE = 45;

const CRATE_KINDS: [CrateKind, number][] = [
  ['futter', 30],
  ['waffe', 30],
  ['ausdauer', 15],
  ['erfahrung', 15],
  ['schreck', 10],
];

export interface FireOrder {
  weapon: string;
  /** Richtung in Grad. */
  aim: number;
  /** Neigung in Grad. */
  pitch: number;
  /** Kraft 0–1. */
  power: number;
  /** Zünder der Milchkanne in s (1–5). */
  fuse?: number;
}

interface PendingBlast {
  t: number;
  x: number;
  y: number;
  z: number;
  weapon: WeaponId;
  owner: string;
}

/**
 * Spiellogik, läuft nur beim Host.
 *
 * Schnittstelle wie in der Technik-Vorlage (Kap. 20, Schritt 4):
 * addPlayer, removePlayer, startMatch, step, snapshot, phase.
 *
 * Physik mit fester Schrittweite (der Host ruft step(1/60) auf): Geschosse mit Schwerkraft
 * und Wind, Krater in der Höhenkarte, Rückstoß, Fallschaden, Rutschen, Wasser.
 */
export class Game {
  phase: Phase = 'lobby';
  round = 0;
  teams: Team[] = [];
  cows: Cow[] = [];
  bunkers: Bunker[] = [];
  projectiles: Projectile[] = [];
  mines: Mine[] = [];
  satchels: Satchel[] = [];
  fences: Fence[] = [];
  crates: Crate[] = [];
  activeTeam = -1;
  /** Zählt die Züge über alle Runden; ändert sich bei jedem neuen Zug. */
  turn = 0;
  /** Hof, der die letzte Runde gewonnen hat (null = Unentschieden oder noch keine). */
  winner: number | null = null;
  activeCow: string | null = null;
  timeLeftMs = 0;
  wind: [number, number] = [0, 0];
  mapSeed = 0;
  terrain: Terrain | null = null;
  craters: [number, number, number, number][] = [];
  water = WATER_LEVEL;
  /** Spielzeit der Runde in ms (für das Hochwasser). */
  roundMs = 0;
  msg = '';
  /** Ob in diesem Zug schon eine Aktion ausgeführt wurde. */
  actedThisTurn = false;
  /** Zielen des Spielers am Zug, nur zur Anzeige für Zuschauer. */
  aim: [number, number, WeaponId] | null = null;
  fx: Fx[] = [];
  private pending: PendingBlast[] = [];
  private calmMs = 0;
  private nextId = 1;
  private fxId = 0;
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

  /** Spieler-ID → Hof, für die nächste Runde. */
  get playerTeams(): ReadonlyMap<string, number> {
    return this.players;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get currentRules(): Rules | null {
    return this.rules;
  }

  cow(id: string | null | undefined): Cow | undefined {
    return id ? this.cows.find((c) => c.id === id) : undefined;
  }

  // ───────────────────────── Runde ─────────────────────────

  /** Startet eine neue Runde. rulesFor() wird vorher zu jeder Runde neu aufgerufen. */
  startMatch(rules: Rules, seed: number): void {
    const used = [...new Set(this.players.values())].sort((a, b) => a - b);
    if (used.length < 2) throw new Error('Mindestens zwei Höfe nötig');
    this.rules = rules;
    this.rng = createRng(seed);
    this.mapSeed = seed;
    this.terrain = generateTerrain(seed, rules.map);
    this.craters = [];
    this.water = WATER_LEVEL;
    this.roundMs = 0;
    this.round += 1;
    this.winner = null;
    this.projectiles = [];
    this.mines = [];
    this.satchels = [];
    this.fences = [];
    this.crates = [];
    this.pending = [];
    this.aim = null;

    this.teams = used.map((index) => ({
      index,
      ...TEAM_STYLES[index % TEAM_STYLES.length]!,
      players: [...this.players].filter(([, t]) => t === index).map(([id]) => id),
    }));

    const spots = this.landSpots(this.teams.length * (rules.cowsPerTeam + rules.bunkersPerTeam));
    const career: Career = 'jungrind';
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
          vx: 0,
          vy: 0,
          vz: 0,
          airborne: false,
          sliding: false,
          peakY: 0,
          heading: randInt(this.rng, 0, 359),
          hp: maxHp,
          maxHp,
          alive: true,
          homeTurn: 0,
          career,
          rank,
          // Startrang > 1: genug EP, damit die Beförderung beim ersten Zug ansteht.
          xp: rules.promotion ? RANK_XP[rules.startRank - 1]! : 0,
          stamina: 0,
          restBonus: 0,
          stunned: false,
          staminaPenalty: 0,
          hidden: false,
          used: false,
          needsBranch: false,
          ammo: ammoFor(career, rank),
          lastHitBy: null,
        });
      }
      for (let b = 0; b < rules.bunkersPerTeam; b++) {
        const [x, z] = spots[n++]!;
        const material = rules.map === 'steinbruch' || this.rng() < 0.4 ? 'stein' : 'holz';
        this.bunkers.push({
          id: this.nextId++,
          x,
          y: heightAt(this.terrain, x, z) - 0.3,
          z,
          facing: randInt(this.rng, 0, 7) * 45,
          material,
          hp: material === 'holz' ? 150 : 300,
        });
      }
    }

    this.activeTeam = this.teams[randInt(this.rng, 0, this.teams.length - 1)]!.index;
    this.beginTurn();
  }

  /** Zurück in die Lobby: Runde abbrechen, Spieler bleiben eingetragen. */
  toLobby(): void {
    this.phase = 'lobby';
    this.activeCow = null;
    this.activeTeam = -1;
    this.cows = [];
    this.bunkers = [];
    this.teams = [];
    this.projectiles = [];
    this.mines = [];
    this.satchels = [];
    this.fences = [];
    this.crates = [];
    this.pending = [];
    this.msg = '';
  }

  // ───────────────────────── Zug ─────────────────────────

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
    this.msg = `${this.teamName(cow.team)}: ${titleFor(cow.career, cow.rank)} ${cow.name}`;
    this.applyPromotion(cow);
    const base = CAREERS[cow.career].stamina * this.rules.staminaFactor;
    let stamina = base * (1 + cow.restBonus);
    if (cow.stunned) stamina *= 0.5;
    stamina -= cow.staminaPenalty;
    cow.stamina = Math.max(0, Math.round(stamina));
    cow.restBonus = 0;
    cow.stunned = false;
    cow.staminaPenalty = 0;
    this.phase = 'move';
    this.aim = null;
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
   * Bergauf kostet mehr Ausdauer, Schlamm doppelt; Wasser, Zäune und zu steile Hänge stoppen.
   */
  walk(dirX: number, dirZ: number, dt: number): void {
    const cow = this.cow(this.activeCow);
    if (this.phase !== 'move' || !cow || !cow.alive || !this.terrain || cow.airborne || cow.sliding) return;
    const len = Math.hypot(dirX, dirZ);
    if (len === 0 || cow.stamina <= 0) return;
    const step = WALK_SPEED * dt;
    const nx = cow.x + (dirX / len) * step;
    const nz = cow.z + (dirZ / len) * step;
    cow.heading = (Math.atan2(-dirZ, dirX) * 180) / Math.PI;
    if (!inside(this.terrain, nx, nz)) return;
    const ny = heightAt(this.terrain, nx, nz);
    if (ny < this.water + 0.2) return;
    if (this.fences.some((f) => fenceDist(f, nx, nz) < 0.6 && ny < f.y + FENCE_HEIGHT)) return;
    const climb = Math.max(0, ny - cow.y) / step;
    if (climb > 1.5) return; // zu steil
    const mud = THEMES[this.terrain.theme].mud && ny < 1 ? 2 : 1;
    const cost = step * STAMINA_PER_M * (1 + climb * 2) * mud;
    if (cost > cow.stamina) {
      cow.stamina = 0;
      return;
    }
    cow.stamina -= cost;
    cow.x = nx;
    cow.z = nz;
    // Bergab nicht in der Luft hängen: kleine Stufen gleich hinunter.
    cow.y = ny;
  }

  /** Sprung nach vorn (Leertaste). Kostet Ausdauer. */
  jump(): boolean {
    const cow = this.cow(this.activeCow);
    if (this.phase !== 'move' || !cow || !cow.alive || cow.airborne || cow.sliding || cow.stamina < JUMP_COST) return false;
    cow.stamina -= JUMP_COST;
    const [dx, dz] = dirOf(cow.heading);
    cow.vx = dx * 3.5;
    cow.vz = dz * 3.5;
    cow.vy = 5.5;
    cow.airborne = true;
    cow.peakY = cow.y;
    this.addFx('jump', cow.x, cow.y, cow.z, 0);
    return true;
  }

  /** Zielen des Spielers am Zug: dreht die Kuh und zeigt Zuschauern die Richtung. */
  setAim(yaw: number, pitch: number, weaponId: string): void {
    const cow = this.cow(this.activeCow);
    if (this.phase !== 'move' || !cow || !isWeaponId(weaponId)) return;
    const y = normDeg(yaw);
    this.aim = [Math.round(y), Math.round(clamp(pitch, -20, 85)), weaponId];
    if (!cow.airborne && !cow.sliding) cow.heading = this.clampToSlit(cow, y);
  }

  /** Waffen der Kuh mit Munition (-1 = unbegrenzt), in fester Reihenfolge. */
  arsenal(cow: Cow): [WeaponId, number][] {
    const out: [WeaponId, number][] = [];
    for (const id of WEAPON_IDS) {
      if (id === 'fernzuender') {
        if (this.satchels.some((s) => s.owner === cow.id)) out.push([id, -1]);
        continue;
      }
      const a = cow.ammo[id];
      if (a === undefined) continue;
      out.push([id, a === Infinity ? -1 : a]);
    }
    return out;
  }

  /**
   * Aktion der aktiven Kuh auslösen. Danach fliegt, was fliegt (Phase resolve),
   * und der Zug endet, sobald alles zur Ruhe gekommen ist.
   * Tarnung ist die Ausnahme: Danach darf die Kuh noch laufen.
   */
  fire(order: FireOrder): boolean {
    const cow = this.cow(this.activeCow);
    if (this.phase !== 'move' || !cow || !cow.alive || this.actedThisTurn || cow.airborne || cow.needsBranch) return false;
    if (!isWeaponId(order.weapon)) return false;
    const id = order.weapon;
    const entry = this.arsenal(cow).find(([w]) => w === id);
    if (!entry || entry[1] === 0) return false;
    if (id === 'zugende') {
      this.endTurn();
      return true;
    }
    const yaw = this.clampToSlit(cow, normDeg(finite(order.aim)));
    const pitch = clamp(finite(order.pitch), -20, 85);
    const power = clamp(finite(order.power), 0, 1);
    const fuse = clamp(Math.round(finite(order.fuse ?? 3)), 1, 5);
    if (!this.perform(cow, id, yaw, pitch, power, fuse)) return false;

    const a = cow.ammo[id];
    if (a !== undefined && a !== Infinity) cow.ammo[id] = a - 1;
    if (id !== 'tarnung' && cow.hidden) cow.hidden = false;
    cow.heading = yaw;
    this.actedThisTurn = true;
    this.aim = null;
    if (id !== 'tarnung') {
      this.phase = 'resolve';
      this.calmMs = 0;
    }
    return true;
  }

  /** Erfahrung gutschreiben (Beförderung wird beim nächsten Zug der Kuh wirksam). */
  addXp(cowId: string, amount: number): void {
    const cow = this.cow(cowId);
    if (cow && this.rules?.promotion && amount > 0) cow.xp += amount;
  }

  /** Schaden an einer Kuh; `from` bekommt Erfahrung. */
  damage(cowId: string, amount: number, from?: string | null): void {
    const cow = this.cow(cowId);
    if (!cow || !cow.alive) return;
    const dealt = Math.min(cow.hp, Math.max(0, Math.round(amount)));
    if (dealt <= 0) return;
    cow.hp -= dealt;
    this.addFx('dmg', cow.x, cow.y + 2.6, cow.z, dealt);
    const attacker = this.cow(from);
    if (attacker) cow.lastHitBy = attacker.id;
    if (attacker && attacker.team !== cow.team) this.addXp(attacker.id, Math.floor(dealt / 10) * XP.damagePer10);
    if (cow.hp <= 0) this.goHome(cow, from ?? null, 'home');
  }

  heal(cow: Cow, amount: number, healer?: Cow): number {
    if (!cow.alive) return 0;
    const gained = Math.max(0, Math.min(cow.maxHp - cow.hp, Math.round(amount)));
    if (gained <= 0) return 0;
    cow.hp += gained;
    this.addFx('heal', cow.x, cow.y + 2.6, cow.z, gained);
    if (healer && healer.id !== cow.id && healer.team === cow.team) this.addXp(healer.id, Math.floor(gained / 10) * XP.healPer10);
    return gained;
  }

  /** Feste Schrittweite, vom Host 60-mal pro Sekunde aufgerufen. */
  step(dt: number): void {
    if (this.phase === 'lobby' || this.phase === 'roundEnd' || !this.rules) return;
    this.roundMs += dt * 1000;
    this.physics(dt);
    if (this.phase === 'select' || this.phase === 'move') {
      const cow = this.cow(this.activeCow);
      if (this.phase === 'move' && (!cow || !cow.alive)) {
        this.endTurn();
        return;
      }
      this.timeLeftMs -= dt * 1000;
      if (this.timeLeftMs <= 0) this.endTurn();
      return;
    }
    if (this.phase === 'resolve') {
      if (this.isCalm()) {
        this.calmMs += dt * 1000;
        if (this.calmMs >= SETTLE_MS) this.advance();
      } else this.calmMs = 0;
    }
  }

  /** Zug beenden: sofort, wenn alles ruht, sonst nach dem Ausrollen. */
  endTurn(): void {
    if (this.phase === 'lobby' || this.phase === 'roundEnd') return;
    if (this.isCalm()) this.advance();
    else {
      this.phase = 'resolve';
      this.calmMs = 0;
    }
  }

  /** Nichts fliegt, rollt oder zündet mehr. */
  isCalm(): boolean {
    return this.projectiles.length === 0 && this.pending.length === 0 && !this.cows.some((c) => c.alive && (c.airborne || c.sliding));
  }

  // ───────────────────────── Ablauf intern ─────────────────────────

  /** Nächster Hof oder Rundenende. */
  private advance(): void {
    const cow = this.cow(this.activeCow);
    if (cow && !this.actedThisTurn) cow.restBonus = REST_BONUS;
    const order = this.teams.map((t) => t.index);
    const aliveTeams = () => new Set(this.cows.filter((c) => c.alive).map((c) => c.team));
    let alive = aliveTeams();
    const i = order.indexOf(this.activeTeam);
    let wrapped = false;
    for (let k = 1; k <= order.length; k++) {
      if (alive.has(order[(i + k) % order.length]!)) {
        wrapped = i + k >= order.length;
        break;
      }
    }
    // Hochwasser: nach jedem vollen Durchgang aller Höfe steigt das Wasser um 1 m.
    if (wrapped && this.rules!.floodAfterMs > 0 && this.roundMs >= this.rules!.floodAfterMs) {
      this.raiseWater();
      alive = aliveTeams();
    }
    if (alive.size <= 1) {
      this.endRound(alive.size === 1 ? [...alive][0]! : null);
      return;
    }
    for (let k = 1; k <= order.length; k++) {
      const t = order[(i + k) % order.length]!;
      if (alive.has(t)) {
        this.activeTeam = t;
        break;
      }
    }
    this.beginTurn();
  }

  private endRound(winner: number | null): void {
    this.phase = 'roundEnd';
    this.activeCow = null;
    this.winner = winner;
    this.projectiles = [];
    this.pending = [];
    this.msg = winner !== null ? `${this.teamName(winner)} gewinnt die Runde!` : 'Unentschieden – alle Kühe sind heimgegangen';
    for (const c of this.cows) if (c.alive) this.addXp(c.id, XP.survivedRound);
  }

  private beginTurn(): void {
    if (this.selectableCows().length === 0) {
      for (const c of this.cows) if (c.team === this.activeTeam) c.used = false;
    }
    this.activeCow = null;
    this.actedThisTurn = false;
    this.aim = null;
    this.turn += 1;
    this.phase = 'select';
    this.calmMs = 0;
    this.timeLeftMs = this.rules!.turnMs;
    const angle = this.rng() * Math.PI * 2;
    const strength = this.rng() * this.rules!.windMax;
    this.wind = [round(Math.cos(angle) * strength, 2), round(Math.sin(angle) * strength, 2)];
    this.msg = `${this.teamName(this.activeTeam)} ist dran – Kuh wählen`;

    // Sprengsäcke mit abgelaufenem Zünder
    for (const s of [...this.satchels]) {
      if (s.explodeTurn <= this.turn) this.detonateSatchel(s, 0);
    }
    // Kiste am Heu-Fallschirm
    if (this.rng() < this.rules!.crateChance) this.dropCrate();
  }

  private applyPromotion(cow: Cow): void {
    if (!this.rules?.promotion) return;
    const target = pendingPromotion(cow.rank, cow.xp);
    if (target === null) return;
    if (cow.career === 'jungrind') {
      cow.needsBranch = true;
      this.msg = `${cow.name} wird befördert – Laufbahn wählen`;
      return;
    }
    const before = cow.maxHp;
    cow.rank = target;
    cow.maxHp = maxHpFor(this.rules.hp, cow.career, cow.rank);
    cow.hp = Math.max(1, cow.hp + (cow.maxHp - before));
    for (const id of weaponsFor(cow.career, cow.rank)) if (cow.ammo[id] === undefined) cow.ammo[id] = WEAPONS[id].ammo;
    this.msg = `${cow.name} wird befördert: ${titleFor(cow.career, cow.rank)}`;
    this.addFx('promo', cow.x, cow.y + 2, cow.z, cow.rank);
  }

  // ───────────────────────── Aktionen ─────────────────────────

  private perform(cow: Cow, id: WeaponId, yaw: number, pitch: number, power: number, fuse: number): boolean {
    const wp = WEAPONS[id];
    const t = this.terrain!;
    const [dx, dz] = dirOf(yaw);
    switch (wp.kind) {
      case 'melee':
        return this.hornstoss(cow, dx, dz);
      case 'straight':
      case 'arc':
      case 'grenade':
      case 'lure':
        this.launch(cow, id, yaw, pitch, power, fuse);
        return true;
      case 'airstrike': {
        const span = spanOf(t);
        const dist = 8 + power * (wp.range - 8);
        const tx = clamp(cow.x + dx * dist, 2, span - 2);
        const tz = clamp(cow.z + dz * dist, 2, span - 2);
        for (let k = -2; k <= 2; k++) {
          this.projectiles.push(this.projectile(id, cow.id, tx + dx * k * 2.2, 40 + Math.abs(k) * 2, tz + dz * k * 2.2, 0, -8, 0));
        }
        this.addFx('shot', cow.x, cow.y + 1.5, cow.z, 1);
        return true;
      }
      case 'place':
        return this.place(cow, id, yaw, dx, dz);
      case 'heal': {
        const own = this.cows.filter((c) => c.alive && c.team === cow.team && dist2(c, cow) <= wp.radius);
        if (id === 'heilkraeuter') {
          const target = own.filter((c) => c.hp < c.maxHp).sort((a, b) => b.maxHp - b.hp - (a.maxHp - a.hp))[0];
          if (!target) return false;
          this.heal(target, wp.damage, cow);
        } else {
          if (!own.some((c) => c.hp < c.maxHp)) return false;
          for (const c of own) this.heal(c, wp.damage, cow);
        }
        return true;
      }
      case 'revive': {
        const dead = this.cows.filter((c) => !c.alive && c.team === cow.team).sort((a, b) => b.homeTurn - a.homeTurn)[0];
        if (!dead) return false;
        let [x, z] = [cow.x + dx * 1.8, cow.z + dz * 1.8];
        if (!inside(t, x, z) || heightAt(t, x, z) < this.water + 0.2) [x, z] = [cow.x - dx * 1.8, cow.z - dz * 1.8];
        if (!inside(t, x, z) || heightAt(t, x, z) < this.water + 0.2) [x, z] = [cow.x, cow.z];
        Object.assign(dead, {
          alive: true,
          hp: Math.round((dead.maxHp * wp.damage) / 100),
          x,
          z,
          y: heightAt(t, x, z),
          vx: 0,
          vy: 0,
          vz: 0,
          airborne: false,
          sliding: false,
          used: true,
          heading: yaw,
          hidden: false,
        });
        this.addFx('revive', x, dead.y, z, 0);
        this.msg = `${dead.name} ist zurück auf der Weide`;
        return true;
      }
      case 'detonate': {
        const mine = this.satchels.filter((s) => s.owner === cow.id);
        if (mine.length === 0) return false;
        for (const s of mine) this.detonateSatchel(s, 0.2);
        this.addFx('click', cow.x, cow.y + 1, cow.z, 0);
        return true;
      }
      case 'self':
        if (id === 'tarnung') {
          cow.hidden = true;
          this.addFx('cloak', cow.x, cow.y, cow.z, 0);
          this.msg = `${cow.name} ist getarnt`;
          return true;
        }
        return false;
    }
  }

  private hornstoss(cow: Cow, dx: number, dz: number): boolean {
    const wp = WEAPONS.hornstoss;
    let best: Cow | null = null;
    let bestD = Infinity;
    for (const c of this.cows) {
      if (!c.alive || c.id === cow.id) continue;
      const ox = c.x - cow.x;
      const oz = c.z - cow.z;
      const d = Math.hypot(ox, oz);
      if (d > wp.radius || Math.abs(c.y - cow.y) > 2 || d === 0) continue;
      const cos = (ox * dx + oz * dz) / d;
      if (cos < 0.5) continue; // nur nach vorn (±60°)
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    const fx = cow.x + dx * 1.4;
    const fz = cow.z + dz * 1.4;
    this.addFx('melee', best?.x ?? fx, (best?.y ?? cow.y) + 1, best?.z ?? fz, best ? 1 : 0);
    // Zaun vor der Kuh bekommt den Stoß ab.
    if (!best) {
      const f = this.fences.find((f) => fenceDist(f, fx, fz) < 1.2);
      if (f) this.damageFence(f, wp.damage);
      return true;
    }
    this.damage(best.id, wp.damage, cow.id);
    if (best.alive) {
      const ox = (best.x - cow.x) / bestD;
      const oz = (best.z - cow.z) / bestD;
      this.knock(best, ox * wp.push, 6, oz * wp.push, cow.id);
    }
    return true;
  }

  private launch(cow: Cow, id: WeaponId, yaw: number, pitch: number, power: number, fuse: number): void {
    const wp = WEAPONS[id];
    const [dx, dz] = dirOf(yaw);
    // Kurz vor der Kuh starten, damit der Wurf nicht hinter einem nahen Zaun beginnt.
    let sx = cow.x + dx * 0.5;
    let sy = cow.y + 1.5;
    let sz = cow.z + dz * 0.5;
    const b = this.bunkerAround(cow.x, cow.z);
    if (b) {
      // Aus der Schießscharte heraus
      const [fx, fz] = dirOf(b.facing);
      sx = b.x + fx * (BUNKER_HALF_X + 0.3);
      sz = b.z + fz * (BUNKER_HALF_X + 0.3);
      sy = b.y + 1.45;
    }
    const [vx, vy, vz] = launchVelocity(wp, yaw, pitch, power);
    const p = this.projectile(id, cow.id, sx, sy, sz, vx, vy, vz);
    if (wp.kind === 'grenade') p.fuse = fuse;
    this.projectiles.push(p);
    this.addFx('shot', sx, sy, sz, 0);
  }

  private place(cow: Cow, id: WeaponId, yaw: number, dx: number, dz: number): boolean {
    const t = this.terrain!;
    const reach = id === 'weidezaun' ? 2.2 : id === 'unterstand' ? 0 : 1.5;
    const x = cow.x + dx * reach;
    const z = cow.z + dz * reach;
    if (!inside(t, x, z)) return false;
    const y = heightAt(t, x, z);
    if (y < this.water + 0.1) return false;
    switch (id) {
      case 'fladenmine':
        this.mines.push({ id: this.nextId++, x, y, z, team: cow.team, owner: cow.id, armedTurn: this.turn + 1 });
        this.addFx('click', x, y, z, 0);
        return true;
      case 'sprengsack':
        this.satchels.push({ id: this.nextId++, x, y, z, team: cow.team, owner: cow.id, explodeTurn: this.turn + SATCHEL_TURNS });
        this.addFx('click', x, y, z, 0);
        return true;
      case 'weidezaun':
        this.fences.push({ id: this.nextId++, x, y, z, angle: normDeg(yaw + 90), hp: 60 });
        this.addFx('build', x, y, z, 0);
        return true;
      case 'unterstand':
        if (this.bunkerAround(cow.x, cow.z)) return false;
        this.bunkers.push({ id: this.nextId++, x, y: y - 0.3, z, facing: Math.round(yaw), material: 'holz', hp: 150 });
        this.addFx('build', x, y, z, 1);
        return true;
      default:
        return false;
    }
  }

  // ───────────────────────── Physik ─────────────────────────

  private physics(dt: number): void {
    for (const p of [...this.pending]) {
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(this.pending.indexOf(p), 1);
        this.explode(p.x, p.y, p.z, p.weapon, p.owner);
      }
    }
    for (const p of [...this.projectiles]) this.updateProjectile(p, dt);
    for (const c of this.cows) if (c.alive) this.updateCow(c, dt);

    // Minen: scharf ab dem Zug nach dem Legen, lösen bei Berührung aus.
    for (const m of [...this.mines]) {
      if (this.turn < m.armedTurn) continue;
      const hit = this.cows.some((c) => c.alive && !c.airborne && Math.hypot(c.x - m.x, c.z - m.z) < 1.1 && Math.abs(c.y - m.y) < 1.5);
      if (hit) {
        this.mines.splice(this.mines.indexOf(m), 1);
        this.addFx('click', m.x, m.y, m.z, 0);
        this.pending.push({ t: 0.3, x: m.x, y: m.y + 0.2, z: m.z, weapon: 'fladenmine', owner: m.owner });
      }
    }

    // Kisten sinken und werden eingesammelt.
    const t = this.terrain!;
    for (const k of [...this.crates]) {
      if (!k.landed) {
        k.y -= CRATE_FALL * dt;
        const g = heightAt(t, k.x, k.z);
        if (k.y <= g) {
          k.y = g;
          k.landed = true;
          if (g < this.water) {
            this.crates.splice(this.crates.indexOf(k), 1);
            this.addFx('splash', k.x, this.water, k.z, 0);
            continue;
          }
        }
      }
      const cow = this.cows.find((c) => c.alive && Math.hypot(c.x - k.x, c.z - k.z) < 1.5 && Math.abs(c.y - k.y) < 2.5);
      if (cow) this.collect(cow, k);
    }
  }

  private projectile(weapon: WeaponId, owner: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): Projectile {
    return { id: this.nextId++, weapon, owner, x, y, z, vx, vy, vz, fuse: 0, age: 0, dist: 0, slit: null };
  }

  private updateProjectile(p: Projectile, dt: number): void {
    const wp = WEAPONS[p.weapon];
    const t = this.terrain!;
    const remove = () => this.projectiles.splice(this.projectiles.indexOf(p), 1);
    p.age += dt;
    if (wp.kind === 'grenade') {
      p.fuse -= dt;
      if (p.fuse <= 0) {
        remove();
        this.explode(p.x, p.y, p.z, p.weapon, p.owner);
        return;
      }
    }
    const speed = Math.hypot(p.vx, p.vy, p.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.3));
    const h = dt / steps;
    const straight = wp.kind === 'straight';
    for (let s = 0; s < steps; s++) {
      if (!straight) p.vy -= GRAVITY * h;
      if (wp.wind) {
        p.vx += this.wind[0] * h;
        p.vz += this.wind[1] * h;
      }
      p.x += p.vx * h;
      p.y += p.vy * h;
      p.z += p.vz * h;
      if (straight) {
        p.dist += speed * h;
        if (p.dist > wp.range) {
          remove();
          this.addFx('puff', p.x, p.y, p.z, 0);
          return;
        }
      }
      if (!inside(t, p.x, p.z) || p.y < this.water - 4) {
        remove();
        if (p.y < 30) this.addFx('splash', p.x, this.water, p.z, 0);
        return;
      }
      const g = heightAt(t, p.x, p.z);
      if (p.y <= this.water && g < this.water) {
        remove();
        this.addFx('splash', p.x, this.water, p.z, 0);
        return;
      }

      // Kühe
      const cow = this.cows.find(
        (c) => c.alive && (c.id !== p.owner || p.age > 0.3) && Math.hypot(c.x - p.x, c.y + COW_CENTER - p.y, c.z - p.z) < COW_RADIUS,
      );
      if (cow) {
        if (wp.kind === 'grenade') {
          // Milchkanne prallt von Kühen ab.
          const ox = p.x - cow.x;
          const oz = p.z - cow.z;
          const d = Math.hypot(ox, oz) || 1;
          const vn = (p.vx * ox + p.vz * oz) / d;
          if (vn < 0) {
            p.vx = (p.vx - (2 * vn * ox) / d) * 0.4;
            p.vz = (p.vz - (2 * vn * oz) / d) * 0.4;
          }
          continue;
        }
        remove();
        this.impact(p, cow);
        return;
      }

      // Bunker
      if (p.slit !== null && !this.bunkers.some((b) => b.id === p.slit && inBunker(b, p.x, p.y, p.z, 0.3))) p.slit = null;
      for (const b of this.bunkers) {
        if (b.id === p.slit || !inBunker(b, p.x, p.y, p.z, 0)) continue;
        const ownerCow = this.cow(p.owner);
        if (ownerCow && p.age < 0.6 && this.bunkerAround(ownerCow.x, ownerCow.z) === b) continue;
        const [lx] = local(b, p.x, p.z);
        const hy = p.y - b.y;
        if (straight && lx > BUNKER_HALF_X - 0.5 && hy > 1.0 && hy < 1.95) {
          p.slit = b.id; // durch die Scharte
          continue;
        }
        if (wp.kind === 'grenade') {
          p.vx *= -0.4;
          p.vz *= -0.4;
          p.vy = Math.abs(p.vy) * 0.3;
          p.x -= p.vx * h * 2;
          p.z -= p.vz * h * 2;
          continue;
        }
        remove();
        if (straight) {
          this.damageBunker(b, wp.damage * 0.5, p.owner);
          this.addFx('puff', p.x, p.y, p.z, 0);
        } else this.impact(p, null);
        return;
      }

      // Zäune
      const fence = this.fences.find((f) => fenceDist(f, p.x, p.z) < 0.3 && p.y > f.y - 0.2 && p.y < f.y + FENCE_HEIGHT);
      if (fence) {
        if (wp.kind === 'grenade') {
          p.vx *= -0.4;
          p.vz *= -0.4;
          continue;
        }
        remove();
        if (straight) {
          this.damageFence(fence, wp.damage);
          this.addFx('puff', p.x, p.y, p.z, 0);
        } else this.impact(p, null);
        return;
      }

      // Boden
      if (p.y <= g) {
        if (wp.kind === 'grenade') {
          const [nx, ny, nz] = normalAt(t, p.x, p.z);
          const vn = p.vx * nx + p.vy * ny + p.vz * nz;
          if (vn < 0) {
            p.vx = (p.vx - 2 * vn * nx) * 0.5;
            p.vy = (p.vy - 2 * vn * ny) * 0.45;
            p.vz = (p.vz - 2 * vn * nz) * 0.5;
          }
          if (Math.hypot(p.vx, p.vy, p.vz) < 1.2) {
            p.vx = 0;
            p.vy = 0;
            p.vz = 0;
          }
          p.y = g + 0.05;
          continue;
        }
        p.y = g;
        remove();
        this.impact(p, null);
        return;
      }
    }
  }

  /** Geschoss trifft: Kuh (direkt) oder Boden/Bunker/Zaun. */
  private impact(p: Projectile, cow: Cow | null): void {
    const wp = WEAPONS[p.weapon];
    if (wp.kind === 'straight') {
      if (!cow) {
        this.addFx('puff', p.x, p.y, p.z, 0);
        return;
      }
      const head = p.weapon === 'fernglas' && p.y > cow.y + 1.45;
      this.damage(cow.id, head ? 60 : wp.damage, p.owner);
      if (head) this.msg = 'Kopftreffer!';
      const sp = Math.hypot(p.vx, p.vz) || 1;
      if (cow.alive) this.knock(cow, (p.vx / sp) * wp.push, 1.5, (p.vz / sp) * wp.push, p.owner);
      this.addFx('melee', p.x, p.y, p.z, 1);
      return;
    }
    if (wp.kind === 'lure') {
      this.addFx('bell', p.x, p.y, p.z, wp.radius);
      const owner = this.cow(p.owner);
      for (const c of this.cows) {
        if (!c.alive || (owner && c.team === owner.team)) continue;
        if (Math.hypot(c.x - p.x, c.z - p.z) > wp.radius) continue;
        c.staminaPenalty += 20;
        c.heading = normDeg((Math.atan2(-(c.z - p.z), c.x - p.x) * 180) / Math.PI);
      }
      return;
    }
    this.explode(p.x, p.y, p.z, p.weapon, p.owner);
  }

  /** Explosion: Krater, Schaden mit Abfall nach außen, Rückstoß, Bunker, Zäune, Kettenreaktion. */
  explode(x: number, y: number, z: number, weaponId: WeaponId, ownerId: string, override?: { damage: number; radius: number }): void {
    const wp = WEAPONS[weaponId];
    const t = this.terrain!;
    const dmg = override?.damage ?? wp.damage;
    const r = override?.radius ?? wp.radius;
    this.addFx('boom', x, y, z, r);
    if (wp.crater > 0 || override) {
      const cr = (override ? r * 0.8 : wp.crater) * THEMES[t.theme].crater;
      carveCrater(t, x, y, z, cr);
      this.craters.push([round(x, 2), round(y, 2), round(z, 2), round(cr, 2)]);
    }
    const owner = this.cow(ownerId);
    // Nur Explosionen deutlich im Inneren zählen als „im selben Bunker“ (Einschläge an der Wand nicht).
    const blastBunker = this.bunkers.find((b) => inBunker(b, x, y, z, -0.45)) ?? null;

    for (const c of this.cows) {
      if (!c.alive) continue;
      const d = Math.hypot(c.x - x, c.y + COW_CENTER - y, c.z - z);
      if (d > r + COW_RADIUS * 0.5) continue;
      const cb = this.bunkerAround(c.x, c.z);
      // Im Bunker geschützt, außer gegen Sprengsäcke und Explosionen im selben Bunker.
      if (cb && cb !== blastBunker && weaponId !== 'sprengsack') continue;
      const f = clamp(1 - Math.max(0, d - 0.5) / r, 0, 1);
      this.damage(c.id, dmg * f, ownerId);
      if (weaponId === 'melkschemel' && owner && c.team !== owner.team && c.alive) {
        c.stunned = true;
        this.addFx('stun', c.x, c.y + 2.2, c.z, 0);
      }
      if (!c.alive) continue;
      let ox = c.x - x;
      let oz = c.z - z;
      const hd = Math.hypot(ox, oz);
      if (hd < 0.05) [ox, oz] = dirOf(this.rng() * 360);
      else [ox, oz] = [ox / hd, oz / hd];
      const push = wp.push * f;
      if (push > 0.5) this.knock(c, ox * push, push * 0.6 + 1.5, oz * push, ownerId);
    }

    for (const b of [...this.bunkers]) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d > r + 2.2) continue;
      const f = clamp(1 - Math.max(0, d - 2) / r, 0, 1);
      this.damageBunker(b, dmg * (weaponId === 'sprengsack' ? 3.5 : 0.6) * f, ownerId);
    }
    for (const fe of [...this.fences]) {
      const d = fenceDist(fe, x, z);
      if (d < r + 0.3) this.damageFence(fe, dmg * clamp(1 - d / (r + 0.3), 0.2, 1));
    }
    for (const m of [...this.mines]) {
      if (Math.hypot(m.x - x, m.z - z) < r) {
        this.mines.splice(this.mines.indexOf(m), 1);
        this.pending.push({ t: 0.25, x: m.x, y: m.y + 0.2, z: m.z, weapon: 'fladenmine', owner: m.owner });
      }
    }
    for (const s of [...this.satchels]) if (Math.hypot(s.x - x, s.z - z) < r) this.detonateSatchel(s, 0.3);
    for (const k of [...this.crates]) {
      if (Math.hypot(k.x - x, k.y - y, k.z - z) > r) continue;
      this.crates.splice(this.crates.indexOf(k), 1);
      if (k.kind === 'schreck') this.pending.push({ t: 0.2, x: k.x, y: k.y + 0.3, z: k.z, weapon: 'milchkanne', owner: ownerId });
      else this.addFx('puff', k.x, k.y, k.z, 0);
    }
    // Kühe, deren Boden weggesprengt wurde, fallen in updateCow nach.
  }

  private knock(c: Cow, vx: number, vy: number, vz: number, from: string | null): void {
    c.vx += vx;
    c.vy = Math.max(c.vy, 0) + vy;
    c.vz += vz;
    if (!c.airborne) c.peakY = c.y;
    c.airborne = true;
    c.sliding = false;
    c.y += 0.05;
    if (from) c.lastHitBy = from;
  }

  private updateCow(c: Cow, dt: number): void {
    const t = this.terrain!;
    if (c.airborne) {
      c.vy -= GRAVITY * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.peakY = Math.max(c.peakY, c.y);
      if (!inside(t, c.x, c.z)) {
        this.goHome(c, c.lastHitBy, 'splash');
        return;
      }
      const g = heightAt(t, c.x, c.z);
      if (c.y <= g) {
        c.y = g;
        c.airborne = false;
        c.vy = 0;
        if (g < this.water) {
          this.goHome(c, c.lastHitBy, 'splash');
          return;
        }
        const fall = c.peakY - c.y;
        if (this.rules!.fallDamage && fall > FALL_SAFE) this.damage(c.id, (fall - FALL_SAFE) * FALL_DMG_PER_M, c.lastHitBy);
        if (!c.alive) return;
        if (Math.hypot(c.vx, c.vz) > 0.8) c.sliding = true;
        else {
          c.vx = 0;
          c.vz = 0;
        }
      }
      return;
    }
    if (c.sliding) {
      const keep = THEMES[t.theme].slide ** (dt * 60);
      c.vx *= keep;
      c.vz *= keep;
      const nx = c.x + c.vx * dt;
      const nz = c.z + c.vz * dt;
      if (!inside(t, nx, nz)) {
        this.goHome(c, c.lastHitBy, 'splash');
        return;
      }
      const g = heightAt(t, nx, nz);
      if (this.fences.some((f) => fenceDist(f, nx, nz) < 0.6 && g < f.y + FENCE_HEIGHT)) {
        c.vx = 0;
        c.vz = 0;
      } else {
        c.x = nx;
        c.z = nz;
        if (g < c.y - 0.6) {
          c.airborne = true;
          c.peakY = c.y;
          c.vy = 0;
          return;
        }
        c.y = g;
        if (g < this.water) {
          this.goHome(c, c.lastHitBy, 'splash');
          return;
        }
      }
      if (Math.hypot(c.vx, c.vz) < 0.3) {
        c.sliding = false;
        c.vx = 0;
        c.vz = 0;
      }
      return;
    }
    const g = heightAt(t, c.x, c.z);
    if (c.y - g > 0.3) {
      // Boden weggesprengt: fallen
      c.airborne = true;
      c.peakY = c.y;
      c.vx = 0;
      c.vy = 0;
      c.vz = 0;
      return;
    }
    c.y = g;
    if (g < this.water) this.goHome(c, c.lastHitBy, 'splash');
  }

  /** Die Kuh geht heim in den Stall (Rauchwolke oder Platschen). */
  private goHome(c: Cow, from: string | null, how: 'home' | 'splash'): void {
    if (!c.alive) return;
    c.alive = false;
    c.hp = 0;
    c.airborne = false;
    c.sliding = false;
    c.vx = 0;
    c.vy = 0;
    c.vz = 0;
    c.hidden = false;
    c.homeTurn = this.turn;
    this.addFx(how, c.x, how === 'splash' ? this.water : c.y + 1, c.z, 0);
    if (how === 'splash') this.addFx('home', c.x, this.water + 1, c.z, 0);
    const attacker = this.cow(from);
    if (attacker && attacker.team !== c.team) this.addXp(attacker.id, XP.sentHome);
    this.msg = `${c.name} geht heim in den Stall`;
    // Minen und Sprengsäcke der Kuh bleiben liegen.
  }

  private damageBunker(b: Bunker, amount: number, from: string | null): void {
    b.hp -= Math.round(amount);
    if (b.hp > 0) return;
    this.bunkers.splice(this.bunkers.indexOf(b), 1);
    this.addFx('collapse', b.x, b.y + 1, b.z, 0);
    this.msg = 'Ein Bunker stürzt ein!';
    for (const c of this.cows) {
      if (c.alive && inBunker(b, c.x, c.y + 0.5, c.z, 0)) this.damage(c.id, BUNKER_COLLAPSE_DMG, from);
    }
  }

  private damageFence(f: Fence, amount: number): void {
    f.hp -= Math.round(amount);
    if (f.hp > 0) return;
    this.fences.splice(this.fences.indexOf(f), 1);
    this.addFx('puff', f.x, f.y + 0.6, f.z, 0);
  }

  private detonateSatchel(s: Satchel, delay: number): void {
    const i = this.satchels.indexOf(s);
    if (i < 0) return;
    this.satchels.splice(i, 1);
    this.pending.push({ t: delay, x: s.x, y: s.y + 0.3, z: s.z, weapon: 'sprengsack', owner: s.owner });
  }

  /** Bunker, in dem dieser Punkt steht. */
  bunkerAround(x: number, z: number): Bunker | undefined {
    return this.bunkers.find((b) => {
      const [lx, lz] = local(b, x, z);
      return Math.abs(lx) < BUNKER_HALF_X - 0.1 && Math.abs(lz) < BUNKER_HALF_Z - 0.1;
    });
  }

  /** Im Bunker kann man nur durch die Scharte zielen (±45°). */
  private clampToSlit(cow: Cow, yaw: number): number {
    const b = this.bunkerAround(cow.x, cow.z);
    if (!b) return yaw;
    const diff = normDeg(yaw - b.facing + 180) - 180;
    return normDeg(b.facing + clamp(diff, -SLIT_CONE, SLIT_CONE));
  }

  // ───────────────────────── Kisten und Hochwasser ─────────────────────────

  private dropCrate(): void {
    const t = this.terrain!;
    const span = spanOf(t);
    for (let tries = 0; tries < 200; tries++) {
      const x = span * (0.12 + this.rng() * 0.76);
      const z = span * (0.12 + this.rng() * 0.76);
      const g = heightAt(t, x, z);
      if (g < this.water + 0.8 || this.bunkerAround(x, z)) continue;
      let roll = this.rng() * 100;
      let kind: CrateKind = 'futter';
      for (const [k, w] of CRATE_KINDS) {
        if (roll < w) {
          kind = k;
          break;
        }
        roll -= w;
      }
      this.crates.push({ id: this.nextId++, kind, x: round(x, 2), y: g + 22, z: round(z, 2), landed: false });
      this.msg += ' · Eine Kiste schwebt herab';
      return;
    }
  }

  private collect(cow: Cow, k: Crate): void {
    this.crates.splice(this.crates.indexOf(k), 1);
    this.addFx('crate', k.x, k.y + 0.5, k.z, 0);
    this.addXp(cow.id, XP.crate);
    switch (k.kind) {
      case 'futter':
        this.heal(cow, 25);
        this.msg = `${cow.name} findet eine Futterkiste: +25 LP`;
        break;
      case 'waffe': {
        const id = CRATE_WEAPONS[Math.floor(this.rng() * CRATE_WEAPONS.length)]!;
        const a = cow.ammo[id];
        if (a !== Infinity) cow.ammo[id] = (a ?? 0) + 1;
        this.msg = `${cow.name} findet eine Waffenkiste: ${WEAPONS[id].name}`;
        break;
      }
      case 'ausdauer':
        if (cow.id === this.activeCow) cow.stamina = Math.round(CAREERS[cow.career].stamina * this.rules!.staminaFactor);
        else cow.restBonus = Math.max(cow.restBonus, 0.5);
        this.msg = `${cow.name} findet eine Ausdauerkiste`;
        break;
      case 'erfahrung':
        this.addXp(cow.id, 5);
        this.msg = `${cow.name} findet eine Erfahrungskiste: +5 EP`;
        break;
      case 'schreck':
        this.msg = 'Eine Schreckkiste!';
        this.pending.push({ t: 0.15, x: k.x, y: k.y + 0.3, z: k.z, weapon: 'milchkanne', owner: '' });
        break;
    }
  }

  private raiseWater(): void {
    this.water += 1;
    const t = this.terrain!;
    this.addFx('flood', spanOf(t) / 2, this.water, spanOf(t) / 2, this.water);
    this.msg = `Hochwasser! Das Wasser steigt auf ${this.water} m`;
    for (const c of this.cows) if (c.alive && !c.airborne && c.y < this.water) this.goHome(c, c.lastHitBy, 'splash');
    for (const b of [...this.bunkers]) {
      if (b.y + 0.3 < this.water) {
        this.bunkers.splice(this.bunkers.indexOf(b), 1);
        this.addFx('collapse', b.x, this.water, b.z, 0);
      }
    }
    this.mines = this.mines.filter((m) => m.y >= this.water);
    this.satchels = this.satchels.filter((s) => s.y >= this.water);
    this.crates = this.crates.filter((k) => !k.landed || k.y >= this.water);
  }

  // ───────────────────────── Hilfen ─────────────────────────

  private addFx(kind: FxKind, x: number, y: number, z: number, value: number): void {
    this.fx.push([++this.fxId, kind, round(x, 2), round(y, 2), round(z, 2), round(value, 1)]);
    if (this.fx.length > MAX_FX) this.fx.shift();
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
    const span = spanOf(t);
    const spots: [number, number][] = [];
    let minDist = span / 6;
    for (let tries = 0; spots.length < count; tries++) {
      if (tries > 0 && tries % 400 === 0) minDist *= 0.8;
      const x = span * (0.15 + this.rng() * 0.7);
      const z = span * (0.15 + this.rng() * 0.7);
      const h = heightAt(t, x, z);
      if (h < WATER_LEVEL + 0.8) continue;
      if (tries < 4000) {
        const slope = Math.max(Math.abs(heightAt(t, x + 1, z) - h), Math.abs(heightAt(t, x, z + 1) - h));
        if (slope > 0.8) continue;
      }
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < minDist)) continue;
      spots.push([round(x, 2), round(z, 2)]);
    }
    return spots;
  }

  snapshot(): Snapshot {
    const active = this.cow(this.activeCow);
    const r = this.rules;
    return {
      phase: this.phase,
      round: this.round,
      turn: this.turn,
      activeTeam: this.activeTeam,
      activeCow: this.activeCow,
      timeLeft: this.phase === 'resolve' ? 0 : Math.ceil(Math.max(0, this.timeLeftMs) / 1000),
      wind: this.wind,
      mapSeed: this.mapSeed,
      map: this.terrain?.theme ?? 'alm',
      water: this.water,
      floodIn: !r || r.floodAfterMs <= 0 ? -1 : Math.max(0, Math.ceil((r.floodAfterMs - this.roundMs) / 1000)),
      craters: this.craters,
      bunkers: this.bunkers.map((b) => [b.id, b.x, round(b.y, 2), b.z, b.facing, b.material, Math.max(0, b.hp)]),
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
          c.name,
          c.needsBranch,
          c.xp,
          c.hidden,
        ]),
      proj: this.projectiles.map((p) => [p.id, p.weapon, round(p.x, 2), round(p.y, 2), round(p.z, 2)]),
      mines: this.mines.map((m) => [m.id, round(m.x, 2), round(m.y, 2), round(m.z, 2), m.team, this.turn >= m.armedTurn]),
      satchels: this.satchels.map((s) => [s.id, round(s.x, 2), round(s.y, 2), round(s.z, 2), s.team, Math.max(0, s.explodeTurn - this.turn)]),
      fences: this.fences.map((f) => [f.id, round(f.x, 2), round(f.y, 2), round(f.z, 2), Math.round(f.angle), f.hp]),
      crates: this.crates.map((k) => [k.id, k.x, round(k.y, 2), k.z, k.landed]),
      fx: this.fx,
      arsenal: active ? this.arsenal(active) : [],
      acted: this.actedThisTurn,
      aim: this.aim,
      winner: this.phase === 'roundEnd' ? this.winner : null,
      msg: this.msg,
    };
  }
}

// ───────────────────────── reine Hilfsfunktionen ─────────────────────────

function ammoFor(career: Career, rank: number): Partial<Record<WeaponId, number>> {
  const out: Partial<Record<WeaponId, number>> = {};
  for (const id of weaponsFor(career, rank)) out[id] = WEAPONS[id].ammo;
  return out;
}

/** Punkt in Bunker-Koordinaten: lx entlang der Scharte, lz quer dazu. */
export function local(b: { x: number; z: number; facing: number }, x: number, z: number): [number, number] {
  const f = (b.facing * Math.PI) / 180;
  const dx = x - b.x;
  const dz = z - b.z;
  return [dx * Math.cos(f) - dz * Math.sin(f), dx * Math.sin(f) + dz * Math.cos(f)];
}

export function inBunker(b: Bunker, x: number, y: number, z: number, pad: number): boolean {
  const [lx, lz] = local(b, x, z);
  return Math.abs(lx) < BUNKER_HALF_X + pad && Math.abs(lz) < BUNKER_HALF_Z + pad && y > b.y - pad && y < b.y + BUNKER_HEIGHT + pad;
}

/** Abstand eines Punkts zur Zaunlinie (waagerecht). */
export function fenceDist(f: { x: number; z: number; angle: number }, x: number, z: number): number {
  const [dx, dz] = dirOf(f.angle);
  const ox = x - f.x;
  const oz = z - f.z;
  const along = clamp(ox * dx + oz * dz, -FENCE_HALF, FENCE_HALF);
  return Math.hypot(ox - along * dx, oz - along * dz);
}

function normalAt(t: Terrain, x: number, z: number): [number, number, number] {
  const hx = heightAt(t, x + 0.5, z) - heightAt(t, x - 0.5, z);
  const hz = heightAt(t, x, z + 0.5) - heightAt(t, x, z - 0.5);
  const len = Math.hypot(hx, 1, hz);
  return [-hx / len, 1 / len, -hz / len];
}

const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
