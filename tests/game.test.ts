import { describe, expect, it } from 'vitest';
import { cleanSettings, rulesFor } from '../src/config/settings';
import { Game, REST_BONUS } from '../src/game/game';
import { createRng } from '../src/game/rng';
import { WATER_LEVEL, carveCrater, generateTerrain, heightAt } from '../src/game/terrain';

function game(opts: Record<string, unknown> = {}, seed = 42) {
  const g = new Game();
  g.addPlayer('a');
  g.addPlayer('b');
  g.startMatch(rulesFor(cleanSettings({ mode: 'individuell', teamSize: 3, turnTime: 30, ...opts }), 2), seed);
  return g;
}

const firstSelectable = (g: Game) => g.selectableCows()[0]!.id;

describe('rng', () => {
  it('ist reproduzierbar', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('terrain', () => {
  it('gleicher Seed ergibt gleiches Gelände', () => {
    expect(generateTerrain(5).heights).toEqual(generateTerrain(5).heights);
  });

  it('ist eine Insel: Rand unter Wasser, Mitte darüber', () => {
    const t = generateTerrain(5);
    expect(t.heights[0]!).toBeLessThan(WATER_LEVEL);
    const mid = (t.size - 1) / 2;
    expect(heightAt(t, mid, mid)).toBeGreaterThan(WATER_LEVEL);
  });

  it('ein Krater senkt nur den Boden in seinem Radius', () => {
    const t = generateTerrain(5);
    const fresh = generateTerrain(5);
    const h = heightAt(t, 48, 48);
    carveCrater(t, 48, h, 48, 3);
    expect(heightAt(t, 48, 48)).toBeLessThan(h - 2);
    expect(heightAt(t, 60, 60)).toBe(heightAt(fresh, 60, 60));
  });
});

describe('Game – Aufstellung', () => {
  it('verteilt Spieler auf zwei Höfe', () => {
    const g = new Game();
    expect(g.addPlayer('a')).toBe(0);
    expect(g.addPlayer('b')).toBe(1);
    expect(g.addPlayer('c')).toBe(0);
  });

  it('braucht mindestens zwei Höfe', () => {
    const g = new Game();
    g.addPlayer('a', 0);
    expect(() => g.startMatch(rulesFor(cleanSettings({}), 1), 1)).toThrow();
  });

  it('stellt Kühe und Bunker auf trockenes Land', () => {
    const g = game({ bunkers: 'normal' });
    expect(g.cows).toHaveLength(6);
    expect(g.bunkers).toHaveLength(4);
    for (const c of g.cows) expect(c.y).toBeGreaterThan(WATER_LEVEL);
    expect(g.phase).toBe('select');
  });
});

describe('Game – Zugablauf', () => {
  it('Spieler wählt frei eine Kuh, aber nicht zweimal im Durchgang', () => {
    const g = game();
    const team = g.activeTeam;
    const choice = g.selectableCows()[1]!.id;
    expect(g.selectCow(choice)).toBe(true);
    expect(g.phase).toBe('move');
    g.endTurn();
    g.selectCow(firstSelectable(g));
    g.endTurn();
    expect(g.activeTeam).toBe(team);
    expect(g.selectableCows().map((c) => c.id)).not.toContain(choice);
  });

  it('nach einem vollen Durchgang sind wieder alle Kühe wählbar', () => {
    const g = game();
    const team = g.activeTeam;
    for (let i = 0; i < 6; i++) {
      g.selectCow(firstSelectable(g));
      g.endTurn();
    }
    expect(g.activeTeam).toBe(team);
    expect(g.selectableCows()).toHaveLength(3);
  });

  it('gegnerische Kühe sind nicht wählbar', () => {
    const g = game();
    const enemy = g.cows.find((c) => c.team !== g.activeTeam)!;
    expect(g.selectCow(enemy.id)).toBe(false);
  });

  it('Laufen kostet Ausdauer und hört auf, wenn sie leer ist', () => {
    const g = game();
    g.selectCow(firstSelectable(g));
    const cow = g.cow(g.activeCow)!;
    const start = cow.stamina;
    expect(start).toBe(100);
    g.walk(1, 0, 0.1);
    g.walk(-1, 0, 0.1);
    expect(cow.stamina).toBeLessThan(start);
    // Hin und her laufen, bis die Ausdauer verbraucht ist: dann bewegt sich nichts mehr.
    for (let i = 0; i < 4000 && cow.stamina > 0; i++) g.walk(i % 40 < 20 ? 1 : -1, 0, 0.05);
    expect(cow.stamina).toBe(0);
    const pos = [cow.x, cow.z];
    g.walk(1, 0, 0.05);
    expect([cow.x, cow.z]).toEqual(pos);
  });

  it('Zug ohne Aktion gibt Ausdauer-Bonus beim nächsten Mal', () => {
    const g = game();
    const id = firstSelectable(g);
    const team = g.activeTeam;
    g.selectCow(id);
    g.endTurn();
    expect(g.cow(id)!.restBonus).toBe(REST_BONUS);
    // Durchgang abschließen, bis die Kuh wieder dran sein kann
    while (!(g.activeTeam === team && g.selectableCows().some((c) => c.id === id))) {
      g.selectCow(firstSelectable(g));
      expect(g.fire({ weapon: 'hornstoss', aim: 0, pitch: 0, power: 1 })).toBe(true);
      for (let i = 0; i < 300 && g.phase === 'resolve'; i++) g.step(1 / 60);
    }
    g.selectCow(id);
    expect(g.cow(id)!.stamina).toBe(120);
  });

  it('Zeitablauf beendet den Zug', () => {
    const g = game();
    const team = g.activeTeam;
    for (let i = 0; i < 31 * 60; i++) g.step(1 / 60);
    expect(g.activeTeam).not.toBe(team);
  });

  it('Runde endet, wenn nur ein Hof übrig ist', () => {
    const g = game();
    const loser = g.cows.find((c) => c.team !== g.activeTeam)!.team;
    for (const c of g.cows) if (c.team === loser) g.damage(c.id, 999);
    g.endTurn();
    expect(g.phase).toBe('roundEnd');
    expect(g.msg).toContain('gewinnt');
  });
});

describe('Game – Erfahrung und Beförderung', () => {
  it('Schaden an Gegnern gibt Erfahrung, Heimschicken extra', () => {
    const g = game();
    const [a, b] = [g.cows.find((c) => c.team === 0)!, g.cows.find((c) => c.team === 1)!];
    g.damage(b.id, 40, a.id);
    expect(a.xp).toBe(4);
    g.damage(b.id, 999, a.id);
    expect(b.alive).toBe(false);
    expect(a.xp).toBe(4 + 6 + 5);
  });

  it('Jungrind wählt bei der ersten Beförderung eine Laufbahn', () => {
    const g = game();
    const id = firstSelectable(g);
    g.addXp(id, 12);
    // Die Kuh muss erst wieder dran sein: Beförderung zählt beim nächsten Zug.
    g.cow(id)!.used = false;
    g.selectCow(id);
    const cow = g.cow(id)!;
    expect(cow.needsBranch).toBe(true);
    expect(g.chooseBranch(id, 'feuer')).toBe(true);
    expect(cow.career).toBe('feuer');
    expect(cow.rank).toBe(2);
    expect(cow.maxHp).toBe(100 + 20 + 10);
  });

  it('ohne Beförderung gibt es keine Erfahrung', () => {
    const g = game({ promotion: false });
    const id = g.cows[0]!.id;
    g.addXp(id, 50);
    expect(g.cow(id)!.xp).toBe(0);
  });
});

describe('Schnappschuss', () => {
  it('ist JSON-tauglich und klein', () => {
    const snap = game().snapshot();
    const json = JSON.stringify(snap);
    expect(JSON.parse(json)).toEqual(snap);
    expect(json.length).toBeLessThan(3000);
  });
});
