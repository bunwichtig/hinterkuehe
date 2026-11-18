import { createRng } from './rng';

/**
 * 3D-Gelände als Höhenkarte: ein Raster aus size × size Feldern zu je `cell` Metern.
 * heights[z * size + x] ist die Bodenhöhe in Metern. Unter WATER_LEVEL steht Wasser.
 *
 * Übers Netz geht nur der Seed plus die Liste der Krater, nie die Höhenkarte.
 */
export interface Terrain {
  size: number;
  cell: number;
  heights: Float32Array;
  theme: Theme;
}

/** Kartenthemen, siehe docs/konzept.md, Kap. 7. */
export type Theme = 'alm' | 'moor' | 'kornfeld' | 'steinbruch' | 'winterweide';

export interface ThemeInfo {
  label: string;
  /** Höhenunterschied in Metern. */
  relief: number;
  /** Grundhöhe: kleiner = mehr Wasserlöcher. */
  base: number;
  /** Stufenhöhe für Terrassen (0 = keine). */
  terrace: number;
  /** Faktor auf Kratergrößen (Fels bekommt kleinere Krater). */
  crater: number;
  /** Rutschen nach dem Landen: Anteil der Geschwindigkeit, der pro Schritt bleibt. */
  slide: number;
  /** Tief liegender Boden ist Schlamm und kostet doppelte Ausdauer. */
  mud: boolean;
  colors: { low: string; mid: string; high: string; steep: string; shore: string; sky: string; water: string };
}

export const THEMES: Record<Theme, ThemeInfo> = {
  alm: {
    label: 'Alm',
    relief: 9,
    base: 1.5,
    terrace: 0,
    crater: 1,
    slide: 0.8,
    mud: false,
    colors: { low: '#6fae45', mid: '#9cc95a', high: '#b9d77a', steep: '#8a7f72', shore: '#d9c38a', sky: '#9fd3ef', water: '#3d8fc4' },
  },
  moor: {
    label: 'Moor',
    relief: 5,
    base: 0.7,
    terrace: 0,
    crater: 1.1,
    slide: 0.75,
    mud: true,
    colors: { low: '#5d6b34', mid: '#7a8a44', high: '#93a35a', steep: '#6b5a44', shore: '#4f4230', sky: '#b7c4b0', water: '#4d6a55' },
  },
  kornfeld: {
    label: 'Kornfeld',
    relief: 3.5,
    base: 1.8,
    terrace: 0,
    crater: 1,
    slide: 0.8,
    mud: false,
    colors: { low: '#c9b04a', mid: '#e3c95e', high: '#efd77a', steep: '#a08a52', shore: '#d9c38a', sky: '#a9dcf5', water: '#3d8fc4' },
  },
  steinbruch: {
    label: 'Steinbruch',
    relief: 13,
    base: 1.6,
    terrace: 2.2,
    crater: 0.65,
    slide: 0.8,
    mud: false,
    colors: { low: '#8d8a6a', mid: '#a7a28c', high: '#c4beaa', steep: '#77706a', shore: '#bdb59a', sky: '#c3d6e0', water: '#4a83a8' },
  },
  winterweide: {
    label: 'Winterweide',
    relief: 8,
    base: 1.4,
    terrace: 0,
    crater: 1,
    slide: 0.97,
    mud: false,
    colors: { low: '#e6eef2', mid: '#f4f8fb', high: '#ffffff', steep: '#9aa7b0', shore: '#cfe3ee', sky: '#cfe0ea', water: '#7fb3d1' },
  },
};

export const THEME_NAMES = Object.keys(THEMES) as Theme[];

export const WATER_LEVEL = 0;

/** Wertrauschen mit weicher Interpolation, mehrere Oktaven. */
function valueNoise(rng: () => number, size: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const grid = 2 ** (o + 2) + 1;
    const pts = Float32Array.from({ length: grid * grid }, () => rng());
    const scale = (grid - 1) / (size - 1);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const gx = x * scale;
        const gz = z * scale;
        const x0 = Math.min(grid - 2, Math.floor(gx));
        const z0 = Math.min(grid - 2, Math.floor(gz));
        const tx = smooth(gx - x0);
        const tz = smooth(gz - z0);
        const a = pts[z0 * grid + x0]!;
        const b = pts[z0 * grid + x0 + 1]!;
        const c = pts[(z0 + 1) * grid + x0]!;
        const d = pts[(z0 + 1) * grid + x0 + 1]!;
        out[z * size + x]! += amp * lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
      }
    }
    total += amp;
    amp /= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Erzeugt eine Insel: Hügel in der Mitte, zum Rand hin abfallend ins Wasser.
 * Das Thema bestimmt Höhenunterschied, Wasserlöcher und Terrassen.
 */
export function generateTerrain(seed: number, theme: Theme = 'alm', size = 96, cell = 1): Terrain {
  const info = THEMES[theme] ?? THEMES.alm;
  const { relief, base, terrace } = info;
  const rng = createRng(seed);
  const noise = valueNoise(rng, size, 4);
  const heights = new Float32Array(size * size);
  const c = (size - 1) / 2;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dz = (z - c) / c;
      const edge = Math.min(1, Math.sqrt(dx * dx + dz * dz));
      const falloff = 1 - smooth(Math.max(0, (edge - 0.6) / 0.4));
      let h = (noise[z * size + x]! - 0.35) * relief * 1.6 + base;
      if (terrace > 0 && h > 0.5) {
        // Terrassen: flache Stufen mit steilen Kanten.
        const f = h / terrace;
        const fl = Math.floor(f);
        h = (fl + smooth(Math.max(0, (f - fl - 0.75) / 0.25))) * terrace;
      }
      heights[z * size + x] = lerp(-3, h, falloff);
    }
  }
  return { size, cell, heights, theme };
}

/** Bodenhöhe an einer beliebigen Stelle (bilinear interpoliert). */
export function heightAt(t: Terrain, x: number, z: number): number {
  const gx = Math.max(0, Math.min(t.size - 1.001, x / t.cell));
  const gz = Math.max(0, Math.min(t.size - 1.001, z / t.cell));
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const h = (ix: number, iz: number) => t.heights[iz * t.size + ix]!;
  return lerp(lerp(h(x0, z0), h(x0 + 1, z0), gx - x0), lerp(h(x0, z0 + 1), h(x0 + 1, z0 + 1), gx - x0), gz - z0);
}

/** Kantenlänge der Karte in Metern. */
export function spanOf(t: Terrain): number {
  return (t.size - 1) * t.cell;
}

/** Liegt der Punkt auf der Karte (nicht außerhalb des Rasters)? */
export function inside(t: Terrain, x: number, z: number): boolean {
  const s = spanOf(t);
  return x >= 0 && z >= 0 && x <= s && z <= s;
}

/** Drückt einen Krater (Kugel mit Mittelpunkt x/y/z, Radius r) in die Höhenkarte. */
export function carveCrater(t: Terrain, x: number, y: number, z: number, r: number): void {
  const from = (v: number) => Math.max(0, Math.floor((v - r) / t.cell));
  const to = (v: number) => Math.min(t.size - 1, Math.ceil((v + r) / t.cell));
  for (let iz = from(z); iz <= to(z); iz++) {
    for (let ix = from(x); ix <= to(x); ix++) {
      const dx = ix * t.cell - x;
      const dz = iz * t.cell - z;
      const d2 = r * r - dx * dx - dz * dz;
      if (d2 <= 0) continue;
      const bottom = y - Math.sqrt(d2);
      const i = iz * t.size + ix;
      if (t.heights[i]! > bottom) t.heights[i] = bottom;
    }
  }
}
