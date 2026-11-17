import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import { ClientSession } from '../src/net/client';
import { HOST_ID, HostSession, ROUND_END_MS, TICK } from '../src/net/host';
import { MAX_PLAYERS, PROTOCOL } from '../src/net/protocol';
import type { Session } from '../src/net/session';
import { JOIN_TIMEOUT_MS } from '../src/net/transport';
import { memoryNetwork } from './helpers';

function seeded(seed = 7) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

function setup(settings: object = {}) {
  const net = memoryNetwork();
  const saved: unknown[] = [];
  const host = new HostSession({
    name: 'Hanna',
    roomName: 'Hinterweide',
    pwHash: 'h4sh',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    transport: net.host,
    onSettings: (s) => saved.push(s),
    random: seeded(),
  });
  const join = (name = 'Gast', pw = 'h4sh') => {
    const t = net.connect();
    return { t, c: new ClientSession(t, name, pw) };
  };
  return { net, host, join, saved };
}

/** Lässt `ms` Millisekunden Spielzeit vergehen. */
function run(host: HostSession, ms: number) {
  for (let t = 0; t < ms; t += 50) host.tick(0.05);
}

describe('Beitreten', () => {
  it('nimmt Mitspieler mit richtigem Passwort auf und verteilt die Lobby', async () => {
    const { host, join } = setup();
    const { c } = join('Gustav');
    await c.joined;
    expect(c.me).toMatch(/^p[a-z0-9]{6}$/);
    expect(c.lobby?.roomName).toBe('Hinterweide');
    expect(c.lobby?.players.map((p) => p.name)).toEqual(['Hanna', 'Gustav']);
    // Zweiter Spieler landet automatisch im anderen Hof.
    expect(c.lobby?.players.map((p) => p.team)).toEqual([0, 1]);
    expect(host.lobby?.players).toHaveLength(2);
  });

  it('weist falsches Passwort, falsche Version und vollen Raum ab', async () => {
    const { net, join } = setup();
    await expect(join('X', 'falsch').c.joined).rejects.toThrow('Falsches Passwort');

    const t = net.connect();
    let reason = '';
    t.onMessage((m) => (reason = (m as { reason?: string }).reason ?? reason));
    t.raw({ t: 'join', name: 'Alt', pw: 'h4sh', v: PROTOCOL + 1 });
    expect(reason).toBe('version');

    for (let i = 1; i < MAX_PLAYERS; i++) await join(`S${i}`).c.joined;
    await expect(join('Zuviel').c.joined).rejects.toThrow('voll');
  });

  it('trennt Verbindungen, die sich nicht rechtzeitig vorstellen', () => {
    const { net, host } = setup();
    const t = net.connect();
    let closed = '';
    t.onClose((r) => (closed = r));
    run(host, JOIN_TIMEOUT_MS + 100);
    expect(closed).not.toBe('');
  });

  it('macht doppelte Namen eindeutig', async () => {
    const { join } = setup();
    const { c } = join('hanna');
    await c.joined;
    expect(c.lobby?.players.map((p) => p.name)).toEqual(['Hanna', 'hanna 2']);
  });

  it('ignoriert kaputte Nachrichten', async () => {
    const { join, host } = setup();
    const { t, c } = join();
    await c.joined;
    for (const bad of [null, 42, 'x', { t: 'cmd' }, { t: 'cmd', seq: 1, cmd: { k: 'boom' } }, { t: 'team', team: 'a' }])
      expect(() => t.raw(bad)).not.toThrow();
    expect(host.lobby?.players).toHaveLength(2);
  });
});

describe('Lobby und Einstellungen', () => {
  it('nur der Host ändert Einstellungen; sie werden gesäubert, gespeichert und verteilt', async () => {
    const { host, join, saved } = setup();
    const { c } = join();
    await c.joined;
    host.setSettings({ ...host.settings, mode: 'individuell', turnTime: 47, wind: 'orkan' });
    expect(c.lobby?.settings.turnTime).toBe(50);
    expect(c.lobby?.settings.wind).toBe('normal');
    expect(saved).toHaveLength(1);
    // Mitspieler haben keinen Weg, Einstellungen zu schicken.
    expect('setSettings' in c).toBe(false);
  });

  it('Hof wechseln geht in der Lobby, nicht mitten in der Runde', async () => {
    const { host, join } = setup();
    const { c } = join();
    await c.joined;
    c.setTeam(3);
    expect(host.lobby?.players.find((p) => p.id === c.me)?.team).toBe(3);
    c.setTeam(9);
    expect(host.lobby?.players.find((p) => p.id === c.me)?.team).toBe(3);
    host.startGame();
    c.setTeam(1);
    expect(host.lobby?.players.find((p) => p.id === c.me)?.team).toBe(3);
  });

  it('Spielstart braucht zwei besetzte Höfe', async () => {
    const { host, join } = setup();
    expect(host.startGame()).toMatch(/zwei Höfe/);
    const { c } = join();
    await c.joined;
    c.setTeam(0);
    expect(host.startGame()).toMatch(/zwei Höfe/);
    c.setTeam(1);
    expect(host.startGame()).toBeNull();
    expect(c.state?.s.phase).toBe('select');
    expect(c.lobby?.phase).toBe('select');
  });

  it('Einstellungen gelten ab der nächsten Runde', async () => {
    const { host, join } = setup({ mode: 'individuell', teamSize: 3 });
    const { c } = join();
    await c.joined;
    host.startGame();
    expect(c.state!.s.cows.filter((k) => k[1] === 0)).toHaveLength(3);
    host.setSettings({ ...host.settings, teamSize: 2 });
    expect(c.state!.s.cows.filter((k) => k[1] === 0)).toHaveLength(3);
    host.toLobby();
    expect(c.state).toBeNull();
    host.startGame();
    expect(c.state!.s.cows.filter((k) => k[1] === 0)).toHaveLength(2);
  });
});

