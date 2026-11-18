import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUNKER_HALF_X, BUNKER_HALF_Z, BUNKER_HEIGHT, FENCE_HALF, FENCE_HEIGHT } from '../game/game';
import { createRng } from '../game/rng';
import { THEMES, carveCrater, heightAt, spanOf, type Terrain, type Theme } from '../game/terrain';
import type { CowTuple, Fx, Snapshot } from '../game/types';
import type { WeaponId } from '../game/weapons';

/** Wie die Ansicht den Spielstand zeigen soll. */
export interface ViewOptions {
  /** Eigener Hof (getarnte Gegner und gegnerische Minen bleiben unsichtbar). -1 = alles zeigen. */
  myTeam: number;
}

interface CowView {
  obj: THREE.Group;
  rank: number;
  target: THREE.Vector3;
  heading: number;
  label: HTMLDivElement;
  hpBar: HTMLElement;
  data: CowTuple;
}

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
  gravity: number;
  fade: boolean;
}

interface Float {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  life: number;
}

/**
 * 3D-Darstellung mit Three.js im eigenen Low-Poly-Stil.
 * Alles wird aus Grundformen erzeugt, es gibt keine Bild- oder Modelldateien.
 * Gezeichnet wird nur, was im Schnappschuss steht – beim Host wie beim Mitspieler.
 */
