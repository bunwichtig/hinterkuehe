import { defineConfig } from 'vitest/config';

// base './' damit das Spiel auf GitHub Pages unter /hinterkuehe/ läuft.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
