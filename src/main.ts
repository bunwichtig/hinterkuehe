import * as THREE from 'three';
import './style.css';
import { VERSION } from './config/ids';
import { DEFAULT_SETTINGS, cleanSettings, rulesFor, type Settings } from './config/settings';
import { storage } from './config/storage';
import { BRANCHES, CAREERS, RANK_XP, titleFor } from './game/careers';
import { Game, TEAM_STYLES } from './game/game';
import { aimPreview, needsPower } from './game/predict';
import { generateTerrain, type Terrain, type Theme } from './game/terrain';
import type { CowTuple, Snapshot } from './game/types';
import { WEAPONS, isWeaponId, type WeaponId } from './game/weapons';
import { ClientSession } from './net/client';
import { HostSession } from './net/host';
import { inviteLink, readInvite, suggestName, suggestPassword, suggestRoom } from './net/invite';
import { hostLocal, joinLocal } from './net/local';
import { hostPeer, joinPeer } from './net/peer';
import { MAX_TEAMS } from './net/protocol';
import { hashPw } from './net/room';
import type { Session } from './net/session';
import { Sound } from './ui/audio';
import { BattlefieldView } from './ui/scene3d';
import { SettingsForm } from './ui/settings-form';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

$('#ver').textContent = VERSION;
const LOCAL = new URLSearchParams(location.search).has('local');
$('#local-hint').hidden = !LOCAL;

// ───────────────────────── Bildschirme ─────────────────────────

type Screen = 'start' | 'lobby' | 'game';
let screen: Screen = 'start';
function showScreen(s: Screen): void {
  if (s === screen) return;
  screen = s;
  for (const id of ['start', 'lobby', 'game'] as const) $(`#screen-${id}`).hidden = id !== s;
  // Chat, Einstellungen und 3D-Ansicht wandern in den passenden Platz (Vorlage Kap. 13).
  if (s !== 'start') {
    $(`#chat-slot-${s}`).append($('#chat'));
    $(`#settings-slot-${s}`).append(settingsForm.el);
  }
  view?.moveTo($(s === 'game' ? '#battlefield-game' : '#battlefield-start'));
}
$('#chat').hidden = true;

// ───────────────────────── 3D-Ansicht ─────────────────────────

let view: BattlefieldView | null = null;
try {
  view = new BattlefieldView($('#battlefield-start'));
} catch {
  $('#battlefield-start').textContent = 'Dein Browser kann leider kein 3D (WebGL) anzeigen.';
}

/** Vorschau auf der Startseite: ein erzeugtes Schlachtfeld mit zwei Höfen. */
function showPreview(seed: number): void {
  if (!view) return;
  const settings = cleanSettings(storage.getJson('settings') ?? DEFAULT_SETTINGS);
  const game = new Game();
  game.addPlayer('a', 0);
  game.addPlayer('b', 1);
  game.startMatch(rulesFor(settings, 2), seed);
  view.show(game.terrain!, game.snapshot());
}
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
showPreview(newSeed());
$('#btn-reroll').addEventListener('click', () => showPreview(newSeed()));

// Einstellungen pro Gerät (nicht übertragen, Vorlage Kap. 8.5).
const sound = new Sound();
const device = { quality: 'mittel', cam: '1', sound: '0.7', ...(storage.getJson<Record<string, string>>('device') ?? {}) };
const deviceForm = $<HTMLFormElement>('#device-form');
const DEVICE_KEYS = ['quality', 'cam', 'sound'] as const;
function applyDevice(): void {
  for (const k of DEVICE_KEYS) (deviceForm.elements.namedItem(k) as HTMLSelectElement).value = device[k];
  view?.setQuality(device.quality as 'niedrig' | 'mittel' | 'hoch');
  if (view) view.controls.rotateSpeed = Number(device.cam) || 1;
  const vol = Number(device.sound) || 0;
  sound.enabled = vol > 0;
  sound.setVolume(vol);
}
deviceForm.addEventListener('change', () => {
  for (const k of DEVICE_KEYS) device[k] = (deviceForm.elements.namedItem(k) as HTMLSelectElement).value;
  storage.setJson('device', device);
  applyDevice();
});
applyDevice();

// ───────────────────────── Startseite ─────────────────────────

const form = $<HTMLFormElement>('#start-form');
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
field('name').value = storage.get('name') ?? suggestName();
field('room').value = storage.get('room') ?? suggestRoom();
// Passwort wird bewusst nicht gespeichert (Vorlage Kap. 21: Klartext im Speicher).
field('pw').value = suggestPassword();
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-dice]')) {
  btn.addEventListener('click', () => {
    const k = btn.dataset.dice!;
    field(k).value = k === 'name' ? suggestName() : k === 'room' ? suggestRoom() : suggestPassword();
  });
}

