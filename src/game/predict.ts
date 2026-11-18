import { heightAt, inside, type Terrain } from './terrain';
import { GRAVITY, WEAPONS, dirOf, launchVelocity, type WeaponId } from './weapons';

/**
 * Zielhilfe für die Anzeige: die ersten Meter der Flugbahn (ohne Wind, den muss man selbst lesen),
 * der Zielpunkt eines Luftschlags oder der Ablageort. Rechnet nur, verändert nichts.
 */
export interface AimPreview {
  path: [number, number, number][] | null;
  ring: [number, number, number] | null;
  ghost: [number, number] | null;
}

export function aimPreview(
  t: Terrain,
  weaponId: WeaponId,
  cow: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  power: number,
  seconds = 0.75,
): AimPreview {
  const wp = WEAPONS[weaponId];
  const [dx, dz] = dirOf(yaw);
  const none: AimPreview = { path: null, ring: null, ghost: null };
  switch (wp.kind) {
    case 'arc':
    case 'grenade':
    case 'lure':
    case 'straight': {
      const [vx, vy, vz] = launchVelocity(wp, yaw, pitch, power);
      let [x, y, z] = [cow.x + dx * 0.5, cow.y + 1.5, cow.z + dz * 0.5];
      const [ux, uz] = [vx, vz];
      let uy = vy;
      const path: [number, number, number][] = [[x, y, z]];
      const straight = wp.kind === 'straight';
      const total = straight ? Math.min(wp.range, 30) / wp.speed : seconds;
      const n = 24;
      const h = total / n;
      for (let i = 0; i < n; i++) {
        if (!straight) uy -= GRAVITY * h;
        x += ux * h;
        y += uy * h;
        z += uz * h;
        if (!inside(t, x, z)) break;
        path.push([x, y, z]);
        if (y < heightAt(t, x, z)) break;
      }
      return { ...none, path };
    }
    case 'airstrike': {
      const dist = 8 + power * (wp.range - 8);
      return { ...none, ring: [cow.x + dx * dist, cow.z + dz * dist, 5] };
    }
    case 'place':
      if (weaponId === 'unterstand') return { ...none, ring: [cow.x, cow.z, 2] };
      return { ...none, ghost: [cow.x + dx * (weaponId === 'weidezaun' ? 2.2 : 1.5), cow.z + dz * (weaponId === 'weidezaun' ? 2.2 : 1.5)] };
    case 'heal':
      return { ...none, ring: [cow.x, cow.z, wp.radius] };
    case 'melee':
      return { ...none, path: [[cow.x, cow.y + 1.2, cow.z], [cow.x + dx * wp.radius, cow.y + 1.2, cow.z + dz * wp.radius]] };
    default:
      return none;
  }
}

/** Braucht die Waffe Kraft (Maustaste halten) oder löst sie sofort aus? */
export function needsPower(id: WeaponId): boolean {
  const k = WEAPONS[id].kind;
  return k === 'arc' || k === 'grenade' || k === 'lure' || k === 'airstrike';
}