export class BattlefieldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** HTML-Schicht über dem Bild: Namensschilder und schwebende Zahlen. */
  readonly labels = document.createElement('div');
  private world = new THREE.Group();
  private raf = 0;
  private cowViews = new Map<string, CowView>();
  private things = {
    bunkers: new Map<number, THREE.Object3D>(),
    fences: new Map<number, THREE.Object3D>(),
    mines: new Map<number, THREE.Object3D>(),
    satchels: new Map<number, THREE.Object3D>(),
    crates: new Map<number, THREE.Object3D>(),
    proj: new Map<number, THREE.Object3D>(),
  };
  private projTargets = new Map<number, THREE.Vector3>();
  private keys = { bunkers: '', fences: '' };
  private decor: { obj: THREE.Object3D; x: number; z: number }[] = [];
  private particles: Particle[] = [];
  private floats: Float[] = [];
  private marker: THREE.Mesh;
  private aimLine: THREE.Line;
  private aimRing: THREE.Mesh;
  private ghost: THREE.Mesh;
  private terrain: Terrain | null = null;
  private terrainGeo: THREE.BufferGeometry | null = null;
  private waterMesh: THREE.Mesh | null = null;
  private waterTarget = 0;
  private sun: THREE.DirectionalLight;
  private craterCount = 0;
  private shownKey = '';
  private follow: string | null = null;
  private followProj: number | null = null;
  private overview = false;
  private observer = new ResizeObserver(() => this.resize());
  private clock = new THREE.Clock();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.labels.className = 'labels';
    host.appendChild(this.labels);

    this.scene.background = new THREE.Color('#9fd3ef');
    this.scene.fog = new THREE.Fog('#9fd3ef', 80, 280);
    this.scene.add(this.world);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.3, 600);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 170;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.6;

    const hemi = new THREE.HemisphereLight('#e8f6ff', '#4d6b3a', 1.6);
    this.sun = new THREE.DirectionalLight('#fff4dc', 2.4);
    this.sun.position.set(108, 90, 78);
    this.sun.target.position.set(48, 0, 48);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 300 });
    this.scene.add(hemi, this.sun, this.sun.target);

    // Ring über der aktiven Kuh.
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 6, 18), new THREE.MeshBasicMaterial({ color: '#ffe066' }));
    this.marker.rotation.x = Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);

    // Zielhilfe: Linie der ersten Flugstrecke, Ring für Luftschlag und Heilen, Geist beim Ablegen.
    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: '#fff7c2', dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.95, depthTest: false }),
    );
    this.aimLine.visible = false;
    this.aimLine.frustumCulled = false;
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 40),
      new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }),
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    this.ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.2, 12),
      new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true, opacity: 0.5 }),
    );
    this.ghost.visible = false;
    this.scene.add(this.aimLine, this.aimRing, this.ghost);

    this.observer.observe(host);
    this.resize();
    this.loop();
  }

  // ───────────────────────── Aufbau ─────────────────────────

  /** Baut die ganze Szene aus Gelände und Schnappschuss neu auf. */
  show(t: Terrain, snap: Snapshot): void {
    this.world.clear();
    this.clearLabels();
    this.cowViews.clear();
    for (const m of Object.values(this.things)) m.clear();
    this.projTargets.clear();
    this.keys = { bunkers: '', fences: '' };
    this.decor = [];
    for (const p of this.particles) p.obj.removeFromParent();
    this.particles = [];
    this.terrain = { ...t, heights: Float32Array.from(t.heights) };
    this.shownKey = `${snap.mapSeed}:${snap.round}`;
    this.craterCount = 0;
    const theme = THEMES[t.theme];
    this.scene.background = new THREE.Color(theme.colors.sky);
    (this.scene.fog as THREE.Fog).color.set(theme.colors.sky);
    const span = spanOf(t);
    const center = new THREE.Vector3(span / 2, 0, span / 2);

    const mesh = terrainMesh(this.terrain);
    this.terrainGeo = mesh.geometry;
    this.waterMesh = water(span, theme.colors.water);
    this.waterTarget = snap.water;
    this.waterMesh.position.y = snap.water - 0.05;
    this.world.add(mesh, this.waterMesh);

    const rng = createRng(snap.mapSeed ^ 0x5eed);
    const decorCount = t.theme === 'kornfeld' ? 50 : t.theme === 'steinbruch' ? 45 : 75;
    for (let i = 0; i < decorCount; i++) {
      const x = span * (0.08 + rng() * 0.84);
      const z = span * (0.08 + rng() * 0.84);
      const y = heightAt(this.terrain, x, z);
      const roll = rng();
      if (y < 0.6) continue;
      if (snap.cows.some((c) => Math.hypot(c[2] - x, c[4] - z) < 4)) continue;
      if (snap.bunkers.some((b) => Math.hypot(b[1] - x, b[3] - z) < 5)) continue;
      const obj = decorFor(t.theme, roll, rng);
      obj.position.set(x, y, z);
      this.world.add(obj);
      this.decor.push({ obj, x, z });
    }
    this.syncAll(snap, { myTeam: -1 });

    this.controls.target.copy(center).setY(2);
    // Schmale Bildschirme (Handy hochkant) brauchen mehr Abstand, damit die Insel ganz zu sehen ist.
    const d = window.innerWidth < 700 ? 1.6 : 1;
    this.camera.position.set(center.x + span * 0.35 * d, span * 0.38 * d, center.z + span * 0.5 * d);
    this.controls.update();
  }

  /**
   * Spielstand anzeigen. Neue Runde → Szene neu aufbauen (Gelände aus Seed und Thema),
   * sonst Krater nachziehen und Dinge bewegen.
   */
  update(snap: Snapshot, makeTerrain: (seed: number, theme: Theme) => Terrain, opts: ViewOptions): void {
    const key = `${snap.mapSeed}:${snap.round}`;
    if (key !== this.shownKey || !this.terrain) {
      this.show(makeTerrain(snap.mapSeed, snap.map), snap);
      this.controls.autoRotate = false;
    }
    this.applyCraters(snap.craters);
    this.waterTarget = snap.water;
    this.syncAll(snap, opts);
    this.follow = snap.activeCow;
    this.followProj = snap.proj[0]?.[0] ?? null;
  }

  private syncAll(snap: Snapshot, opts: ViewOptions): void {
    const colors = new Map(snap.teams.map((tm) => [tm.index, tm.color]));
    const showAll = opts.myTeam < 0;

    // Kühe
    const alive = new Set<string>();
    for (const c of snap.cows) {
      const [id, team, x, y, z, heading, , , , rank, , , , , , hidden] = c;
      const invisible = hidden && !showAll && team !== opts.myTeam;
      if (invisible) continue;
      alive.add(id);
      let v = this.cowViews.get(id);
      if (v && v.rank !== rank) {
        this.world.remove(v.obj);
        v.label.remove();
        v = undefined;
        this.cowViews.delete(id);
      }
      if (!v) {
        const obj = cow(colors.get(team) ?? '#ffffff', rank);
        obj.position.set(x, y, z);
        obj.rotation.y = (heading * Math.PI) / 180;
        this.world.add(obj);
        const label = document.createElement('div');
        label.className = 'cow-label';
        label.style.setProperty('--team', colors.get(team) ?? '#fff');
        label.innerHTML = '<span class="n"></span><span class="hp"><i></i></span>';
        this.labels.append(label);
        v = { obj, rank, target: obj.position.clone(), heading, label, hpBar: label.querySelector('i')!, data: c };
        this.cowViews.set(id, v);
      }
      v.data = c;
      v.target.set(x, y, z);
      v.heading = heading;
      setOpacity(v.obj, hidden ? 0.35 : 1);
      v.label.querySelector('.n')!.textContent = `${c[12]} ${c[6]}`;
      v.hpBar.style.width = `${Math.max(0, Math.min(100, (c[6] / c[7]) * 100))}%`;
      v.label.classList.toggle('active', id === snap.activeCow);
    }
    for (const [id, v] of this.cowViews) {
      if (!alive.has(id)) {
        this.world.remove(v.obj);
        v.label.remove();
        this.cowViews.delete(id);
      }
    }

    // Bunker und Zäune nur neu bauen, wenn sich etwas ändert.
    const bKey = snap.bunkers.map((b) => b[0]).join();
    if (bKey !== this.keys.bunkers) {
      this.keys.bunkers = bKey;
      this.sync(this.things.bunkers, snap.bunkers, (b) => {
        const g = bunker(b[5]);
        g.position.set(b[1], b[2], b[3]);
        g.rotation.y = (b[4] * Math.PI) / 180;
        return g;
      });
    }
    this.sync(this.things.fences, snap.fences, (f) => {
      const g = fence();
      g.position.set(f[1], f[2], f[3]);
      g.rotation.y = (f[4] * Math.PI) / 180;
      return g;
    });
    this.sync(
      this.things.mines,
      snap.mines.filter((m) => showAll || m[4] === opts.myTeam),
      (m) => {
        const g = mine();
        g.position.set(m[1], m[2], m[3]);
        return g;
      },
      (obj, m) => {
        obj.userData.armed = m[5];
      },
    );
    this.sync(
      this.things.satchels,
      snap.satchels,
      (s) => {
        const g = satchel();
        g.position.set(s[1], s[2], s[3]);
        return g;
      },
      (obj, s) => {
        obj.userData.turns = s[5];
      },
    );
    this.sync(
      this.things.crates,
      snap.crates,
      () => crate(),
      (obj, k) => {
        obj.position.set(k[1], k[2], k[3]);
        const chute = obj.getObjectByName('chute');
        if (chute) chute.visible = !k[4];
      },
    );
    this.sync(
      this.things.proj,
      snap.proj,
      (p) => {
        const g = projectileMesh(p[1]);
        g.position.set(p[2], p[3], p[4]);
        this.projTargets.set(p[0], g.position.clone());
        return g;
      },
      (obj, p) => {
        const t = this.projTargets.get(p[0]);
        if (t) {
          // in Flugrichtung drehen
          const dir = new THREE.Vector3(p[2], p[3], p[4]).sub(t);
          if (dir.lengthSq() > 0.0001) obj.userData.dir = dir.normalize();
          t.set(p[2], p[3], p[4]);
        }
      },
    );
    for (const id of [...this.projTargets.keys()]) if (!this.things.proj.has(id)) this.projTargets.delete(id);
  }

  /** Gleicht eine Liste von Dingen mit ihren 3D-Objekten ab (nach id an Stelle 0). */
  private sync<T extends readonly [number, ...unknown[]]>(
    map: Map<number, THREE.Object3D>,
    list: readonly T[],
    create: (item: T) => THREE.Object3D,
    update?: (obj: THREE.Object3D, item: T) => void,
  ): void {
    const seen = new Set<number>();
    for (const item of list) {
      seen.add(item[0]);
      let obj = map.get(item[0]);
      if (!obj) {
        obj = create(item);
        map.set(item[0], obj);
        this.world.add(obj);
      }
      update?.(obj, item);
    }
    for (const [id, obj] of map) {
      if (!seen.has(id)) {
        this.world.remove(obj);
        map.delete(id);
      }
    }
  }

  /** Neue Krater ins eigene Gelände drücken und das Netz anpassen. */
  private applyCraters(craters: Snapshot['craters']): void {
    const t = this.terrain;
    if (!t || !this.terrainGeo || craters.length <= this.craterCount) return;
    for (let i = this.craterCount; i < craters.length; i++) {
      const [x, y, z, r] = craters[i]!;
      carveCrater(t, x, y, z, r);
      // Bäume und Steine im Krater verschwinden.
      for (const d of [...this.decor]) {
        if (Math.hypot(d.x - x, d.z - z) < r + 0.6) {
          this.world.remove(d.obj);
          this.decor.splice(this.decor.indexOf(d), 1);
        } else d.obj.position.y = heightAt(t, d.x, d.z);
      }
    }
    this.craterCount = craters.length;
    paintTerrain(this.terrainGeo, t);
  }

  // ───────────────────────── Effekte ─────────────────────────

  /** Bild zu einem Ereignis (Explosion, Platschen …). Ton macht audio.ts. */
  playFx([, kind, x, y, z, v]: Fx): void {
    const at = new THREE.Vector3(x, y, z);
    switch (kind) {
      case 'boom': {
        this.flash(at, '#ffd36b', v * 1.2, 0.35);
        this.burst(at, 18 + Math.round(v * 6), ['#e8c25a', '#c99a3a', '#f4e3a1'], 7 + v * 2, 0.18, 1.2);
        this.smoke(at, 6 + Math.round(v * 2), '#6b6156', 1.6);
        break;
      }
      case 'collapse':
        this.smoke(at, 18, '#a59d8f', 2.5);
        this.burst(at, 20, ['#8a7f72', '#9b6b3d'], 6, 0.25, 1.4);
        break;
      case 'home':
        this.smoke(at, 12, '#eeeeee', 1.8);
        this.text(at, '🏠 heim', 'home');
        break;
      case 'splash':
        this.burst(at, 24, ['#a8dcff', '#e9f7ff', '#5fb0e0'], 6, 0.15, 1);
        break;
      case 'heal':
        this.burst(at, 10, ['#7cff8a', '#d7ffb0'], 2, 0.15, 1.2, -2);
        this.text(at, `+${v}`, 'heal');
        break;
      case 'dmg':
        this.text(at, `−${v}`, 'dmg');
        break;
      case 'crate':
        this.burst(at, 16, ['#ffe066', '#ffffff'], 4, 0.12, 0.9, -1);
        break;
      case 'promo':
        this.flash(at, '#ffe066', 3, 0.8);
        this.burst(at, 30, ['#ffe066', '#fff3b0', '#9fe7ff'], 5, 0.14, 1.5, -3);
        this.text(at, '★ Befördert!', 'promo');
        break;
      case 'shot':
      case 'puff':
        this.smoke(at, kind === 'shot' ? 4 : 5, '#d8d2c4', 0.6);
        break;
      case 'bell':
        this.flash(at, '#ffe066', v, 0.6);
        this.text(at, '🔔', 'promo');
        break;
      case 'stun':
        this.burst(at, 8, ['#ffe066'], 2, 0.12, 1, -2);
        this.text(at, '💫 betäubt', 'dmg');
        break;
      case 'build':
        this.smoke(at, 10, '#b59a6a', 1.2);
        break;
      case 'jump':
        this.smoke(at, 4, '#c8b88a', 0.6);
        break;
      case 'melee':
        this.burst(at, 10, ['#ffffff', '#ffe9a8'], 4, 0.12, 0.5);
        break;
      case 'cloak':
        this.smoke(at.setY(y + 1), 14, '#8e7cc3', 1.4);
        break;
      case 'revive':
        this.burst(at, 30, ['#ffe066', '#ffffff'], 3, 0.14, 1.6, -4);
        this.text(at.setY(y + 2.5), '🔔 zurück!', 'heal');
        break;
      case 'flood':
        this.text(at.setY(y + 4), `🌊 Wasser ${v} m`, 'home');
        break;
      case 'click':
        break;
    }
  }

  private flash(at: THREE.Vector3, color: string, radius: number, life: number): void {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    m.position.copy(at);
    m.scale.setScalar(radius * 0.3);
    this.addParticle(m, new THREE.Vector3(), life, radius * 2.2, 0, true);
  }

  private burst(at: THREE.Vector3, n: number, colors: string[], speed: number, size: number, life: number, gravity = 9.81): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
      m.position.copy(at);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.6));
      this.addParticle(m, v, life * (0.7 + Math.random() * 0.5), 0, gravity, true);
    }
  }

  private smoke(at: THREE.Vector3, n: number, color: string, life: number): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.5, 0),
        new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.8, flatShading: true, depthWrite: false }),
      );
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 0.8, (Math.random() - 0.5) * 1.5));
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2);
      this.addParticle(m, v, life * (0.7 + Math.random() * 0.6), 1.2, 0, true);
    }
  }

  private addParticle(obj: THREE.Object3D, vel: THREE.Vector3, life: number, grow: number, gravity: number, fade: boolean): void {
    if (this.particles.length > 400) return;
    this.scene.add(obj);
    this.particles.push({ obj, vel, life, max: life, grow, gravity, fade });
  }

  private text(at: THREE.Vector3, text: string, cls: string): void {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    this.labels.append(el);
    this.floats.push({ el, pos: at.clone(), life: 1.6 });
  }

  // ───────────────────────── Zielhilfe ─────────────────────────

  /** Gestrichelte Linie (erste Flugstrecke), null = aus. */
  setAimPath(points: [number, number, number][] | null): void {
    if (!points || points.length < 2) {
      this.aimLine.visible = false;
      return;
    }
    this.aimLine.geometry.dispose();
    this.aimLine.geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    this.aimLine.computeLineDistances();
    this.aimLine.visible = true;
  }

  /** Ring auf dem Boden (Luftschlag-Ziel, Heil-Umkreis), null = aus. */
  setAimRing(ring: [x: number, z: number, radius: number] | null): void {
    if (!ring || !this.terrain) {
      this.aimRing.visible = false;
      return;
    }
    const [x, z, r] = ring;
    this.aimRing.position.set(x, heightAt(this.terrain, x, z) + 0.15, z);
    this.aimRing.scale.setScalar(r);
    this.aimRing.visible = true;
  }

  /** Halbdurchsichtige Markierung, wo etwas abgelegt wird. */
  setGhost(at: [number, number] | null): void {
    if (!at || !this.terrain) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.position.set(at[0], heightAt(this.terrain, at[0], at[1]) + 0.1, at[1]);
    this.ghost.visible = true;
  }

  /** Gelände der aktuellen Runde (mit Kratern), für die Zielhilfe. */
  get currentTerrain(): Terrain | null {
    return this.terrain;
  }

  // ───────────────────────── Kamera ─────────────────────────

  /** Die Ansicht in einen anderen Platz der Seite hängen (Startseite ↔ Spiel). */
  moveTo(el: HTMLElement): void {
    if (el === this.host) return;
    this.observer.unobserve(this.host);
    this.host = el;
    el.append(this.renderer.domElement, this.labels);
    this.observer.observe(el);
    this.resize();
  }

  /** Kamera-Vorwärtsrichtung auf dem Boden (x, z), für Laufen und Zielen relativ zur Kamera. */
  groundForward(): [number, number] {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    const len = Math.hypot(d.x, d.z) || 1;
    return [d.x / len, d.z / len];
  }

  /** Blickrichtung der Kamera als Winkel in Grad (wie die Blickrichtung der Kühe). */
  cameraYaw(): number {
    const [x, z] = this.groundForward();
    return (((Math.atan2(-z, x) * 180) / Math.PI) % 360 + 360) % 360;
  }

  /** Kamera um das Ziel drehen (Tasten Q/E). */
  orbit(deg: number): void {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
    this.camera.position.copy(this.controls.target).add(off);
  }

  /** Kamera hinter eine Kuh stellen, Blick in ihre Richtung. */
  behind(cowId: string): void {
    const v = this.cowViews.get(cowId);
    if (!v) return;
    this.overview = false;
    const h = (v.heading * Math.PI) / 180;
    const p = v.target;
    this.controls.target.set(p.x, p.y + 1.5, p.z);
    this.camera.position.set(p.x - Math.cos(h) * 15, p.y + 9, p.z + Math.sin(h) * 15);
  }

  /** Übersicht über die ganze Karte (Taste M). */
  toggleOverview(): void {
    if (!this.terrain) return;
    this.overview = !this.overview;
    const span = spanOf(this.terrain);
    if (this.overview) {
      this.controls.target.set(span / 2, 0, span / 2);
      this.camera.position.set(span / 2, span * 1.15, span / 2 + span * 0.35);
    } else if (this.follow) this.behind(this.follow);
  }

  /** Welche Kuh liegt unter dem Mauszeiger? */
  pickCow(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    let best: string | null = null;
    let bestD = Infinity;
    for (const [id, v] of this.cowViews) {
      const hits = ray.intersectObject(v.obj, true);
      if (hits[0] && hits[0].distance < bestD) {
        best = id;
        bestD = hits[0].distance;
      }
    }
    return best;
  }

  /** Grafikqualität pro Gerät: Schatten und Auflösung. */
  setQuality(q: 'niedrig' | 'mittel' | 'hoch'): void {
    this.renderer.shadowMap.enabled = q !== 'niedrig';
    this.renderer.setPixelRatio(q === 'hoch' ? Math.min(2, window.devicePixelRatio) : 1);
    this.resize();
  }

  private animate(dt: number): void {
    // Glättung wie in der Vorlage: pro Bild 35 % zur echten Position, große Sprünge direkt.
    for (const v of this.cowViews.values()) {
      const p = v.obj.position;
      if (p.distanceTo(v.target) > 8) p.copy(v.target);
      else p.lerp(v.target, 0.35);
      const want = (v.heading * Math.PI) / 180;
      let d = want - v.obj.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.obj.rotation.y += d * 0.3;
    }
    for (const [id, obj] of this.things.proj) {
      const t = this.projTargets.get(id);
      if (!t) continue;
      if (obj.position.distanceTo(t) > 25) obj.position.copy(t);
      else obj.position.lerp(t, 0.45);
      obj.rotation.x += dt * 6;
      obj.rotation.z += dt * 4;
    }
    const now = performance.now();
    for (const obj of this.things.mines.values()) {
      const light = obj.getObjectByName('light');
      if (light) light.visible = !!obj.userData.armed && Math.floor(now / 400) % 2 === 0;
    }
    for (const obj of this.things.crates.values()) {
      const chute = obj.getObjectByName('chute');
      if (chute?.visible) obj.rotation.y += dt * 0.6;
    }
    if (this.waterMesh) this.waterMesh.position.y += (this.waterTarget - 0.05 - this.waterMesh.position.y) * Math.min(1, dt * 1.5);

    // Partikel
    for (const p of [...this.particles]) {
      p.life -= dt;
      if (p.life <= 0) {
        p.obj.removeFromParent();
        if (p.obj instanceof THREE.Mesh) {
          p.obj.geometry.dispose();
          (p.obj.material as THREE.Material).dispose();
        }
        this.particles.splice(this.particles.indexOf(p), 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.grow) p.obj.scale.multiplyScalar(1 + p.grow * dt);
      if (p.fade && p.obj instanceof THREE.Mesh) (p.obj.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.max);
    }

    // Kamera: folgt dem Geschoss, sonst der aktiven Kuh. Blickwinkel bleibt beim Spieler.
    const proj = this.followProj !== null ? this.things.proj.get(this.followProj) : undefined;
    const active = this.follow ? this.cowViews.get(this.follow) : undefined;
    this.marker.visible = !!active;
    if (active) {
      const p = active.obj.position;
      this.marker.position.set(p.x, p.y + 3.9 + Math.sin(now / 250) * 0.15, p.z);
    }
    if (!this.overview) {
      const focus = proj?.position ?? (active ? active.obj.position.clone().setY(active.obj.position.y + 1.5) : null);
      if (focus) {
        const shift = focus.clone().sub(this.controls.target).multiplyScalar(proj ? 0.12 : 0.08);
        this.controls.target.add(shift);
        this.camera.position.add(shift);
      }
    }
  }

  /** Namensschilder und schwebende Zahlen an die 3D-Positionen setzen. */
  private placeLabels(dt: number): void {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    const place = (el: HTMLElement, pos: THREE.Vector3) => {
      v.copy(pos).project(this.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = visible ? '' : 'none';
      if (visible) el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    };
    for (const c of this.cowViews.values()) {
      const p = c.obj.position;
      place(c.label, new THREE.Vector3(p.x, p.y + 2.5, p.z));
    }
    for (const f of [...this.floats]) {
      f.life -= dt;
      if (f.life <= 0) {
        f.el.remove();
        this.floats.splice(this.floats.indexOf(f), 1);
        continue;
      }
      f.pos.y += dt * 1.2;
      place(f.el, f.pos);
      f.el.style.opacity = String(Math.min(1, f.life));
    }
  }

  private clearLabels(): void {
    for (const v of this.cowViews.values()) v.label.remove();
    for (const f of this.floats) f.el.remove();
    this.floats = [];
  }

  private resize(): void {
    const w = this.host.clientWidth;
    if (w === 0) return; // versteckt
    const h = Math.round(w * (window.innerWidth < 700 ? 0.9 : 0.56));
    this.renderer.setSize(w, h);
    this.labels.style.width = `${w}px`;
    this.labels.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    this.animate(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.placeLabels(dt);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}

// ───────────────────────── Modelle aus Grundformen ─────────────────────────

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: string) => {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
    matCache.set(color, m);
  }
  return m;
};

function terrainMesh(t: Terrain): THREE.Mesh<THREE.BufferGeometry> {
  const span = spanOf(t);
  const geo = new THREE.PlaneGeometry(span, span, t.size - 1, t.size - 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(span / 2, 0, span / 2);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position!.count * 3), 3));
  paintTerrain(geo, t);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Höhen und Farben des Geländenetzes aus der Höhenkarte setzen (auch nach Kratern). */