let session: Session | null = null;
let hostSession: HostSession | null = null;
let creds = { room: '', pw: '' };
let hostTimer = 0;

function startError(text: string): void {
  $('#start-error').textContent = text;
}

function busy(on: boolean): void {
  for (const id of ['#btn-host', '#btn-join']) $<HTMLButtonElement>(id).disabled = on;
}

function readStart(): { name: string; room: string; pw: string } | null {
  const name = field('name').value.trim();
  const room = field('room').value.trim();
  if (!name || !room) {
    startError('Bitte Name und Raum eintragen.');
    return null;
  }
  storage.set('name', name);
  storage.set('room', room);
  return { name, room, pw: field('pw').value };
}

async function createRoom(): Promise<void> {
  const f = readStart();
  if (!f) return;
  busy(true);
  startError('');
  try {
    const transport = LOCAL ? await hostLocal(f.room) : await hostPeer(f.room);
    const host = new HostSession({
      name: f.name,
      roomName: f.room,
      pwHash: await hashPw(f.room, f.pw),
      settings: storage.getJson('settings') ?? DEFAULT_SETTINGS,
      transport,
      onSettings: (s) => storage.setJson('settings', s),
    });
    creds = { room: f.room, pw: f.pw };
    hostSession = host;
    // Host-Takt: setInterval statt requestAnimationFrame, damit das Spiel auch im
    // Hintergrund-Tab weiterläuft (Vorlage Kap. 6).
    let last = performance.now();
    hostTimer = window.setInterval(() => {
      const now = performance.now();
      host.tick((now - last) / 1000);
      last = now;
    }, 1000 / 60);
    attach(host);
  } catch (e) {
    startError((e as Error).message);
  } finally {
    busy(false);
  }
}

async function joinRoom(): Promise<void> {
  const f = readStart();
  if (!f) return;
  busy(true);
  startError('Verbinde …');
  try {
    const transport = LOCAL ? await joinLocal(f.room) : await joinPeer(f.room);
    const client = new ClientSession(transport, f.name, await hashPw(f.room, f.pw));
    await client.joined;
    creds = { room: f.room, pw: f.pw };
    startError('');
    attach(client);
  } catch (e) {
    startError((e as Error).message);
  } finally {
    busy(false);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void createRoom();
});

/** „Am selben Gerät“: Host ohne Netz, alle Höfe spielen abwechselnd hier (Konzept Kap. 10). */
function playHere(): void {
  const name = field('name').value.trim() || suggestName();
  const seats = Number($<HTMLSelectElement>('#hotseat-teams').value) || 2;
  const transport = {
    onConnect: () => {},
    onMessage: () => {},
    onDisconnect: () => {},
    send: () => {},
    drop: () => {},
    close: () => {},
  };
  const host = new HostSession({
    name,
    roomName: 'Am selben Gerät',
    pwHash: '',
    settings: storage.getJson('settings') ?? DEFAULT_SETTINGS,
    transport,
    onSettings: (st) => storage.setJson('settings', st),
    hotseat: seats,
  });
  creds = { room: '', pw: '' };
  hostSession = host;
  let last = performance.now();
  hostTimer = window.setInterval(() => {
    const now = performance.now();
    host.tick((now - last) / 1000);
    last = now;
  }, 1000 / 60);
  attach(host);
}
$('#btn-hotseat').addEventListener('click', () => {
  sound.unlock();
  playHere();
});
$('#btn-join').addEventListener('click', () => void joinRoom());

// Einladungslink: Raum (und Passwort) eintragen; mit Passwort sofort beitreten.
const invite = readInvite(location.hash);
if (invite) {
  field('room').value = invite.room;
  if (invite.pw !== null) {
    field('pw').value = invite.pw;
    history.replaceState(null, '', location.pathname + location.search);
    void joinRoom();
  } else field('pw').value = '';
}

// ───────────────────────── Sitzung ─────────────────────────

const settingsForm = new SettingsForm((s: Settings) => hostSession?.setSettings(s));

function attach(s: Session): void {
  session = s;
  $('#chat').hidden = false;
  $('#chat-log').innerHTML = '';
  s.on('change', render);
  s.on('chat', () => renderChat());
  s.on('closed', (reason) => detach(reason));
  $<HTMLInputElement>('#invite-link').value = '';
  $('#btn-share').hidden = !('share' in navigator);
  $('#invite-panel').hidden = s instanceof HostSession && s.hotseat;
  lastFx = -1;
  render();
  renderChat();
}

function detach(reason: string): void {
  clearInterval(hostTimer);
  session = null;
  hostSession = null;
  lastPanelKey = '';
  lastFx = -1;
  $('#chat').hidden = true;
  document.body.append($('#chat'));
  showScreen('start');
  startError(reason);
  if (view) view.controls.autoRotate = true;
  showPreview(newSeed());
}

