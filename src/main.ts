import './style.css';
import { VERSION } from './config/ids';
import { DEFAULT_SETTINGS, cleanSettings, rulesFor, type Settings } from './config/settings';
import { storage } from './config/storage';
import { BRANCHES, CAREERS, titleFor } from './game/careers';
import { Game, TEAM_STYLES } from './game/game';
import { generateTerrain } from './game/terrain';
import { WEAPONS } from './game/weapons';
import { ClientSession } from './net/client';
import { HostSession } from './net/host';
import { inviteLink, readInvite, suggestName, suggestPassword, suggestRoom } from './net/invite';
import { hostLocal, joinLocal } from './net/local';
import { hostPeer, joinPeer } from './net/peer';
import { MAX_TEAMS } from './net/protocol';
import { hashPw } from './net/room';
import type { Session } from './net/session';
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
const device = { quality: 'mittel', cam: '1', ...(storage.getJson<Record<string, string>>('device') ?? {}) };
const deviceForm = $<HTMLFormElement>('#device-form');
function applyDevice(): void {
  (deviceForm.elements.namedItem('quality') as HTMLSelectElement).value = device.quality;
  (deviceForm.elements.namedItem('cam') as HTMLSelectElement).value = device.cam;
  view?.setQuality(device.quality as 'niedrig' | 'mittel' | 'hoch');
  if (view) view.controls.rotateSpeed = Number(device.cam) || 1;
}
deviceForm.addEventListener('change', () => {
  device.quality = (deviceForm.elements.namedItem('quality') as HTMLSelectElement).value;
  device.cam = (deviceForm.elements.namedItem('cam') as HTMLSelectElement).value;
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
  render();
  renderChat();
}

function detach(reason: string): void {
  clearInterval(hostTimer);
  session = null;
  hostSession = null;
  lastTurnKey = '';
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

const terrainCache = new Map<number, ReturnType<typeof generateTerrain>>();
const terrainFor = (seed: number) => {
  if (!terrainCache.has(seed)) {
    terrainCache.clear();
    terrainCache.set(seed, generateTerrain(seed));
  }
  return terrainCache.get(seed)!;
};

let lastTurnKey = '';

function renderGame(s: Session): void {
  const { s: snap, ctrl } = s.state!;
  const l = s.lobby!;
  view?.update(snap, terrainFor);
  const team = snap.teams.find((t) => t.index === snap.activeTeam);
  const ctrlName = l.players.find((p) => p.id === ctrl)?.name ?? '';
  const windStrength = Math.hypot(snap.wind[0], snap.wind[1]);
  const windDir = (Math.atan2(snap.wind[1], snap.wind[0]) * 180) / Math.PI;
  $('#hud-top').innerHTML =
    `<span>Runde ${snap.round}</span>` +
    (team ? `<span class="pill" style="--team:${team.color}">${esc(team.name)}${ctrlName ? ` · ${esc(ctrlName)}` : ''}</span>` : '') +
    (snap.phase === 'select' || snap.phase === 'move' ? `<span>⏱ ${snap.timeLeft} s</span>` : '') +
    `<span title="Wind">🌬 <i class="arrow" style="transform:rotate(${windDir.toFixed(0)}deg)">➜</i> ${windStrength.toFixed(1)}</span>`;
  $('#overlay').textContent = snap.msg;
  $('#score').innerHTML = snap.teams
    .map((t) => {
      const alive = snap.cows.filter((c) => c[1] === t.index).length;
      return `<div class="pill" style="--team:${t.color}">${esc(t.name)}: ${alive} Kühe · ${l.wins[t.index] ?? 0} 🏆</div>`;
    })
    .join('');

  const cow = snap.cows.find((c) => c[0] === snap.activeCow);
  // Teile nur neu bauen, wenn sich der Zug ändert (sonst verliert man Auswahl und Fokus).
  const selectable = snap.cows.filter((c) => c[1] === snap.activeTeam && !c[11]).map((c) => c[0]);
  const key = [snap.turn, snap.phase, ctrl === s.me, snap.activeCow, cow?.[13], selectable.join()].join('|');
  if (key !== lastTurnKey) {
    lastTurnKey = key;
    $('#turn-panel').innerHTML = turnPanel(s);
  }
  const st = $('#stamina');
  if (st && cow) st.textContent = `Ausdauer ${cow[10]} · Leben ${cow[6]}/${cow[7]}`;
}

function turnPanel(s: Session): string {
  const { s: snap, ctrl } = s.state!;
  const mine = ctrl === s.me;
  const who = s.lobby!.players.find((p) => p.id === ctrl)?.name;
  if (snap.phase === 'roundEnd') return `<p>${esc(snap.msg)}. Gleich geht es weiter …</p>`;
  if (!mine) return `<p>${who ? `${esc(who)} ist am Zug.` : 'Warte …'}</p>`;
  if (snap.phase === 'select') {
    const cows = snap.cows.filter((c) => c[1] === snap.activeTeam && !c[11]);
    return (
      `<p><b>Du bist dran.</b> Wähle eine Kuh:</p><div class="row">` +
      cows.map((c) => `<button type="button" data-cow="${c[0]}">${esc(titleFor(c[8], c[9]))} ${esc(c[12])} · ${c[6]} LP</button>`).join('') +
      `</div><div class="row"><button type="button" class="ghost" data-end>Zug beenden</button></div>`
    );
  }
  if (snap.phase === 'move') {
    const cow = snap.cows.find((c) => c[0] === snap.activeCow);
    const branch = cow?.[13]
      ? `<p>${esc(cow[12])} wird befördert. Wähle die Laufbahn:</p><div class="row">${BRANCHES.map((b) => `<button type="button" data-branch="${b}">${esc(CAREERS[b].label)}</button>`).join('')}</div>`
      : '';
    const weapons = Object.values(WEAPONS)
      .filter((w) => w.id !== 'zugende')
      .map((w) => `<option value="${w.id}">${esc(w.name)}</option>`)
      .join('');
    return (
      `<p><b>${cow ? esc(cow[12]) : ''}</b> <span id="stamina"></span></p>${branch}` +
      `<div class="pad" aria-label="Laufen"><button type="button" data-walk="0,1">▲</button><button type="button" data-walk="-1,0">◀</button><button type="button" data-walk="0,-1">▼</button><button type="button" data-walk="1,0">▶</button></div>` +
      `<div class="row"><label>Waffe <select id="weapon">${weapons}</select></label>` +
      `<label>Kraft <input id="power" type="range" min="0" max="100" value="60" /></label></div>` +
      `<div class="row"><button type="button" data-fire>Auslösen</button><button type="button" class="ghost" data-end>Zug beenden</button></div>` +
      `<p class="hint">Zielen und Geschossflug kommen mit dem spielbaren Prototyp. „Auslösen“ zählt schon als Aktion und beendet den Zug.</p>`
    );
  }
  return '<p>…</p>';
}

$('#turn-panel').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!t || !session) return;
  if (t.dataset.cow) session.command({ k: 'select', cow: t.dataset.cow });
  else if (t.dataset.branch && session.state?.s.activeCow)
    session.command({ k: 'branch', cow: session.state.s.activeCow, branch: t.dataset.branch as (typeof BRANCHES)[number] });
  else if ('end' in t.dataset) session.command({ k: 'end' });
  else if ('fire' in t.dataset) {
    const weapon = $<HTMLSelectElement>('#weapon').value;
    const power = Number($<HTMLInputElement>('#power').value) / 100;
    session.command({ k: 'fire', weapon, aim: 0, pitch: 45, power });
  }
});