describe('Züge über das Netz', () => {
  async function started() {
    const s = setup({ turnTime: 60 });
    const g = s.join('Gustav');
    await g.c.joined;
    s.host.startGame();
    return { ...s, ...g };
  }

  it('nur wer am Zug ist, darf steuern', async () => {
    const { host, c } = await started();
    const ctrl = host.state!.ctrl!;
    const active = ctrl === HOST_ID ? host : c;
    const other = ctrl === HOST_ID ? c : host;
    expect(active.myTurn).toBe(true);
    expect(other.myTurn).toBe(false);

    const cow = (s: Session) => s.state!.s.cows.find((k) => k[1] === s.state!.s.activeTeam)![0];
    other.command({ k: 'select', cow: cow(other) });
    expect(host.state!.s.phase).toBe('select');
    active.command({ k: 'select', cow: cow(active) });
    expect(host.state!.s.phase).toBe('move');
    expect(c.state!.s.activeCow).toBe(cow(active));
  });

  it('Laufen ist ein Zustand und bewegt die gewählte Kuh beim Host', async () => {
    const { host, c } = await started();
    const s = host.state!.ctrl === HOST_ID ? host : c;
    const id = s.state!.s.cows.find((k) => k[1] === s.state!.s.activeTeam)![0];
    s.command({ k: 'select', cow: id });
    const before = host.game.cow(id)!;
    const [x0, z0, st0] = [before.x, before.z, before.stamina];
    // In alle Richtungen probieren, bis eine begehbar ist (Wasser/Hang stoppen).
    for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      s.walk(dir);
      run(host, 500);
      if (host.game.cow(id)!.stamina < st0) break;
    }
    s.walk([0, 0]);
    const after = host.game.cow(id)!;
    expect(Math.hypot(after.x - x0, after.z - z0)).toBeGreaterThan(0.5);
    expect(after.stamina).toBeLessThan(st0);
    run(host, 200);
    const k = c.state!.s.cows.find((q) => q[0] === id)!;
    expect(k[2]).toBeCloseTo(after.x, 1);
  });

  it('wiederholte Befehle wirken nur einmal (Zähler statt Knopf)', async () => {
    const { host, c, t } = await started();
    if (host.state!.ctrl !== c.me) host.command({ k: 'end' });
    expect(host.state!.ctrl).toBe(c.me);
    const turn = host.state!.s.turn;
    t.raw({ t: 'cmd', seq: 50, cmd: { k: 'end' } });
    expect(host.state!.s.turn).toBe(turn + 1);
    host.command({ k: 'end' }); // Host gibt zurück
    expect(host.state!.ctrl).toBe(c.me);
    t.raw({ t: 'cmd', seq: 50, cmd: { k: 'end' } }); // Wiederholung
    t.raw({ t: 'cmd', seq: 49, cmd: { k: 'end' } }); // veraltet
    expect(host.state!.s.turn).toBe(turn + 2);
    expect(host.state!.ctrl).toBe(c.me);
  });

  it('Zeit läuft ab und der nächste Hof ist dran', async () => {
    const { host } = await started();
    const team = host.state!.s.activeTeam;
    run(host, 61_000);
    expect(host.state!.s.activeTeam).not.toBe(team);
  });

  it('Spieler eines Hofs steuern abwechselnd', async () => {
    const { host, join } = setup();
    const a = join('A');
    const b = join('B');
    await Promise.all([a.c.joined, b.c.joined]);
    a.c.setTeam(1);
    b.c.setTeam(1);
    host.startGame();
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const ctrl = host.state!.ctrl!;
      if (host.state!.s.activeTeam === 1) seen.push(ctrl);
      (ctrl === HOST_ID ? host : ctrl === a.c.me ? a.c : b.c).command({ k: 'end' });
    }
    expect(new Set(seen)).toEqual(new Set([a.c.me, b.c.me]));
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('Rundenende zählt den Sieg und startet nach der Pause die nächste Runde', async () => {
    const { host, c } = await started();
    for (const cow of host.game.cows) if (cow.team === 1) host.game.damage(cow.id, 999);
    // Zug beenden, damit der Host das Rundenende feststellt.
    const ctrl = host.state!.ctrl === HOST_ID ? host : c;
    ctrl.command({ k: 'end' });
    expect(host.state!.s.phase).toBe('roundEnd');
    expect(c.lobby?.wins[0]).toBe(1);
    run(host, ROUND_END_MS + 100);
    expect(host.state!.s.round).toBe(2);
    expect(host.state!.s.phase).toBe('select');
  });
});