function paintTerrain(geo: THREE.BufferGeometry, t: Terrain): void {
  const pos = geo.attributes.position!;
  const col = geo.attributes.color!;
  const th = THEMES[t.theme].colors;
  const low = new THREE.Color(th.low);
  const mid = new THREE.Color(th.mid);
  const high = new THREE.Color(th.high);
  const shore = new THREE.Color(th.shore);
  const steep = new THREE.Color(th.steep);
  const dirt = new THREE.Color('#7a5b3a');
  const c = new THREE.Color();
  const at = (ix: number, iz: number) =>
    t.heights[Math.min(t.size - 1, Math.max(0, iz)) * t.size + Math.min(t.size - 1, Math.max(0, ix))]!;
  for (let i = 0; i < pos.count; i++) {
    const ix = Math.round(pos.getX(i) / t.cell);
    const iz = Math.round(pos.getZ(i) / t.cell);
    const h = at(ix, iz);
    pos.setY(i, h);
    const slope = Math.max(Math.abs(at(ix + 1, iz) - h), Math.abs(at(ix, iz + 1) - h), Math.abs(at(ix - 1, iz) - h)) / t.cell;
    if (h < 0.5) c.copy(shore);
    else if (slope > 1.4) c.copy(dirt);
    else if (slope > 0.9) c.copy(steep);
    else if (h < 4) c.copy(low).lerp(mid, Math.max(0, (h - 0.5) / 3.5));
    else c.copy(mid).lerp(high, Math.min(1, (h - 4) / 6));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  geo.computeVertexNormals();
}

function water(span: number, color: string): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(2000, 2000);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.3 }));
  m.position.set(span / 2, -0.05, span / 2);
  return m;
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

