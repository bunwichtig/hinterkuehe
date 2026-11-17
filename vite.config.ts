import { defineConfig } from 'vitest/config';

// base './' damit das Spiel auf GitHub Pages unter /hinterkuehe/ läuft.
export default defineConfig({
  base: './',
  // Three.js allein ist ~500 kB (ca. 130 kB gzip), das ist für ein 3D-Spiel in Ordnung.
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
