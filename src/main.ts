import './style.css';
import { VERSION } from './config/ids';
import { DEFAULT_SETTINGS, cleanSettings, rulesFor } from './config/settings';
import { storage } from './config/storage';
import { Game } from './game/game';
import { BattlefieldView } from './ui/scene3d';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

$('#ver').textContent = VERSION;

// Letzte Eingaben wiederherstellen (wie in der Vorlage, Präfix hk-).
const form = $<HTMLFormElement>('#start-form');
for (const key of ['name', 'room'] as const) {
  const input = form.elements.namedItem(key) as HTMLInputElement;
  input.value = storage.get(key) ?? '';
  input.addEventListener('change', () => storage.set(key, input.value.trim()));
}

let view: BattlefieldView | null = null;
try {
  view = new BattlefieldView($('#battlefield'));
} catch {
  $('#battlefield').textContent = 'Dein Browser kann leider kein 3D (WebGL) anzeigen.';
}

/** Vorschau: ein Gefecht mit zwei Höfen aufbauen und das Schlachtfeld zeigen. */
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