function setOpacity(o: THREE.Object3D, opacity: number): void {
  if (o.userData.opacity === opacity) return;
  o.userData.opacity = opacity;
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      const base = c.userData.baseMat ?? c.material;
      c.userData.baseMat = base;
      if (opacity >= 1) c.material = base;
      else {
        const m = (base as THREE.Material).clone();
        m.transparent = true;
        m.opacity = opacity;
        c.material = m;
      }
    }
  });
}

function decorFor(theme: Theme, roll: number, rng: () => number): THREE.Object3D {
  switch (theme) {
    case 'kornfeld':
      return roll < 0.6 ? haystack(rng) : roll < 0.8 ? tree(rng, '#5c8f3a') : rock(rng);
    case 'steinbruch':
      return roll < 0.7 ? rock(rng) : tree(rng, '#4f7f3f');
    case 'winterweide':
      return roll < 0.7 ? tree(rng, '#2f5f4a', true) : rock(rng);
    case 'moor':
      return roll < 0.45 ? reeds(rng) : roll < 0.8 ? tree(rng, '#4f6b33') : rock(rng);
    default:
      return roll < 0.7 ? tree(rng, rng() < 0.5 ? '#3f7d3a' : '#4f8f3f') : rock(rng);
  }
}

function tree(rng: () => number, color: string, snow = false): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), mat('#6b4a2f'));
  trunk.position.y = 0.8;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.2, 7), mat(color));
  crown.position.y = 3;
  g.add(trunk, crown);
  if (snow) {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 7), mat('#ffffff'));
    cap.position.y = 4.1;
    g.add(cap);
  }
  g.scale.setScalar(0.8 + rng() * 0.6);
  return shadowed(g);
}

