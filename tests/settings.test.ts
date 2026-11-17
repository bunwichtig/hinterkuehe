import { describe, expect, it } from 'vitest';
import { CLASSIC, DEFAULT_SETTINGS, cleanSettings, rulesFor } from '../src/config/settings';

describe('cleanSettings', () => {
  it('liefert Standardwerte für leere oder kaputte Eingaben', () => {
    expect(cleanSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings('quatsch')).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ mode: 'turbo', wind: 42 })).toEqual(DEFAULT_SETTINGS);
  });

  it('begrenzt Zahlen und rundet auf die Schrittweite', () => {
    const s = cleanSettings({ hp: 999, turnTime: '33', teamSize: 0, floodAfter: -4 });
    expect(s.hp).toBe(200);
    expect(s.turnTime).toBe(35);
    expect(s.teamSize).toBe(1);
    expect(s.floodAfter).toBe(0);
  });

  it('versteht Formularwerte für Schalter', () => {
    expect(cleanSettings({ fallDamage: 'off' }).fallDamage).toBe(false);
    expect(cleanSettings({ fallDamage: 'on' }).fallDamage).toBe(true);
  });
});

describe('rulesFor', () => {
  it('überschreibt im Modus klassisch die festen Werte', () => {
    const s = cleanSettings({ mode: 'klassisch', hp: 200, wind: 'aus' });
    const r = rulesFor(s, 2);
    expect(r.hp).toBe(CLASSIC.hp);
    expect(r.windMax).toBeGreaterThan(0);
  });

  it('übernimmt im Modus individuell die eigenen Werte', () => {
    const s = cleanSettings({ mode: 'individuell', hp: 150, wind: 'aus', turnTime: 20 });
    const r = rulesFor(s, 2);
    expect(r.hp).toBe(150);
    expect(r.windMax).toBe(0);
    expect(r.turnMs).toBe(20_000);
  });

  it('löst „zufall“ in eine echte Karte auf', () => {
    const r = rulesFor(cleanSettings({ map: 'zufall' }), 2, (c) => c[c.length - 1]!);
    expect(r.map).toBe('gletscher');
  });

  it('begrenzt die Zahl der Kühe bei vielen Teams', () => {
    const r = rulesFor(cleanSettings({ teamSize: 6 }), 4);
    expect(r.cowsPerTeam).toBe(4);
  });
});
