import type { Terrain } from '../game/terrain';

export interface CowSprite {
  x: number;
  y: number;
  color: string;
  facing: -1 | 1;
}

/** Zeichnet Himmel, Gelände und Kühe. Alles mit Canvas-Formen, keine Bilddateien. */
export function drawScene(ctx: CanvasRenderingContext2D, t: Terrain, cows: CowSprite[]): void {
  const { width: w, height: h } = t;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#8ec9e8');
  sky.addColorStop(1, '#d9eef7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Boden
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x < w; x++) ctx.lineTo(x, h - t.ground[x]!);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = '#7a5233';
  ctx.fill();

  // Grasnarbe
  ctx.beginPath();
  for (let x = 0; x < w; x++) ctx.lineTo(x, h - t.ground[x]! + 4);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#5c9d3b';
  ctx.stroke();

  for (const cow of cows) drawCow(ctx, cow.x, h - cow.y, cow.color, cow.facing);
}

/** Einfache, eigene Kuh-Silhouette mit Teamhalsband. */
function drawCow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, facing: -1 | 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * 1.6, 1.6);
  // Beine
  ctx.fillStyle = '#3b2f2a';
  for (const lx of [-14, -6, 6, 14]) ctx.fillRect(lx - 2, -12, 4, 12);
  // Körper
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath();
  ctx.ellipse(0, -20, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Flecken
  ctx.fillStyle = '#3b2f2a';
  ctx.beginPath();
  ctx.ellipse(-8, -22, 6, 4, 0.4, 0, Math.PI * 2);
  ctx.ellipse(7, -17, 5, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Kopf
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath();
  ctx.ellipse(24, -28, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2b8a0';
  ctx.beginPath();
  ctx.ellipse(29, -25, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hörner
  ctx.strokeStyle = '#e9dcb5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, -34);
  ctx.lineTo(18, -40);
  ctx.moveTo(25, -35);
  ctx.lineTo(26, -41);
  ctx.stroke();
  // Halsband in Teamfarbe
  ctx.fillStyle = color;
  ctx.fillRect(15, -26, 4, 10);
  ctx.restore();
}
