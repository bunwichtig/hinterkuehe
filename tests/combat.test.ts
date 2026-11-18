import { describe, expect, it } from 'vitest';
import { cleanSettings, rulesFor } from '../src/config/settings';
import { BUNKER_COLLAPSE_DMG, COW_CENTER, Game, SATCHEL_TURNS, fenceDist } from '../src/game/game';
import { heightAt } from '../src/game/terrain';
import type { Cow } from '../src/game/types';
import { WEAPONS, dirOf, type WeaponId } from '../src/game/weapons';

/**
 * Kampf-Tests auf einer flachen Testwiese: Höhenkarte wird nach dem Start auf 3 m gesetzt,
 * damit Flugbahnen und Abstände genau vorhersagbar sind.
 */
function arena(opts: Record<string, unknown> = {}) {
  const g = new Game();
  g.addPlayer('a', 0);
  g.addPlayer('b', 1);
  g.startMatch(
    rulesFor(
      cleanSettings({ mode: 'individuell', teamSize: 2, bunkers: 'keine', crates: 'aus', wind: 'aus', floodAfter: 0, ...opts }),
      2,
    ),
    7,
  );
  const t = g.terrain!;
  // Flache Insel: innen 3 m, Rand (8 m breit) unter Wasser.
  for (let z = 0; z < t.size; z++)
    for (let x = 0; x < t.size; x++) {
      const edge = Math.min(x, z, t.size - 1 - x, t.size - 1 - z);
      t.heights[z * t.size + x] = edge < 8 ? -3 : 3;
    }
  g.crates = [];
  g.wind = [0, 0];
  // Aktiver Hof: 0
  g.activeTeam = 0;
  for (const c of g.cows) c.used = false;
  return g;
}

function put(c: Cow, x: number, z: number) {
  c.x = x;
  c.z = z;
  c.y = 3;
  c.airborne = false;
  c.sliding = false;
}

const mine = (g: Game) => g.cows.filter((c) => c.team === 0);
const enemy = (g: Game) => g.cows.filter((c) => c.team === 1);

function settle(g: Game, maxSteps = 60 * 30) {
  for (let i = 0; i < maxSteps && (g.phase === 'resolve' || !g.isCalm()); i++) g.step(1 / 60);
}

/** Startet den Zug mit der ersten Kuh von Hof 0 an Position (x, z). */
function start(g: Game, x = 30, z = 48) {
  const [me, other] = mine(g);
  put(me!, x, z);
  put(other!, 80, 80);
  for (const e of enemy(g)) put(e, 85, 20);
  g.phase = 'select';
  expect(g.selectCow(me!.id)).toBe(true);
  return me!;
}

/** Richtung und Neigung, die auf flachem Boden genau `dist` m weit trägt (ohne Wind). */
function aimAt(speed: number, from: Cow, x: number, z: number) {
  const dist = Math.hypot(x - from.x, z - from.z);
  const yaw = (Math.atan2(-(z - from.z), x - from.x) * 180) / Math.PI;
  // Abschuss 1.5 m über dem Boden, Ziel = Kuhmitte 1.1 m: fast gleiche Höhe
  const pitch = 45;
  const power = Math.sqrt((dist * 9.81) / Math.sin((2 * pitch * Math.PI) / 180)) / speed;
  return { yaw, pitch, power };
}