for (const b of document.querySelectorAll('[data-leave]')) {
  b.addEventListener('click', () => {
    session?.leave();
    if (hostSession) detach('Du hast den Raum geschlossen.');
  });
}
addEventListener('pagehide', () => session?.leave());

function render(): void {
  const s = session;
  if (!s || !s.lobby) return;
  const inGame = s.lobby.phase !== 'lobby' && !!s.state;
  showScreen(inGame ? 'game' : 'lobby');
  renderLobby(s);
  if (inGame) renderGame(s);
}

// ───────────────────────── Lobby ─────────────────────────

function updateInvite(): void {
  const withPw = $<HTMLInputElement>('#invite-pw').checked && creds.pw !== '';
  $<HTMLInputElement>('#invite-link').value = inviteLink(location.href, creds.room, withPw ? creds.pw : null);
}
$('#invite-pw').addEventListener('change', updateInvite);
$('#btn-copy').addEventListener('click', async () => {
  const input = $<HTMLInputElement>('#invite-link');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  $('#btn-copy').textContent = 'Kopiert ✓';
  setTimeout(() => ($('#btn-copy').textContent = 'Kopieren'), 1500);
});
$('#btn-share').addEventListener('click', () => {
  void navigator.share?.({ title: 'Hinterkühe', text: `Komm in meinen Raum „${creds.room}“!`, url: $<HTMLInputElement>('#invite-link').value }).catch(() => {});
});

function renderLobby(s: Session): void {
  const l = s.lobby!;
  const running = l.phase !== 'lobby';
  $('#lobby-title').textContent = `Raum „${l.roomName}“`;
  updateInvite();
  settingsForm.render(l.settings, s.isHost, running);
  $('#btn-start').hidden = !s.isHost;
  $('#btn-lobby').hidden = !s.isHost;

  const me = l.players.find((p) => p.id === s.me);
  const canSwitch = !running || !!me?.waiting;
  let html = '';
  for (let t = 0; t < MAX_TEAMS; t++) {
    const style = TEAM_STYLES[t]!;
    const players = l.players.filter((p) => p.team === t);
    const list = players
      .map((p) => {
        const move =
          s.isHost && p.id !== s.me && (!running || p.waiting)
            ? `<select data-move="${p.id}" aria-label="Hof für ${esc(p.name)}">${TEAM_STYLES.map((st, i) => `<option value="${i}"${i === t ? ' selected' : ''}>${st.name}</option>`).join('')}</select>`
            : '';
        return `<li>${esc(p.name)}${p.id === s.me ? ' (du)' : ''}${p.id === 'host' ? ' 👑' : ''}${p.waiting ? ' <em>schaut zu</em>' : ''} ${move}</li>`;
      })
      .join('');
    const join = canSwitch && me?.team !== t ? `<button type="button" class="ghost" data-team="${t}">Hierher</button>` : '';
    html += `<div class="team" style="--team:${style.color}"><h3>${style.name} <span class="wins">${l.wins[t] ? `${l.wins[t]} 🏆` : ''}</span></h3><ul>${list || '<li class="empty">leer</li>'}</ul>${join}</div>`;
  }
  $('#teams').innerHTML = html;
  const teams = new Set(l.players.filter((p) => !p.waiting).map((p) => p.team)).size;
  $('#lobby-msg').textContent = teams < 2 ? 'Zum Start müssen mindestens zwei Höfe besetzt sein. Lade jemanden mit dem Link ein.' : s.isHost ? '' : 'Warte, bis der Gastgeber startet.';
}

$('#teams').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-team]');
  if (b) session?.setTeam(Number(b.dataset.team));
});
$('#teams').addEventListener('change', (e) => {
  const sel = e.target as HTMLSelectElement;
  if (sel.dataset.move) hostSession?.movePlayer(sel.dataset.move, Number(sel.value));
});
$('#btn-start').addEventListener('click', () => {
  const err = hostSession?.startGame();
  if (err) $('#lobby-msg').textContent = err;
});
$('#btn-lobby').addEventListener('click', () => hostSession?.toLobby());

// ───────────────────────── Chat ─────────────────────────

function renderChat(): void {
  if (!session) return;
  $('#chat-log').innerHTML = session.chat
    .map((c) => (c.id ? `<li><b style="color:${esc(c.color)}">${esc(c.name)}:</b> ${esc(c.text)}</li>` : `<li class="sys">${esc(c.text)}</li>`))
    .join('');
  $('#chat-log').scrollTop = 1e9;
}
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = ($('#chat-form') as HTMLFormElement).elements.namedItem('text') as HTMLInputElement;
  session?.say(input.value);
  input.value = '';
});
$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = ($('#name-form') as HTMLFormElement).elements.namedItem('name') as HTMLInputElement;
  if (input.value.trim()) {
    session?.rename(input.value);
    storage.set('name', input.value.trim());
  }
  input.value = '';
});