describe('Kommen und Gehen', () => {
  it('wer mitten im Spiel kommt, schaut zu und spielt ab der nächsten Runde mit', async () => {
    const { host, join } = setup();
    const a = join('A');
    await a.c.joined;
    host.startGame();
    const late = join('Spät');
    await late.c.joined;
    expect(late.c.state?.s.phase).toBe('select');
    expect(late.c.lobby?.players.find((p) => p.id === late.c.me)?.waiting).toBe(true);
    late.c.setTeam(2);
    for (const cow of host.game.cows) if (cow.team === 1) host.game.damage(cow.id, 999);
    (host.state!.ctrl === HOST_ID ? host : a.c).command({ k: 'end' });
    run(host, ROUND_END_MS + 100);
    expect(late.c.lobby?.players.find((p) => p.id === late.c.me)?.waiting).toBe(false);
    expect(host.state!.s.teams.map((t) => t.index)).toEqual([0, 1, 2]);
  });

  it('bleibt nur ein Hof übrig, geht es zurück in die Lobby', async () => {
    const { host, join } = setup();
    const a = join('A');
    await a.c.joined;
    host.startGame();
    a.t.close();
    expect(host.game.phase).toBe('lobby');
    expect(host.lobby?.players).toHaveLength(1);
  });

  it('geht der Host, ist der Raum für alle zu', async () => {
    const { host, join } = setup();
    const a = join('A');
    await a.c.joined;
    let reason = '';
    a.c.on('closed', (r) => (reason = r));
    host.leave();
    expect(reason).toMatch(/Gastgeber/);
  });

  it('Hof ohne anwesende Spieler wird übersprungen', async () => {
    const { host, join } = setup();
    const a = join('A');
    const b = join('B');
    await Promise.all([a.c.joined, b.c.joined]);
    a.c.setTeam(1);
    b.c.setTeam(2);
    host.startGame();
    b.t.close(); // Hof 2 ist jetzt leer, Hof 0 und 1 spielen weiter
    expect(host.game.phase).not.toBe('lobby');
    for (let i = 0; i < 6; i++) {
      expect(host.state!.s.activeTeam).not.toBe(2);
      expect(host.state!.ctrl).not.toBeNull();
      (host.state!.ctrl === HOST_ID ? host : a.c).command({ k: 'end' });
    }
  });
});

describe('Chat', () => {
  it('Host setzt Name und Farbe, niemand schreibt unter fremdem Namen', async () => {
    const { join, host } = setup();
    const a = join('A');
    await a.c.joined;
    a.t.raw({ t: 'chat', text: 'x'.repeat(500), name: 'Hanna' });
    const line = host.chat.at(-1)!;
    expect(line.name).toBe('A');
    expect(line.text).toHaveLength(200);
    expect(a.c.chat.at(-1)?.text).toBe(line.text);
  });

  it('Neue bekommen die letzten 20 Nachrichten', async () => {
    const { join, host } = setup();
    for (let i = 0; i < 30; i++) host.say(`n${i}`);
    const a = join('A');
    await a.c.joined;
    expect(a.c.chat.length).toBeGreaterThanOrEqual(20);
    expect(a.c.chat.at(-2)?.text).toBe('n29');
  });
});

describe('Datenmenge', () => {
  it('verschickt den Spielstand nur, wenn er sich geändert hat', async () => {
    const { host, join, net } = setup();
    const a = join('A');
    await a.c.joined;
    host.startGame();
    run(host, 100);
    const count = () => net.sent.filter((s) => s.msg.t === 'state').length;
    const before = count();
    run(host, 400); // Zugzeit zählt in ganzen Sekunden, in 0,4 s höchstens ein Wechsel
    expect(count() - before).toBeLessThanOrEqual(1);
    expect(TICK).toBeCloseTo(1 / 60);
  });
});

describe('Sonderfälle', () => {
  it('leben nur noch Kühe verlassener Höfe, geht es zurück in die Lobby', async () => {
    const { host, join } = setup();
    const a = join('A');
    const b = join('B');
    const c = join('C');
    await Promise.all([a.c.joined, b.c.joined, c.c.joined]);
    a.c.setTeam(1);
    b.c.setTeam(2);
    c.c.setTeam(3);
    host.startGame();
    b.t.close();
    c.t.close();
    for (const cow of host.game.cows) if (cow.team <= 1) host.game.damage(cow.id, 999);
    const ctrl = host.state!.ctrl;
    (ctrl === HOST_ID ? host : a.c).command({ k: 'end' });
    expect(host.game.phase).toBe('lobby');
  });
});