describe('Geschosse', () => {
  it('Heuballen fliegt im Bogen, trifft, macht Krater und Schaden und gibt EP', () => {
    const g = arena({ startRank: 2 });
    const me = start(g);
    g.chooseBranch(me.id, 'feuer');
    const target = enemy(g)[0]!;
    put(target, 60, 48);
    const { yaw, pitch, power } = aimAt(WEAPONS.heuschleuder.speed, me, 60, 48);
    expect(g.fire({ weapon: 'heuschleuder', aim: yaw, pitch, power })).toBe(true);
    expect(g.phase).toBe('resolve');
    expect(g.projectiles).toHaveLength(1);
    expect(me.ammo.heuschleuder).toBe(3);
    settle(g);
    expect(g.craters.length).toBe(1);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(me.xp).toBeGreaterThan(10);
    expect(g.fx.some((f) => f[1] === 'boom')).toBe(true);
    expect(g.activeTeam).toBe(1); // Zug weitergegeben
  });

  it('Wind lenkt Bogenschüsse ab, gerade Schüsse nicht', () => {
    const fly = (wind: [number, number], weapon: WeaponId) => {
      const g = arena({ startRank: 2 });
      const me = start(g);
      g.chooseBranch(me.id, weapon === 'fernglas' ? 'schleichen' : 'feuer');
      g.wind = wind;
      g.fire({ weapon, aim: 0, pitch: weapon === 'fernglas' ? 0 : 45, power: 0.5 });
      const p = g.projectiles[0]!;
      for (let i = 0; i < 20; i++) g.step(1 / 60);
      return p.z;
    };
    expect(fly([0, 4], 'heuschleuder')).toBeGreaterThan(fly([0, 0], 'heuschleuder') + 0.05);
    expect(fly([0, 4], 'fernglas')).toBeCloseTo(fly([0, 0], 'fernglas'), 5);
  });

  it('Mistgabel trifft gerade und hat nur kurze Reichweite', () => {
    const g = arena();
    const me = start(g);
    const near = enemy(g)[0]!;
    put(near, me.x + 10, me.z);
    near.y = 3 + 1.5 - COW_CENTER; // Kuhmitte auf Wurfhöhe
    g.fire({ weapon: 'mistgabel', aim: 0, pitch: 0, power: 1 });
    settle(g);
    expect(near.hp).toBe(near.maxHp - WEAPONS.mistgabel.damage);

    const g2 = arena();
    const me2 = start(g2);
    const far = enemy(g2)[0]!;
    put(far, me2.x + 40, me2.z);
    g2.fire({ weapon: 'mistgabel', aim: 0, pitch: 0, power: 1 });
    settle(g2);
    expect(far.hp).toBe(far.maxHp);
    expect(g2.fx.some((f) => f[1] === 'puff')).toBe(true);
  });

  it('Fernglas-Schuss: Kopftreffer macht 60', () => {
    const g = arena({ startRank: 2 });
    const me = start(g);
    g.chooseBranch(me.id, 'schleichen');
    const t = enemy(g)[0]!;
    put(t, me.x + 50, me.z);
    // Kopf: oberhalb 1.45 m über den Hufen. Abschuss bei 1.5 m → Kuh 0.2 m tiefer stellen.
    t.y = 2.8;
    g.fire({ weapon: 'fernglas', aim: 0, pitch: 0, power: 1 });
    settle(g);
    expect(t.maxHp - t.hp).toBe(60);
  });

  it('Milchkanne zündet erst nach dem eingestellten Zünder', () => {
    const g = arena();
    const me = start(g);
    g.fire({ weapon: 'milchkanne', aim: 0, pitch: 30, power: 0.4, fuse: 4 });
    for (let i = 0; i < 60 * 3.5; i++) g.step(1 / 60);
    expect(g.projectiles).toHaveLength(1);
    expect(g.craters).toHaveLength(0);
    for (let i = 0; i < 60; i++) g.step(1 / 60);
    expect(g.projectiles).toHaveLength(0);
    expect(g.craters).toHaveLength(1);
    expect(me.ammo.milchkanne).toBe(1);
  });

  it('ohne Munition geht nichts', () => {
    const g = arena();
    const me = start(g);
    me.ammo.milchkanne = 0;
    expect(g.fire({ weapon: 'milchkanne', aim: 0, pitch: 30, power: 0.4 })).toBe(false);
    expect(g.fire({ weapon: 'heuhagel', aim: 0, pitch: 30, power: 0.4 })).toBe(false);
    expect(g.fire({ weapon: 'gibtsnicht', aim: 0, pitch: 30, power: 0.4 })).toBe(false);
    expect(g.phase).toBe('move');
  });

  it('nur eine Aktion pro Zug', () => {
    const g = arena();
    start(g);
    expect(g.fire({ weapon: 'hornstoss', aim: 0, pitch: 0, power: 1 })).toBe(true);
    expect(g.fire({ weapon: 'hornstoss', aim: 0, pitch: 0, power: 1 })).toBe(false);
  });
});