// ───────────────────────── Spiel ─────────────────────────

const terrainCache = new Map<string, Terrain>();
const terrainFor = (seed: number, theme: Theme) => {
  const key = `${seed}:${theme}`;
  if (!terrainCache.has(key)) {
    terrainCache.clear();
    terrainCache.set(key, generateTerrain(seed, theme));
  }
  return terrainCache.get(key)!;
};

/** Zustand der Bedienung im eigenen Zug. */
const ui = {
  weapon: 'milchkanne' as WeaponId,
  pitch: 35,
  fuse: 3,
  /** Kraft beim letzten Schuss, für die Zielhilfe. */
  lastPower: 0.6,
  charging: false,
  chargeStart: 0,
  power: 0,
  /** Zug, für den die Kamera schon hinter die Kuh gestellt wurde. */
  behindTurn: '',
  /** Vorschau in der Kuhwahl (Tab). */
  preview: 0,
  myTurnSeen: -1,
  lastTick: -1,
};
let lastPanelKey = '';
let lastFx = -1;

const CHARGE_MS = 1500;

function myTeam(s: Session): number {
  if (s instanceof HostSession && s.hotseat) return -1;
  return s.lobby?.players.find((p) => p.id === s.me)?.team ?? -1;
}

function activeTuple(snap: Snapshot): CowTuple | undefined {
  return snap.cows.find((c) => c[0] === snap.activeCow);
}

/** Kann der eigene Browser gerade zielen und auslösen? */
function canAct(s: Session | null): boolean {
  const st = s?.state?.s;
  if (!s || !st || !s.myTurn || st.phase !== 'move' || st.acted) return false;
  return !activeTuple(st)?.[13];
}

function canWalk(s: Session | null): boolean {
  const st = s?.state?.s;
  return !!s && !!st && s.myTurn && st.phase === 'move';
}

