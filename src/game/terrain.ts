import { createRng } from './rng';

/**
 * Gelände als Höhenprofil: für jede Pixelspalte die Höhe des Bodens (vom unteren Rand).
 * Ein Höhenprofil reicht für das Gerüst. Höhlen und Überhänge kommen später mit
 * einer Bitmaske (siehe docs/konzept.md, „Gelände“).
 */
export interface Terrain {
  width: number;
  height: number;
  /** Bodenhöhe je Spalte in Pixeln, gemessen vom unteren Rand. */
  ground: Float32Array;
}

/** Erzeugt sanfte Hügel aus überlagerten Sinuswellen, abhängig vom Seed. */
export function generateTerrain(seed: number, width = 1600, height = 800): Terrain {
  const rng = createRng(seed);
  const waves = Array.from({ length: 4 }, (_, i) => ({
    amp: (0.18 / (i + 1)) * height * (0.6 + rng() * 0.8),
    freq: ((i + 1) * (1 + rng())) / width,
    phase: rng() * Math.PI * 2,
  }));
  const base = height * 0.35;
  const ground = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let h = base;
    for (const w of waves) h += w.amp * Math.sin(x * w.freq * Math.PI * 2 + w.phase);
    ground[x] = Math.max(height * 0.08, Math.min(height * 0.85, h));
  }
  return { width, height, ground };
}

/** Sprengt einen runden Krater mit Mittelpunkt (cx, cy) und Radius r ins Profil. */
export function carveCrater(t: Terrain, cx: number, cy: number, r: number): void {
  const from = Math.max(0, Math.floor(cx - r));
  const to = Math.min(t.width - 1, Math.ceil(cx + r));
  for (let x = from; x <= to; x++) {
    const dy = Math.sqrt(Math.max(0, r * r - (x - cx) ** 2));
    const bottom = cy - dy;
    const top = cy + dy;
    const g = t.ground[x]!;
    // Nur abtragen, wenn der Krater die Oberfläche erreicht.
    if (bottom < g) t.ground[x] = Math.max(0, bottom + Math.max(0, g - top));
  }
}