describe('Rückstoß, Fallschaden, Wasser', () => {
  it('Hornstoß schubst ins Wasser: Kuh geht heim, Angreifer bekommt EP', () => {
    const g = arena();
    const me = start(g, 12, 48);
    const t = enemy(g)[0]!;
    put(t, 10.5, 48); // zwischen Kuh und Wasser (Rand bei x < 8)
    expect(g.fire({ weapon: 'hornstoss', aim: 180, pitch: 0, power: 1 })).toBe(true);
    settle(g);
    expect(t.alive).toBe(false);
    expect(g.fx.some((f) => f[1] === 'splash')).toBe(true);
    expect(me.xp).toBe(2 + 5);
  });

  it('tiefer Sturz kostet Lebenspunkte, ohne Fallschaden nicht', () => {
    for (const fallDamage of [true, false]) {
      const g = arena({ fallDamage });
      const me = start(g);
      me.y = 15;
      g.step(1 / 60);
      expect(me.airborne).toBe(true);
      settle(g);
      if (fallDamage) expect(me.hp).toBe(me.maxHp - Math.round((12 - 4) * 5));
      else expect(me.hp).toBe(me.maxHp);
    }
  });

  it('Sprung kostet Ausdauer und landet vorn', () => {
    const g = arena();
    const me = start(g);
    me.heading = 0;
    const before = me.stamina;
    expect(g.jump()).toBe(true);
    expect(g.jump()).toBe(false); // schon in der Luft
    for (let i = 0; i < 120; i++) g.step(1 / 60);
    expect(me.stamina).toBe(before - 10);
    expect(me.x).toBeGreaterThan(32);
    expect(me.hp).toBe(me.maxHp);
  });

  it('Explosion stößt Kühe vom Mittelpunkt weg', () => {
    const g = arena();
    const me = start(g);
    const t = enemy(g)[0]!;
    put(t, 52, 60);
    g.explode(50, 3, 60, 'kuerbismoerser', me.id);
    expect(heightAt(g.terrain!, 50, 60)).toBeLessThan(0);
    expect(t.airborne).toBe(true);
    settle(g);
    expect(t.x).toBeGreaterThan(53);
    expect(t.hp).toBeLessThan(t.maxHp);
  });

  it('Boden weggesprengt: Kuh fällt in den Krater', () => {
    const g = arena();
    start(g);
    const t = enemy(g)[0]!;
    put(t, 50, 60);
    const tr = g.terrain!;
    for (let z = 57; z <= 63; z++) for (let x = 47; x <= 53; x++) tr.heights[z * tr.size + x] = 1;
    g.step(1 / 60);
    expect(t.airborne).toBe(true);
    settle(g);
    expect(t.y).toBeCloseTo(1, 1);
  });
});