function rock(rng: () => number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rng() * 0.8, 0), mat('#9a9184'));
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.scale.y = 0.6;
  return shadowed(m);
}

function haystack(rng: () => number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(1.1 + rng() * 0.4, 1.8, 8), mat('#e3c25e'));
  m.position.y = 0.9;
  const g = new THREE.Group();
  g.add(m);
  return shadowed(g) as unknown as THREE.Mesh;
}

function reeds(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.2 + rng(), 4), mat('#7a8a44'));
    r.position.set((rng() - 0.5) * 0.8, 0.6, (rng() - 0.5) * 0.8);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 5), mat('#5b3b22'));
    top.position.set(r.position.x, 1.3 + rng() * 0.4, r.position.z);
    g.add(r, top);
  }
  return g;
}

function bunker(material: 'holz' | 'stein'): THREE.Group {
  const g = new THREE.Group();
  const wall = mat(material === 'holz' ? '#9b6b3d' : '#a9a49a');
  const roof = mat(material === 'holz' ? '#6e4527' : '#7c776f');
  const lx = BUNKER_HALF_X * 2;
  const lz = BUNKER_HALF_Z * 2;
  const wallH = BUNKER_HEIGHT - 0.4;
  // Vier Wände statt eines Blocks, damit man die Kuh drinnen sieht.
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, lz), wall);
  back.position.set(-lx / 2 + 0.12, wallH / 2, 0);
  const sideA = new THREE.Mesh(new THREE.BoxGeometry(lx, wallH, 0.25), wall);
  sideA.position.set(0, wallH / 2, lz / 2 - 0.12);
  const sideB = sideA.clone();
  sideB.position.z = -lz / 2 + 0.12;
  // Vorderwand mit Schießscharte (Lücke zwischen 1.1 und 1.8 m)
  const frontLow = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, lz), wall);
  frontLow.position.set(lx / 2 - 0.12, 0.55, 0);
  const frontHigh = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH - 1.8, lz), wall);
  frontHigh.position.set(lx / 2 - 0.12, 1.8 + (wallH - 1.8) / 2, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(lx + 0.4, 0.4, lz + 0.4), roof);
  top.position.y = wallH + 0.2;
  // Eingang hinten: dunkle Tür andeuten
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 1), mat('#2b2018'));
  door.position.set(-lx / 2 - 0.01, 0.7, 0);
  g.add(back, sideA, sideB, frontLow, frontHigh, top, door);
  return shadowed(g);
}

