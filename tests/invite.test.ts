import { describe, expect, it } from 'vitest';
import { inviteLink, readInvite, suggestPassword, suggestRoom } from '../src/net/invite';
import { parseClientMessage } from '../src/net/protocol';

describe('Einladungslink', () => {
  it('Hin und zurück, Passwort als Hex', () => {
    const link = inviteLink('https://x.github.io/hinterkuehe/?local#alt', 'Große Weide', '482.kfm');
    expect(link).toBe('https://x.github.io/hinterkuehe/?local#raum=Gro%C3%9Fe%20Weide&pwx=3438322e6b666d');
    expect(readInvite(link.split('#')[1]!)).toEqual({ room: 'Große Weide', pw: '482.kfm' });
  });

  it('ohne Passwort, alte Form pw= und Unsinn', () => {
    expect(readInvite(inviteLink('https://a/', 'Alm', null).split('#')[1]!)).toEqual({ room: 'Alm', pw: null });
    expect(readInvite('#raum=Alm&pw=muh')).toEqual({ room: 'Alm', pw: 'muh' });
    expect(readInvite('#raum=Alm&pwx=zz')).toEqual({ room: 'Alm', pw: null });
    expect(readInvite('#foo=1')).toBeNull();
    expect(readInvite('')).toBeNull();
  });

  it('Vorschläge haben das richtige Format', () => {
    expect(suggestPassword()).toMatch(/^\d{3}\.[a-z]{3}$/);
    expect(suggestRoom(() => 0)).toBe('Hinterweide 10');
  });
});

describe('Nachrichten prüfen', () => {
  it('begrenzt Laufrichtung und Kraft', () => {
    expect(parseClientMessage({ t: 'walk', dir: [5, -0.333] })).toEqual({ t: 'walk', dir: [1, -0.33] });
    const fire = parseClientMessage({ t: 'cmd', seq: 1, cmd: { k: 'fire', weapon: 'heuschleuder', aim: 0, pitch: 45, power: 3 } });
    expect(fire).toMatchObject({ cmd: { power: 1 } });
  });

  it('lässt nur bekannte Laufbahnen zu', () => {
    expect(parseClientMessage({ t: 'cmd', seq: 1, cmd: { k: 'branch', cow: 'k0-0', branch: 'feuer' } })).not.toBeNull();
    expect(parseClientMessage({ t: 'cmd', seq: 1, cmd: { k: 'branch', cow: 'k0-0', branch: 'jungrind' } })).toBeNull();
  });
});