describe('Minen, Sprengsäcke, Zäune', () => {
  it('Mine ist erst ab dem nächsten Zug scharf und löst beim Betreten aus', () => {
    const g = arena({ startRank: 2 });
    const me = start(g);
    g.chooseBranch(me.id, 'technik');
    expect(g.fire({ weapon: 'fladenmine', aim: 0, pitch: 0, power: 1 })).toBe(true);
    const m = g.mines[0]!;
    expect(m.x).toBeCloseTo(me.x + 1.5, 1);
    // Eigene Kuh steht daneben: noch nicht scharf
    settle(g);
    expect(g.mines).toHaveLength(1);
    // Gegner läuft drauf
    const e = enemy(g).find((c) => g.selectableCows().includes(c))!;
    put(e, m.x + 3, m.z);
    g.selectCow(e.id);
    for (let i = 0; i < 120; i++) {
      g.walk(-1, 0, 1 / 60);
      g.step(1 / 60);
    }
    settle(g);
    expect(g.mines).toHaveLength(0);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('Sprengsack explodiert nach 3 Zügen und sprengt Bunker', () => {
    const g = arena({ startRank: 3 });
    const me = start(g);
    g.chooseBranch(me.id, 'technik');
    g.bunkers.push({ id: 999, x: me.x + 3.5, y: 2.7, z: me.z, facing: 0, material: 'holz', hp: 150 });
    me.x -= 1;
    expect(g.fire({ weapon: 'sprengsack', aim: 0, pitch: 0, power: 1 })).toBe(true);
    const placedTurn = g.turn;
    settle(g);
    while (g.turn < placedTurn + SATCHEL_TURNS - 1) g.endTurn();
    expect(g.satchels).toHaveLength(1);
    g.endTurn();
    settle(g);
    expect(g.satchels).toHaveLength(0);
    expect(g.bunkers.find((b) => b.id === 999)).toBeUndefined();
  });

  it('Fernzünder zündet sofort', () => {
    const g = arena({ startRank: 3 });
    const me = start(g);
    g.chooseBranch(me.id, 'technik');
    g.fire({ weapon: 'sprengsack', aim: 0, pitch: 0, power: 1 });
    settle(g);
    // Hof 1 ist dran, dann wieder Hof 0 mit derselben Kuh (andere ist schon dran gewesen → zurücksetzen)
    g.endTurn();
    for (const c of mine(g)) c.used = c.id !== me.id;
    g.phase = 'select';
    g.selectCow(me.id);
    expect(g.arsenal(me).some(([w]) => w === 'fernzuender')).toBe(true);
    expect(g.fire({ weapon: 'fernzuender', aim: 0, pitch: 0, power: 1 })).toBe(true);
    settle(g);
    expect(g.satchels).toHaveLength(0);
    expect(g.craters.length).toBeGreaterThan(0);
  });

  it('Weidezaun blockiert Laufen und fängt Schüsse ab', () => {
    const g = arena({ startRank: 3 });
    const me = start(g);
    g.chooseBranch(me.id, 'technik');
    expect(g.fire({ weapon: 'weidezaun', aim: 0, pitch: 0, power: 1 })).toBe(true);
    const f = g.fences[0]!;
    expect(fenceDist(f, me.x + 2.2, me.z + 1)).toBeLessThan(0.01); // quer zur Blickrichtung
    settle(g);
    const e = enemy(g).find((c) => g.selectableCows().includes(c))!;
    put(e, me.x + 4, me.z);
    g.selectCow(e.id);
    for (let i = 0; i < 120; i++) g.walk(-1, 0, 1 / 60);
    expect(e.x).toBeGreaterThan(me.x + 2.2);
    // Mistgabel des Gegners trifft den Zaun statt der Kuh
    e.y = me.y;
    g.chooseBranch(e.id, 'feuer');
    expect(g.fire({ weapon: 'mistgabel', aim: 180, pitch: 0, power: 1 })).toBe(true);
    settle(g);
    expect(me.hp).toBe(me.maxHp);
    expect(g.fences[0]?.hp ?? 0).toBeLessThan(60);
  });
});

describe('Bunker', () => {
  it('schützen vor Bogenwaffen und stürzen bei 0 LP ein', () => {
    const g = arena();
    const me = start(g);
    const e = enemy(g)[0]!;
    put(e, 60, 48);
    g.bunkers.push({ id: 500, x: 60, y: 2.7, z: 48, facing: 180, material: 'holz', hp: 20 });
    g.explode(60, 5.5, 48, 'heuschleuder', me.id);
    expect(g.bunkers).toHaveLength(0); // eingestürzt (40 × 0.6 > 20)
    // Nur der Einsturz trifft, nicht die Explosion selbst
    expect(e.hp).toBe(e.maxHp - BUNKER_COLLAPSE_DMG);
  });

  it('im Bunker zielt man nur durch die Scharte', () => {
    const g = arena();
    const me = start(g);
    g.bunkers.push({ id: 501, x: me.x, y: 2.7, z: me.z, facing: 90, material: 'holz', hp: 150 });
    g.fire({ weapon: 'milchkanne', aim: 200, pitch: 20, power: 0.3, fuse: 5 });
    expect(me.heading).toBe(135); // auf 90 ± 45 begrenzt
    const p = g.projectiles[0]!;
    expect(p.z).toBeLessThan(me.z - 1.9); // startet vor der Scharte (90° = −z)
  });

  it('Unterstand baut einen Holzbunker um die Kuh', () => {
    const g = arena({ startRank: 4 });
    const me = start(g);
    g.chooseBranch(me.id, 'technik');
    expect(g.fire({ weapon: 'unterstand', aim: 30, pitch: 0, power: 1 })).toBe(true);
    expect(g.bunkerAround(me.x, me.z)?.material).toBe('holz');
  });
});

describe('Pflege und Schleichen', () => {
  it('Heilkräuter heilen die am stärksten verletzte eigene Kuh in 4 m und geben EP', () => {
    const g = arena({ startRank: 2 });
    const me = start(g);
    g.chooseBranch(me.id, 'pflege');
    const other = mine(g)[1]!;
    put(other, me.x + 2, me.z);
    other.hp = 40;
    const xp = me.xp;
    expect(g.fire({ weapon: 'heilkraeuter', aim: 0, pitch: 0, power: 1 })).toBe(true);
    expect(other.hp).toBe(70);
    expect(me.xp).toBe(xp + 3);
  });

  it('Heilen ohne Verletzte verbraucht nichts', () => {
    const g = arena({ startRank: 2 });
    const me = start(g);
    g.chooseBranch(me.id, 'pflege');
    expect(g.fire({ weapon: 'heilkraeuter', aim: 0, pitch: 0, power: 1 })).toBe(false);
    expect(me.ammo.heilkraeuter).toBe(3);
  });

  it('Kuhglocken-Ruf holt eine heimgeschickte Kuh zurück', () => {
    const g = arena({ startRank: 4 });
    const me = start(g);
    g.chooseBranch(me.id, 'pflege');
    const other = mine(g)[1]!;
    g.damage(other.id, 999);
    expect(other.alive).toBe(false);
    expect(g.fire({ weapon: 'wiederbeleben', aim: 0, pitch: 0, power: 1 })).toBe(true);
    expect(other.alive).toBe(true);
    expect(other.hp).toBe(Math.round(other.maxHp * 0.4));
  });

  it('Melkschemel betäubt: halbe Ausdauer im nächsten Zug', () => {
    const g = arena({ startRank: 2 });
    const me = start(g);
    g.chooseBranch(me.id, 'pflege');
    const e = enemy(g)[0]!;
    put(e, me.x + 1.5, me.z);
    e.y = 2.8;
    g.fire({ weapon: 'melkschemel', aim: 0, pitch: 0, power: 0.3 });
    settle(g);
    expect(e.stunned).toBe(true);
    for (const c of enemy(g)) c.used = c.id !== e.id;
    g.selectCow(e.id);
    expect(e.stamina).toBe(50);
  });

  it('Glockenköder kostet Gegnern im Umkreis 20 Ausdauer', () => {
    const g = arena({ startRank: 3 });
    const me = start(g);
    g.chooseBranch(me.id, 'schleichen');
    const e = enemy(g)[0]!;
    put(e, 50, 48);
    const { yaw, pitch, power } = aimAt(WEAPONS.glockenkoeder.speed, me, 48, 48);
    g.fire({ weapon: 'glockenkoeder', aim: yaw, pitch, power });
    settle(g);
    expect(e.staminaPenalty).toBe(20);
    for (const c of enemy(g)) c.used = c.id !== e.id;
    g.selectCow(e.id);
    expect(e.stamina).toBe(80);
  });

  it('Tarnung: unsichtbar, darf weiterlaufen, verschwindet bei der nächsten Aktion', () => {
    const g = arena({ startRank: 3 });
    const me = start(g);
    g.chooseBranch(me.id, 'schleichen');
    expect(g.fire({ weapon: 'tarnung', aim: 0, pitch: 0, power: 1 })).toBe(true);
    expect(me.hidden).toBe(true);
    expect(g.phase).toBe('move');
    const x = me.x;
    g.walk(1, 0, 0.5);
    expect(me.x).toBeGreaterThan(x);
    expect(g.fire({ weapon: 'hornstoss', aim: 0, pitch: 0, power: 1 })).toBe(false); // Aktion verbraucht
    expect(g.snapshot().cows.find((c) => c[0] === me.id)![15]).toBe(true);
  });
});

describe('Feuer-Laufbahn', () => {
  it('Heuballen-Hagel wirft 5 Ballen auf einen Punkt', () => {
    const g = arena({ startRank: 4 });
    const me = start(g);
    g.chooseBranch(me.id, 'feuer');
    expect(g.fire({ weapon: 'heuhagel', aim: 0, pitch: 0, power: 0.4 })).toBe(true);
    expect(g.projectiles).toHaveLength(5);
    settle(g);
    expect(g.craters).toHaveLength(5);
  });

  it('Kürbis-Mörser schießt mindestens 40° steil', () => {
    const g = arena({ startRank: 3 });
    const me = start(g);
    g.chooseBranch(me.id, 'feuer');
    g.fire({ weapon: 'kuerbismoerser', aim: 0, pitch: 5, power: 0.5 });
    const p = g.projectiles[0]!;
    expect(Math.atan2(p.vy, p.vx)).toBeGreaterThan((39 * Math.PI) / 180);
  });
});

describe('Kisten', () => {
  it('fallen am Fallschirm, werden eingesammelt und wirken', () => {
    const g = arena();
    const me = start(g);
    const hurt = me;
    hurt.hp = 50;
    g.crates.push({ id: 1, kind: 'futter', x: me.x + 2, y: 20, z: me.z, landed: false });
    for (let i = 0; i < 60 * 7; i++) g.step(1 / 60);
    expect(g.crates[0]!.landed).toBe(true);
    for (let i = 0; i < 40; i++) {
      g.walk(1, 0, 1 / 60);
      g.step(1 / 60);
    }
    expect(g.crates).toHaveLength(0);
    expect(hurt.hp).toBe(75);
    expect(me.xp).toBe(1);
  });

  it('Waffenkiste gibt einen Schuss einer höheren Waffe', () => {
    const g = arena();
    const me = start(g);
    g.crates.push({ id: 1, kind: 'waffe', x: me.x + 0.5, y: 3, z: me.z, landed: true });
    g.step(1 / 60);
    const extra = g.arsenal(me).filter(([w]) => !['hornstoss', 'mistgabel', 'milchkanne', 'zugende'].includes(w));
    expect(extra.length + (me.ammo.milchkanne! > 2 ? 1 : 0) + (me.hp < me.maxHp ? 1 : 0)).toBeGreaterThan(0);
  });

  it('Schreckkiste explodiert', () => {
    const g = arena();
    const me = start(g);
    g.crates.push({ id: 1, kind: 'schreck', x: me.x + 0.5, y: 3, z: me.z, landed: true });
    g.step(1 / 60);
    settle(g);
    expect(me.hp).toBeLessThan(me.maxHp);
  });

  it('werden mit eingestellter Wahrscheinlichkeit abgeworfen', () => {
    const g = new Game();
    g.addPlayer('a', 0);
    g.addPlayer('b', 1);
    g.startMatch(rulesFor(cleanSettings({ mode: 'individuell', crates: 'viel' }), 2), 3);
    for (let i = 0; i < 20; i++) g.endTurn();
    expect(g.crates.length).toBeGreaterThan(3);
  });
});

describe('Hochwasser und Rundenende', () => {
  it('nach der eingestellten Zeit steigt das Wasser nach jedem Durchgang', () => {
    const g = arena({ floodAfter: 5 });
    const low = enemy(g)[0]!;
    g.roundMs = 5 * 60_000;
    // Gelände an der Stelle der Kuh auf 0.5 m senken
    const t = g.terrain!;
    put(low, 40, 40);
    for (let z = 38; z <= 42; z++) for (let x = 38; x <= 42; x++) t.heights[z * t.size + x] = 0.5;
    low.y = heightAt(t, 40, 40);
    g.endTurn(); // Hof 0 → Hof 1
    expect(g.water).toBe(0);
    g.endTurn(); // Hof 1 → Hof 0: voller Durchgang
    expect(g.water).toBe(1);
    expect(low.alive).toBe(false);
    expect(g.snapshot().floodIn).toBe(0);
  });

  it('Sieger bekommt die Runde, Snapshot meldet ihn', () => {
    const g = arena();
    for (const c of enemy(g)) g.damage(c.id, 999);
    g.endTurn();
    expect(g.phase).toBe('roundEnd');
    expect(g.snapshot().winner).toBe(0);
  });

  it('Unentschieden, wenn alle Kühe weg sind', () => {
    const g = arena();
    for (const c of g.cows) g.damage(c.id, 999);
    g.endTurn();
    expect(g.phase).toBe('roundEnd');
    expect(g.winner).toBeNull();
  });
});

describe('Beförderung über Erfahrung', () => {
  it('schaltet neue Waffen mit voller Munition frei', () => {
    const g = arena();
    const me = start(g);
    expect(g.arsenal(me).map(([w]) => w)).not.toContain('heuschleuder');
    g.addXp(me.id, 26);
    me.used = false;
    g.phase = 'select';
    g.selectCow(me.id);
    expect(me.needsBranch).toBe(true);
    expect(g.fire({ weapon: 'hornstoss', aim: 0, pitch: 0, power: 1 })).toBe(false); // erst Laufbahn wählen
    g.chooseBranch(me.id, 'feuer');
    expect(me.rank).toBe(3);
    expect(me.ammo.heuschleuder).toBe(4);
    expect(me.ammo.kuerbismoerser).toBe(2);
    expect(g.fx.some((f) => f[1] === 'promo')).toBe(true);
  });
});

describe('Kartenthemen', () => {
  it('jede Karte hat ihr eigenes Gelände, gleicher Seed = gleiche Karte', () => {
    const heights = (map: string) => {
      const g = new Game();
      g.addPlayer('a', 0);
      g.addPlayer('b', 1);
      g.startMatch(rulesFor(cleanSettings({ map }), 2), 11);
      expect(g.snapshot().map).toBe(map);
      return Array.from(g.terrain!.heights);
    };
    expect(heights('alm')).toEqual(heights('alm'));
    expect(heights('moor')).not.toEqual(heights('alm'));
    expect(heights('steinbruch')).not.toEqual(heights('kornfeld'));
  });

  it('Moor: Schlamm kostet doppelte Ausdauer', () => {
    const g = arena({ map: 'moor' });
    const me = start(g);
    const t = g.terrain!;
    for (let i = 0; i < t.heights.length; i++) if (t.heights[i]! > 0) t.heights[i] = 0.5;
    me.y = 0.5;
    const s = me.stamina;
    g.walk(1, 0, 0.5);
    expect(s - me.stamina).toBeCloseTo(3 * 0.5 * 4 * 2, 1);
  });
});

describe('Schnappschuss im Kampf', () => {
  it('enthält Geschosse, Ereignisse und Waffen der aktiven Kuh', () => {
    const g = arena();
    start(g);
    g.fire({ weapon: 'milchkanne', aim: 0, pitch: 30, power: 0.4, fuse: 2 });
    const s = g.snapshot();
    expect(s.proj).toHaveLength(1);
    expect(s.proj[0]![1]).toBe('milchkanne');
    expect(s.arsenal).toContainEqual(['hornstoss', -1]);
    expect(s.arsenal).toContainEqual(['milchkanne', 1]);
    expect(s.fx.at(-1)![1]).toBe('shot');
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('Richtungshilfe dirOf passt zur Blickrichtung', () => {
    const [x, z] = dirOf(90);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });
});