function fence(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('#8b6239');
  for (const x of [-FENCE_HALF, 0, FENCE_HALF]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, FENCE_HEIGHT, 0.16), wood);
    post.position.set(x, FENCE_HEIGHT / 2, 0);
    g.add(post);
  }
  for (const y of [0.45, 0.95, 1.45]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(FENCE_HALF * 2 + 0.2, 0.18, 0.06), mat('#a87b4f'));
    board.position.set(0, y, 0);
    g.add(board);
  }
  return shadowed(g);
}

function mine(): THREE.Group {
  const g = new THREE.Group();
  const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.18, 9), mat('#5a3f22'));
  pie.position.y = 0.09;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 0.14, 9), mat('#6b4a2a'));
  top.position.y = 0.24;
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff3b2f' }));
  light.position.y = 0.34;
  light.name = 'light';
  g.add(pie, top, light);
  return g;
}

function satchel(): THREE.Group {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mat('#b89a6a'));
  bag.scale.set(1, 0.8, 1);
  bag.position.y = 0.36;
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.25, 6), mat('#8b6239'));
  tie.position.y = 0.78;
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), mat('#2b2018'));
  fuse.position.set(0.1, 1, 0);
  fuse.rotation.z = -0.4;
  g.add(bag, tie, fuse);
  return shadowed(g);
}

