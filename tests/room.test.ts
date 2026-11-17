import { describe, expect, it } from 'vitest';
import { hashPw, peerIdFor, slug } from '../src/net/room';

describe('room', () => {
  it('slug macht Raumnamen URL- und PeerJS-tauglich', () => {
    expect(slug('  Große Weide #1 ')).toBe('grosse-weide-1');
    expect(slug('Café Kühstall')).toBe('cafe-kuehstall');
    expect(slug('x'.repeat(60))).toHaveLength(40);
  });

  it('peerIdFor nutzt das eigene Präfix', () => {
    expect(peerIdFor('Alm')).toBe('hinterkuehe-v1-alm');
  });

  it('hashPw ist stabil und hängt vom Raum ab', async () => {
    const a = await hashPw('Alm', 'muh');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPw('alm', 'muh')).toBe(a);
    expect(await hashPw('Weide', 'muh')).not.toBe(a);
  });
});