function renderGame(s: Session): void {
  const { s: snap, ctrl } = s.state!;
  const l = s.lobby!;
  const team = myTeam(s);
  view?.update(snap, terrainFor, { myTeam: team });

  // Ereignisse für Bild und Ton (nur neue; beim Einstieg nichts nachholen)
  const newest = snap.fx.at(-1)?.[0] ?? 0;
  if (lastFx < 0) lastFx = newest;
  for (const f of snap.fx) {
    if (f[0] <= lastFx) continue;
    view?.playFx(f);
    sound.play(f[1], f[5]);
  }
  lastFx = Math.max(lastFx, newest);

  // Oben: Runde, Hof am Zug, Zeit, Wind, Hochwasser
  const activeTeam = snap.teams.find((t) => t.index === snap.activeTeam);
  const ctrlName = l.players.find((p) => p.id === ctrl)?.name ?? '';
  const windStrength = Math.hypot(snap.wind[0], snap.wind[1]);
  const flood =
    snap.floodIn < 0 ? '' : snap.floodIn > 0 ? `<span title="Hochwasser">🌊 in ${clock(snap.floodIn)}</span>` : `<span class="warn">🌊 Hochwasser ${snap.water} m</span>`;
  $('#hud-top').innerHTML =
    `<span>Runde ${snap.round}</span>` +
    (activeTeam ? `<span class="pill" style="--team:${activeTeam.color}">${esc(activeTeam.name)}${ctrlName ? ` · ${esc(ctrlName)}` : ''}</span>` : '') +
    (snap.phase === 'select' || snap.phase === 'move' ? `<span class="${snap.timeLeft <= 10 ? 'warn' : ''}">⏱ ${snap.timeLeft} s</span>` : '') +
    `<span title="Wind (Pfeil relativ zur Kamera)">🌬 <i class="arrow" id="wind-arrow">➜</i> ${windStrength.toFixed(1)}</span>` +
    flood;
  updateWindArrow();

  // Mitte: Meldung oder Siegerbanner
  if (snap.phase === 'roundEnd') {
    const w = snap.teams.find((t) => t.index === snap.winner);
    $('#overlay').innerHTML = `<div class="banner" style="--team:${w?.color ?? '#999'}">${w ? `🏆 ${esc(w.name)} gewinnt die Runde!` : 'Unentschieden'}<small>Nächste Runde gleich …</small></div>`;
  } else $('#overlay').textContent = snap.msg;

  // Höfe mit lebenden Kühen und Lebenspunkten
  $('#score').innerHTML = snap.teams
    .map((t) => {
      const cows = snap.cows.filter((c) => c[1] === t.index && (!c[15] || team < 0 || team === t.index));
      const hp = cows.reduce((a, c) => a + c[6], 0);
      return `<div class="pill" style="--team:${t.color}">${esc(t.name)}: ${cows.length} 🐄 · ${hp} LP · ${l.wins[t.index] ?? 0} 🏆</div>`;
    })
    .join('');

  // Bei neuem eigenen Zug: Ton, Kamera hinter die Kuh, Waffe prüfen
  if (s.myTurn && ui.myTurnSeen !== snap.turn) {
    ui.myTurnSeen = snap.turn;
    sound.yourTurn();
  }
  // Kamera: in der Kuhwahl zur ersten wählbaren Kuh, danach hinter die gewählte.
  const camKey = `${snap.turn}:${snap.phase === 'move' ? snap.activeCow : 'select'}`;
  if ((snap.phase === 'move' || snap.phase === 'select') && ui.behindTurn !== camKey) {
    const first = snap.cows.find((c) => c[1] === snap.activeTeam && !c[11]);
    const target = snap.phase === 'move' ? snap.activeCow : s.myTurn ? (first?.[0] ?? null) : null;
    if (target) {
      ui.behindTurn = camKey;
      ui.preview = 0;
      view?.behind(target);
    }
  }
  if (s.myTurn && (snap.phase === 'select' || snap.phase === 'move') && snap.timeLeft <= 5 && snap.timeLeft !== ui.lastTick) {
    ui.lastTick = snap.timeLeft;
    sound.tick();
  }
  if (canAct(s)) ensureWeapon(snap);

  // Zugbereich nur neu bauen, wenn sich der Zug ändert (sonst verliert man Fokus und Regler).
  const cow = activeTuple(snap);
  const selectable = snap.cows.filter((c) => c[1] === snap.activeTeam && !c[11]).map((c) => c[0]);
  const key = [snap.turn, snap.phase, s.myTurn, snap.activeCow, cow?.[13], cow?.[9], selectable.join(), snap.acted, snap.arsenal.map((a) => a.join(':')).join(), ui.weapon].join('|');
  if (key !== lastPanelKey) {
    lastPanelKey = key;
    $('#turn-panel').innerHTML = turnPanel(s);
  }
  updateLive(s);
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function updateWindArrow(): void {
  const st = session?.state?.s;
  const el = document.getElementById('wind-arrow');
  if (!st || !el || !view) return;
  const windYaw = (Math.atan2(-st.wind[1], st.wind[0]) * 180) / Math.PI;
  el.style.transform = `rotate(${(-90 - (windYaw - view.cameraYaw())).toFixed(0)}deg)`;
}

/** Gewählte Waffe gültig halten: sonst die erste mit Munition. */
function ensureWeapon(snap: Snapshot): void {
  const ok = snap.arsenal.find(([w, a]) => w === ui.weapon && a !== 0 && w !== 'zugende');
  if (ok) return;
  const pick = snap.arsenal.find(([w, a]) => a !== 0 && w === 'milchkanne') ?? snap.arsenal.find(([w, a]) => a !== 0 && w !== 'zugende');
  if (pick) ui.weapon = pick[0];
}

function bar(cls: string, value: number, max: number, text: string): string {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="meter ${cls}"><i style="width:${pct}%"></i><span>${text}</span></div>`;
}

function cowCard(c: CowTuple): string {
  const nextXp = RANK_XP[c[9]];
  return (
    `<div class="cowcard"><b>${esc(titleFor(c[8], c[9]))} ${esc(c[12])}</b>` +
    `<span class="rank">${'🔔'.repeat(c[9])}${c[15] ? ' 🌫️ getarnt' : ''}</span>` +
    `<div class="bars"><span data-live="hp">${bar('hp', c[6], c[7], `${c[6]}/${c[7]} LP`)}</span>` +
    `<span data-live="st">${bar('st', c[10], Math.max(c[10], 140), `Ausdauer ${c[10]}`)}</span></div>` +
    `<small class="xp">${c[14]} EP${nextXp !== undefined ? ` · nächster Rang ab ${nextXp}` : ' · höchster Rang'}</small></div>`
  );
}

function turnPanel(s: Session): string {
  const { s: snap, ctrl } = s.state!;
  const mine = s.myTurn;
  const who = s.lobby!.players.find((p) => p.id === ctrl)?.name;
  const cow = activeTuple(snap);
  if (snap.phase === 'roundEnd') return `<p>${esc(snap.msg)} Gleich geht es weiter …</p>`;
  if (!mine) {
    return `<p>${who ? `<b>${esc(who)}</b> ist am Zug.` : 'Warte …'}</p>${cow ? cowCard(cow) : ''}`;
  }
  if (snap.phase === 'select') {
    const cows = snap.cows.filter((c) => c[1] === snap.activeTeam && !c[11]);
    return (
      `<p><b>Du bist dran.</b> Wähle eine Kuh (Klick auf die Kuh, Taste 1–${cows.length} oder Tab + Eingabe):</p><div class="row cows">` +
      cows
        .map(
          (c, i) =>
            `<button type="button" data-cow="${c[0]}"><kbd>${i + 1}</kbd> ${esc(titleFor(c[8], c[9]))} ${esc(c[12])} · ${c[6]} LP</button>`,
        )
        .join('') +
      `</div><div class="row"><button type="button" class="ghost" data-end>Zug beenden</button></div>`
    );
  }
  if (snap.phase === 'resolve') return `${cow ? cowCard(cow) : ''}<p>Geschosse fliegen …</p>`;
  if (snap.phase !== 'move' || !cow) return '<p>…</p>';

  if (cow[13]) {
    return (
      cowCard(cow) +
      `<p><b>${esc(cow[12])} wird befördert!</b> Wähle die Laufbahn:</p><div class="row branches">` +
      BRANCHES.map(
        (b) =>
          `<button type="button" data-branch="${b}"><b>${esc(CAREERS[b].label)}</b><small>${esc(BRANCH_INFO[b])}</small></button>`,
      ).join('') +
      '</div>'
    );
  }

  const usable = snap.arsenal.filter(([w]) => w !== 'zugende');
  const weapons = usable
    .map(([w, a], i) => {
      const wp = WEAPONS[w];
      const ammo = a < 0 ? '∞' : `×${a}`;
      return `<button type="button" class="weapon${w === ui.weapon ? ' on' : ''}" data-weapon="${w}" ${a === 0 || snap.acted ? 'disabled' : ''} title="${esc(wp.desc)}"><kbd>${i < 9 ? i + 1 : i === 9 ? 0 : ''}</kbd><span class="ico">${wp.icon}</span>${esc(wp.name)} <em>${ammo}</em></button>`;
    })
    .join('');
  const wp = WEAPONS[ui.weapon];
  const power = needsPower(ui.weapon);
  const actions = snap.acted
    ? '<p class="hint">Aktion benutzt. Du kannst noch laufen oder den Zug beenden.</p>'
    : `<div class="weapons">${weapons}</div>` +
      `<p class="hint"><b>${wp.icon} ${esc(wp.name)}:</b> ${esc(wp.desc)}${wp.wind && !wp.desc.includes('Wind') ? ' · Wind wirkt' : ''}</p>` +
      `<div class="row aim">` +
      (wp.kind === 'arc' || wp.kind === 'grenade' || wp.kind === 'lure' || wp.kind === 'straight'
        ? `<label>Neigung <span class="with-out"><input id="pitch" type="range" min="-20" max="85" value="${ui.pitch}" /><output id="pitch-out">${ui.pitch}°</output></span></label>`
        : '') +
      (wp.kind === 'grenade'
        ? `<label>Zünder <span class="with-out"><input id="fuse" type="range" min="1" max="5" value="${ui.fuse}" /><output id="fuse-out">${ui.fuse} s</output></span></label>`
        : '') +
      (power ? `<div class="power" title="Kraft"><i id="power-fill"></i><span>Kraft</span></div>` : '') +
      `</div>` +
      `<div class="row"><button type="button" class="fire" data-fire>${power ? '🎯 Feuer (halten)' : '🎯 Auslösen'}</button>`;
  return (
    cowCard(cow) +
    actions +
    (snap.acted ? '<div class="row">' : '') +
    `<button type="button" class="ghost" data-jump>⤒ Springen</button><button type="button" class="ghost" data-end>⏭ Zug beenden</button><button type="button" class="ghost" data-overview>🗺 Übersicht</button></div>` +
    `<div class="pad" aria-label="Laufen"><button type="button" data-walk="0,1">▲</button><button type="button" data-walk="-1,0">◀</button><button type="button" data-walk="0,-1">▼</button><button type="button" data-walk="1,0">▶</button></div>`
  );
}

const BRANCH_INFO: Record<(typeof BRANCHES)[number], string> = {
  feuer: 'schwere Bogenwaffen, große Krater, +20 LP',
  technik: 'Minen, Zäune, Sprengsack, Unterstand',
  pflege: 'heilen, betäuben, Kuh zurückholen',
  schleichen: 'weit laufen, Fernglas, Tarnung',
};

/** Werte, die sich jedes Bild ändern (Balken, Kraft), ohne den Zugbereich neu zu bauen. */
function updateLive(s: Session): void {
  const snap = s.state!.s;
  const cow = activeTuple(snap);
  if (cow) {
    const hp = document.querySelector('[data-live="hp"]');
    if (hp) hp.innerHTML = bar('hp', cow[6], cow[7], `${cow[6]}/${cow[7]} LP`);
    const st = document.querySelector('[data-live="st"]');
    if (st) st.innerHTML = bar('st', cow[10], Math.max(cow[10], 140), `Ausdauer ${cow[10]}`);
  }
}

function setWeapon(id: WeaponId): void {
  if (!canAct(session)) return;
  const entry = session!.state!.s.arsenal.find(([w]) => w === id);
  if (!entry || entry[1] === 0) return;
  ui.weapon = id;
  lastPanelKey = '';
  render();
}

/** Auslösen mit der aktuellen Richtung (Kamera), Neigung, Kraft und Zünder. */
function fire(power: number): void {
  if (!canAct(session) || !view) return;
  ui.lastPower = needsPower(ui.weapon) ? power : ui.lastPower;
  session!.command({ k: 'fire', weapon: ui.weapon, aim: view.cameraYaw(), pitch: ui.pitch, power, fuse: ui.fuse });
}

function startCharge(): void {
  if (!canAct(session) || ui.charging) return;
  if (!needsPower(ui.weapon)) {
    fire(1);
    return;
  }
  ui.charging = true;
  ui.chargeStart = performance.now();
  ui.power = 0;
}

function releaseCharge(): void {
  if (!ui.charging) return;
  ui.charging = false;
  fire(Math.max(0.05, ui.power));
}

$('#turn-panel').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!t || !session) return;
  if (t.dataset.cow) session.command({ k: 'select', cow: t.dataset.cow });
  else if (t.dataset.branch && session.state?.s.activeCow)
    session.command({ k: 'branch', cow: session.state.s.activeCow, branch: t.dataset.branch as (typeof BRANCHES)[number] });
  else if (t.dataset.weapon) setWeapon(t.dataset.weapon as WeaponId);
  else if ('end' in t.dataset) session.command({ k: 'end' });
  else if ('jump' in t.dataset) session.command({ k: 'jump' });
  else if ('overview' in t.dataset) view?.toggleOverview();
});
$('#turn-panel').addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'pitch') {
    ui.pitch = Number(el.value);
    $('#pitch-out').textContent = `${ui.pitch}°`;
  } else if (el.id === 'fuse') {
    ui.fuse = Number(el.value);
    $('#fuse-out').textContent = `${ui.fuse} s`;
  }
});
// Feuerknopf halten (Handy und Maus)
$('#turn-panel').addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('[data-fire]')) {
    e.preventDefault();
    startCharge();
  }
});
addEventListener('pointerup', () => releaseCharge());
addEventListener('pointercancel', () => releaseCharge());

// ───────────────────────── Eingabe ─────────────────────────

/** Gedrückte Richtungen: Tastatur und Steuerkreuz. Vorwärts = von der Kamera weg. */
const held = new Set<string>();
const KEYS: Record<string, string> = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r' };
const typing = () => {
  const a = document.activeElement;
  return (a instanceof HTMLInputElement && a.type !== 'range') || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
};
addEventListener('keydown', (e) => {
  sound.unlock();
  if (typing() || screen !== 'game' || !session?.state) return;
  const snap = session.state.s;
  const k = KEYS[e.code];
  if (k) {
    held.add(k);
    e.preventDefault();
    return;
  }
  if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'].includes(e.code)) return;
  const mine = session.myTurn;
  switch (e.code) {
    case 'Enter':
      if (mine && snap.phase === 'select') {
        const cows = snap.cows.filter((c) => c[1] === snap.activeTeam && !c[11]);
        const c = cows[ui.preview % Math.max(1, cows.length)];
        if (c) session.command({ k: 'select', cow: c[0] });
      } else if (mine) session.command({ k: 'end' });
      break;
    case 'Tab': {
      if (!mine || snap.phase !== 'select') return;
      const cows = snap.cows.filter((c) => c[1] === snap.activeTeam && !c[11]);
      ui.preview = (ui.preview + 1) % Math.max(1, cows.length);
      if (cows[ui.preview]) view?.behind(cows[ui.preview]![0]);
      break;
    }
    case 'Space':
      if (canWalk(session)) session.command({ k: 'jump' });
      break;
    case 'KeyF':
      startCharge();
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      ui.pitch = Math.max(-20, Math.min(85, ui.pitch + (e.code === 'ArrowUp' ? 2 : -2)));
      if (document.getElementById('pitch')) {
        $<HTMLInputElement>('#pitch').value = String(ui.pitch);
        $('#pitch-out').textContent = `${ui.pitch}°`;
      }
      break;
    case 'ArrowLeft':
    case 'KeyQ':
      view?.orbit(3);
      break;
    case 'ArrowRight':
    case 'KeyE':
      view?.orbit(-3);
      break;
    case 'KeyM':
      view?.toggleOverview();
      break;
    case 'KeyT':
      ui.fuse = (ui.fuse % 5) + 1;
      lastPanelKey = '';
      render();
      break;
    default: {
      const m = /^Digit(\d)$/.exec(e.code);
      if (!m || !mine) return;
      const n = Number(m[1]);
      if (snap.phase === 'select') {
        const c = snap.cows.filter((c) => c[1] === snap.activeTeam && !c[11])[n - 1];
        if (c) session.command({ k: 'select', cow: c[0] });
      } else {
        const usable = snap.arsenal.filter(([w]) => w !== 'zugende');
        const w = usable[n === 0 ? 9 : n - 1];
        if (w) setWeapon(w[0]);
      }
      return;
    }
  }
  e.preventDefault();
});
addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (k) held.delete(k);
  if (e.code === 'KeyF') releaseCharge();
});
addEventListener('blur', () => {
  held.clear();
  ui.charging = false;
});
addEventListener('pointerdown', () => sound.unlock(), { capture: true });

const PAD: Record<string, string> = { '0,1': 'f', '0,-1': 'b', '-1,0': 'l', '1,0': 'r' };
$('#turn-panel').addEventListener('pointerdown', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-walk]');
  if (b) held.add(PAD[b.dataset.walk!]!);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
  $('#turn-panel').addEventListener(ev, () => {
    for (const k of Object.values(PAD)) held.delete(k);
  });

// Im Spiel: linke Maustaste auf dem Bild = Kraft aufladen und auslösen (Konzept Kap. 13),
// Kamera mit der rechten Maustaste. Klick auf eine Kuh in der Kuhwahl wählt sie.
const canvasSlot = $('#battlefield-game');
canvasSlot.addEventListener('contextmenu', (e) => e.preventDefault());
canvasSlot.addEventListener('pointerdown', (e) => {
  if (!session?.state || e.pointerType !== 'mouse' || e.button !== 0) return;
  const snap = session.state.s;
  if (session.myTurn && snap.phase === 'select' && view) {
    const id = view.pickCow(e.clientX, e.clientY);
    const c = snap.cows.find((k) => k[0] === id);
    if (c && c[1] === snap.activeTeam && !c[11]) session.command({ k: 'select', cow: c[0] });
    return;
  }
  if (canAct(session)) startCharge();
});

function updateMouseButtons(): void {
  if (!view) return;
  const aiming = screen === 'game' && canAct(session);
  // Beim Zielen dreht die rechte Maustaste die Kamera, die linke lädt die Kraft.
  view.controls.mouseButtons = {
    LEFT: aiming ? (null as unknown as THREE.MOUSE) : THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
}

let lastFrame = performance.now();
function inputLoop(now: number): void {
  requestAnimationFrame(inputLoop);
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  const s = session;
  updateMouseButtons();
  if (!s) return;
  if (s instanceof ClientSession) s.tick(dt);
  if (screen === 'game') updateWindArrow();

  // Kraft aufladen
  if (ui.charging) {
    ui.power = Math.min(1, (now - ui.chargeStart) / CHARGE_MS);
    if (!canAct(s)) ui.charging = false;
  }
  const fill = document.getElementById('power-fill');
  if (fill) fill.style.width = `${Math.round((ui.charging ? ui.power : 0) * 100)}%`;

  // Zielhilfe: eigene beim Zielen, sonst die des Spielers am Zug
  const snap = s.state?.s;
  const cow = snap ? activeTuple(snap) : undefined;
  const t = view?.currentTerrain;
  if (view && snap && cow && t && snap.phase === 'move' && !snap.acted) {
    let prev = null;
    if (canAct(s)) {
      const yaw = view.cameraYaw();
      prev = aimPreview(t, ui.weapon, { x: cow[2], y: cow[3], z: cow[4] }, yaw, ui.pitch, ui.charging ? ui.power : ui.lastPower);
      s.aim(yaw, ui.pitch, ui.weapon);
    } else if (snap.aim && isWeaponId(snap.aim[2])) {
      prev = aimPreview(t, snap.aim[2], { x: cow[2], y: cow[3], z: cow[4] }, snap.aim[0], snap.aim[1], 0.6);
    }
    view.setAimPath(prev?.path ?? null);
    view.setAimRing(prev?.ring ?? null);
    view.setGhost(prev?.ghost ?? null);
  } else if (view) {
    view.setAimPath(null);
    view.setAimRing(null);
    view.setGhost(null);
  }

  if (!canWalk(s) || !view) {
    s.walk([0, 0]);
    return;
  }
  const f = (held.has('f') ? 1 : 0) - (held.has('b') ? 1 : 0);
  const r = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0);
  if (!f && !r) {
    s.walk([0, 0]);
    return;
  }
  const [fx, fz] = view.groundForward();
  // Rechts von der Blickrichtung ist (-fz, fx).
  let x = fx * f - fz * r;
  let z = fz * f + fx * r;
  const len = Math.hypot(x, z) || 1;
  x = Math.round((x / len) * 4) / 4;
  z = Math.round((z / len) * 4) / 4;
  s.walk([x, z]);
}
requestAnimationFrame(inputLoop);