function crate(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat('#c48a45'));
  box.position.y = 0.45;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.15, 0.94), mat('#7a4f22'));
  band.position.y = 0.45;
  const chute = new THREE.Group();
  chute.name = 'chute';
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1, 10, 1, true), mat('#efd77a'));
  canopy.position.y = 3.2;
  chute.add(canopy);
  for (const [x, z] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 3), mat('#5b4a2f'));
    rope.position.set(x * 0.6, 1.9, z * 0.6);
    rope.rotation.set(z * 0.25, 0, -x * 0.25);
    chute.add(rope);
  }
  g.add(box, band, chute);
  return shadowed(g);
}

function projectileMesh(id: WeaponId): THREE.Object3D {
  const g = new THREE.Group();
  switch (id) {
    case 'heuschleuder':
    case 'heuhagel': {
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 10), mat('#e3c25e'));
      bale.rotation.z = Math.PI / 2;
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.08, 10), mat('#a8742f'));
      strap.rotation.z = Math.PI / 2;
      g.add(bale, strap);
      break;
    }
    case 'kuerbismoerser': {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mat('#e8771e'));
      p.scale.y = 0.8;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 5), mat('#4f7f2f'));
      stem.position.y = 0.5;
      g.add(p, stem);
      break;
    }
    case 'milchkanne': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 10), mat('#d7dde3'));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.2, 10), mat('#b7bec6'));
      neck.position.y = 0.4;
      g.add(body, neck);
      break;
    }
    case 'mistgabel': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), mat('#8b6239'));
      shaft.rotation.z = Math.PI / 2;
      g.add(shaft);
      for (const z of [-0.12, 0, 0.12]) {
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.4, 4), mat('#c0c0c0'));
        prong.rotation.z = -Math.PI / 2;
        prong.position.set(0.95, 0, z);
        g.add(prong);
      }
      break;
    }
    case 'fernglas': {
      const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), new THREE.MeshBasicMaterial({ color: '#fff3a0' }));
      tracer.rotation.z = Math.PI / 2;
      g.add(tracer);
      break;
    }
    case 'melkschemel': {
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8), mat('#8b6239'));
      seat.position.y = 0.3;
      g.add(seat);
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), mat('#6b4a2f'));
        const a = (i / 3) * Math.PI * 2;
        leg.position.set(Math.cos(a) * 0.18, 0.1, Math.sin(a) * 0.18);
        g.add(leg);
      }
      break;
    }
    case 'glockenkoeder': {
      const bell = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 8), mat('#e8c547'));
      g.add(bell);
      break;
    }
    default:
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat('#cccccc')));
  }
  return shadowed(g);
}

