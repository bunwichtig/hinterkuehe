/**
 * Lobby-Formular für die Einstellungen (Vorlage Kap. 7 und 8).
 *
 * Formularfelder heißen wie die Schlüssel in DEFAULT_SETTINGS. Gelesen wird
 * immer über cleanSettings(); nur der Host kann ändern, bei Mitspielern ist alles
 * ausgegraut. Im Modus „Klassisch“ sind nur Kühe pro Hof und Karte wählbar.
 */
import {
  BUNKER_LEVELS,
  CLASSIC,
  CRATE_LEVELS,
  LIMITS,
  MAPS,
  MODES,
  WIND_LEVELS,
  cleanSettings,
  type Settings,
} from '../config/settings';

type Key = keyof Settings;

interface Field {
  key: Key;
  label: string;
  options?: readonly (readonly [string, string])[];
  bool?: boolean;
}

const word = (list: readonly string[], names: Record<string, string> = {}) =>
  list.map((v) => [v, names[v] ?? v.charAt(0).toUpperCase() + v.slice(1)] as const);

const range = (key: keyof typeof LIMITS, fmt: (n: number) => string = String) => {
  const { min, max, step } = LIMITS[key];
  const out: (readonly [string, string])[] = [];
  for (let n = min; n <= max; n += step) out.push([String(n), fmt(n)]);
  return out;
};

export const FIELDS: Field[] = [
  { key: 'mode', label: 'Modus', options: word(MODES, { klassisch: 'Klassisch (feste Regeln)', individuell: 'Individuell (alles frei)' }) },
  { key: 'teamSize', label: 'Kühe pro Hof', options: range('teamSize') },
  { key: 'map', label: 'Karte', options: word(MAPS) },
  { key: 'hp', label: 'Lebenspunkte', options: range('hp') },
  { key: 'turnTime', label: 'Zugzeit', options: range('turnTime', (n) => `${n} s`) },
  { key: 'stamina', label: 'Ausdauer', options: range('stamina', (n) => `${n} %`) },
  { key: 'wind', label: 'Wind', options: word(WIND_LEVELS) },
  { key: 'bunkers', label: 'Bunker', options: word(BUNKER_LEVELS) },
  { key: 'crates', label: 'Kisten', options: word(CRATE_LEVELS) },
  { key: 'promotion', label: 'Beförderung', bool: true },
  { key: 'startRank', label: 'Startrang', options: range('startRank') },
  { key: 'fallDamage', label: 'Fallschaden', bool: true },
  { key: 'floodAfter', label: 'Hochwasser', options: range('floodAfter', (n) => (n === 0 ? 'aus' : `nach ${n} min`)) },
];

/** Felder, die „Klassisch“ fest vorgibt. */
const FIXED_IN_CLASSIC = new Set(Object.keys(CLASSIC));

export class SettingsForm {
  readonly el: HTMLFormElement;

  constructor(onChange: (s: Settings) => void) {
    this.el = document.createElement('form');
    this.el.className = 'settings';
    this.el.addEventListener('submit', (e) => e.preventDefault());
    for (const f of FIELDS) {
      const label = document.createElement('label');
      label.dataset.key = f.key;
      if (f.bool) {
        label.className = 'check';
        label.innerHTML = `<input type="checkbox" name="${f.key}" /> <span>${f.label}</span>`;
      } else {
        const opts = f.options!.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
        label.innerHTML = `<span>${f.label}</span><select name="${f.key}">${opts}</select>`;
      }
      this.el.append(label);
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.id = 'settings-hint';
    this.el.append(hint);
    this.el.addEventListener('change', () => onChange(this.read()));
  }

  /** Formular lesen, immer über cleanSettings(). */
  read(): Settings {
    const o: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const input = this.el.elements.namedItem(f.key) as HTMLInputElement | HTMLSelectElement;
      o[f.key] = f.bool ? (input as HTMLInputElement).checked : input.value;
    }
    return cleanSettings(o);
  }

  /** Werte anzeigen. `editable` nur beim Host; `running` zeigt den Hinweis „ab nächster Runde“. */
  render(s: Settings, editable: boolean, running: boolean): void {
    const classic = s.mode === 'klassisch';
    for (const f of FIELDS) {
      const input = this.el.elements.namedItem(f.key) as HTMLInputElement | HTMLSelectElement;
      const fixed = classic && FIXED_IN_CLASSIC.has(f.key);
      // Im Klassik-Modus die festen Werte zeigen, damit jeder sieht, was gespielt wird.
      const value = fixed ? (CLASSIC as Record<string, unknown>)[f.key] : s[f.key];
      if (f.bool) (input as HTMLInputElement).checked = value as boolean;
      else input.value = String(value);
      input.disabled = !editable || fixed;
      (input.parentElement as HTMLElement).classList.toggle('fixed', fixed);
    }
    const hint = this.el.querySelector('#settings-hint')!;
    hint.textContent = !editable
      ? 'Nur der Gastgeber kann die Einstellungen ändern.'
      : running
        ? 'Änderungen gelten ab der nächsten Runde.'
        : classic
          ? 'Klassisch: ausgewogene feste Werte. Für alles andere „Individuell“ wählen.'
          : '';
  }
}