// ───────────────────────── Eingabe ─────────────────────────

/** Gedrückte Richtungen: Tastatur und Steuerkreuz. Vorwärts = von der Kamera weg. */
const held = new Set<string>();
const KEYS: Record<string, string> = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
};
const typing = () => {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
};
addEventListener('keydown', (e) => {
  if (typing() || screen !== 'game') return;
  const k = KEYS[e.code];
  if (k) {
    held.add(k);
    e.preventDefault();
  } else if (e.code === 'Enter' && session?.myTurn) session.command({ k: 'end' });
});
addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (k) held.delete(k);
});
addEventListener('blur', () => held.clear());

const PAD: Record<string, string> = { '0,1': 'f', '0,-1': 'b', '-1,0': 'l', '1,0': 'r' };
$('#turn-panel').addEventListener('pointerdown', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-walk]');
  if (b) held.add(PAD[b.dataset.walk!]!);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
  $('#turn-panel').addEventListener(ev, () => {
    for (const k of Object.values(PAD)) held.delete(k);
  });

let lastFrame = performance.now();
function inputLoop(now: number): void {
  requestAnimationFrame(inputLoop);
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  const s = session;
  if (!s) return;
  if (s instanceof ClientSession) s.tick(dt);
  if (!s.myTurn || s.state?.s.phase !== 'move' || !view) {
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