/** Farbe der Rangglocke: Bronze, Silber, Gold, Kristall (Index = Rang). */
const RANK_BELL = ['#b87333', '#b87333', '#c0c0c0', '#e8c547', '#9fe7ff'];

/** Kantige Low-Poly-Kuh mit Halstuch in Hoffarbe und Rangglocke. Schaut nach +x. */
function cow(teamColor: string, rank: number): THREE.Group {
  const g = new THREE.Group();
  const white = mat('#f6f1e6');
  const dark = mat('#3a2e28');
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 0.95), white);
  body.position.y = 1.15;
  for (const [x, z] of [
    [-0.6, -0.3],
    [-0.6, 0.3],
    [0.6, -0.3],
    [0.6, 0.3],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), dark);
    leg.position.set(x, 0.38, z);
    g.add(leg);
  }
  const spot1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.02), dark);
  spot1.position.set(-0.2, 1.25, 0.48);
  const spot2 = spot1.clone();
  spot2.position.set(0.35, 1.05, -0.48);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), white);
  head.position.set(1.15, 1.55, 0);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.32, 0.5), mat('#efb3a0'));
  snout.position.set(1.5, 1.42, 0);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 5), mat('#efe3c2'));
  horn.position.set(1.05, 1.95, 0.22);
  horn.rotation.x = 0.4;
  const horn2 = horn.clone();
  horn2.position.z = -0.22;
  horn2.rotation.x = -0.4;
  const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.72), mat(teamColor));
  scarf.position.set(0.85, 1.35, 0);
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.13 + rank * 0.02, 0.22 + rank * 0.03, 6), mat(RANK_BELL[rank] ?? RANK_BELL[1]!));
  bell.position.set(0.95, 0.92, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark);
  tail.position.set(-0.93, 1.05, 0);
  tail.rotation.z = 0.25;
  g.add(body, spot1, spot2, head, snout, horn, horn2, scarf, bell, tail);
  return shadowed(g);
}
