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
}

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
 * @param relief  Höhenunterschied in Metern
 */
export function generateTerrain(seed: number, size = 96, cell = 1, relief = 9): Terrain {
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
      const h = (noise[z * size + x]! - 0.35) * relief * 1.6 + 1.5;
      heights[z * size + x] = lerp(-3, h, falloff);
    }
  }
  return { size, cell, heights };
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
