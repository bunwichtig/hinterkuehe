import './style.css';
import { VERSION } from './config/ids';
import { DEFAULT_SETTINGS, cleanSettings, rulesFor } from './config/settings';
import { storage } from './config/storage';
import { Game } from './game/game';
import { generateTerrain } from './game/terrain';
import { drawScene } from './ui/render';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

$('#ver').textContent = VERSION;

// Letzte Eingaben wiederherstellen (wie in der Vorlage, Präfix hk-).
const form = $<HTMLFormElement>('#start-form');
for (const key of ['name', 'room'] as const) {
  const input = form.elements.namedItem(key) as HTMLInputElement;
  input.value = storage.get(key) ?? '';
  input.addEventListener('change', () => storage.set(key, input.value.trim()));
}

/** Vorschau: eine Runde mit zwei Teams aufbauen und das Feld zeichnen. */
function renderPreview(seed: number): void {
  const canvas = $<HTMLCanvasElement>('#preview');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const settings = cleanSettings(storage.getJson('settings') ?? DEFAULT_SETTINGS);
  const game = new Game();
  game.addPlayer('a', 0);
  game.addPlayer('b', 1);
  game.startMatch(rulesFor(settings, 2), seed);
  const snap = game.snapshot();
  const color = new Map(snap.teams.map((t) => [t.index, t.color]));
  drawScene(
    ctx,
    game.terrain ?? generateTerrain(seed),
    snap.cows.map(([, team, x, y, , facing]) => ({ x, y, color: color.get(team) ?? '#fff', facing })),
  );
}

let seed = Math.floor(Math.random() * 2 ** 31);
renderPreview(seed);
$('#btn-reroll').addEventListener('click', () => {
  seed = Math.floor(Math.random() * 2 ** 31);
  renderPreview(seed);
});
