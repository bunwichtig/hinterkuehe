import { describe, expect, it } from 'vitest';
import { cleanSettings, rulesFor } from '../src/config/settings';
import { Game } from '../src/game/game';
import { createRng } from '../src/game/rng';
import { carveCrater, generateTerrain } from '../src/game/terrain';

function twoTeamGame(seed = 42) {
  const g = new Game();
  g.addPlayer('a');
  g.addPlayer('b');
  g.startMatch(rulesFor(cleanSettings({ mode: 'individuell', teamSize: 2, turnTime: 15 }), 2), seed);
  return g;
}

describe('rng', () => {
  it('ist reproduzierbar', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('terrain', () => {
  it('gleicher Seed ergibt gleiches Gelände', () => {
    expect(generateTerrain(5).ground).toEqual(generateTerrain(5).ground);
  });

  it('ein Krater senkt den Boden', () => {
    const t = generateTerrain(5);
    const before = t.ground[800]!;
    carveCrater(t, 800, before, 30);
    expect(t.ground[800]!).toBeLessThan(before);
    expect(t.ground[700]!).toBe(generateTerrain(5).ground[700]!);
  });
});

describe('Game', () => {
  it('verteilt Spieler auf zwei Teams', () => {
    const g = new Game();
    expect(g.addPlayer('a')).toBe(0);
    expect(g.addPlayer('b')).toBe(1);
    expect(g.addPlayer('c')).toBe(0);
  });

  it('braucht mindestens zwei Teams', () => {
    const g = new Game();
    g.addPlayer('a', 0);
    expect(() => g.startMatch(rulesFor(cleanSettings({}), 1), 1)).toThrow();
  });

  it('stellt Kühe auf und startet einen Zug', () => {
    const g = twoTeamGame();
    expect(g.cows).toHaveLength(4);
    expect(g.phase).toBe('turn');
    expect(g.activeCow).not.toBeNull();
  });

  it('wechselt nach Zeitablauf das Team und reihum die Kuh', () => {
    const g = twoTeamGame();
    const first = g.activeTeam;
    const firstCow = g.activeCow;
    for (let i = 0; i < 16 * 60; i++) g.step(1 / 60);
    expect(g.activeTeam).not.toBe(first);
    for (let i = 0; i < 16 * 60; i++) g.step(1 / 60);
    expect(g.activeTeam).toBe(first);
    expect(g.activeCow).not.toBe(firstCow);
  });

  it('beendet die Runde, wenn nur ein Team übrig ist', () => {
    const g = twoTeamGame();
    for (const c of g.cows) if (c.team === 1) c.alive = false;
    g.endTurn();
    expect(g.phase).toBe('roundEnd');
    expect(g.msg).toContain('gewinnt');
  });

  it('Schnappschuss ist JSON-tauglich und klein', () => {
    const snap = twoTeamGame().snapshot();
    const json = JSON.stringify(snap);
    expect(JSON.parse(json)).toEqual(snap);
    expect(json.length).toBeLessThan(1000);
  });
});
