import { describe, expect, it } from 'vitest';
import { BRANCHES, CAREERS, maxHpFor, pendingPromotion, rankForXp, titleFor, weaponsFor } from '../src/game/careers';
import { WEAPONS } from '../src/game/weapons';

describe('Laufbahnen', () => {
  it('Rang folgt den EP-Schwellen', () => {
    expect(rankForXp(0)).toBe(1);
    expect(rankForXp(9)).toBe(1);
    expect(rankForXp(10)).toBe(2);
    expect(rankForXp(25)).toBe(3);
    expect(rankForXp(999)).toBe(4);
  });

  it('meldet anstehende Beförderung', () => {
    expect(pendingPromotion(1, 5)).toBeNull();
    expect(pendingPromotion(1, 30)).toBe(3);
    expect(pendingPromotion(3, 30)).toBeNull();
  });

  it('jede Laufbahn hat vier Titel und schaltet nur bekannte Waffen frei', () => {
    for (const b of BRANCHES) {
      expect(CAREERS[b].titles).toHaveLength(4);
      for (const id of weaponsFor(b, 4)) expect(WEAPONS[id]).toBeDefined();
    }
  });

  it('Waffen kommen mit dem Rang dazu', () => {
    expect(weaponsFor('feuer', 1)).not.toContain('heuschleuder');
    expect(weaponsFor('feuer', 2)).toContain('heuschleuder');
    expect(weaponsFor('feuer', 4)).toContain('heuhagel');
    expect(weaponsFor('jungrind', 4)).toEqual(weaponsFor('jungrind', 1));
  });

  it('Titel und Lebenspunkte', () => {
    expect(titleFor('pflege', 3)).toBe('Hofärztin');
    expect(titleFor('jungrind', 1)).toBe('Jungrind');
    expect(maxHpFor(100, 'schleichen', 2)).toBe(100);
    expect(maxHpFor(100, 'jungrind', 1)).toBe(100);
  });
});
