import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRng } from '../game/rng';
import { WATER_LEVEL, heightAt, type Terrain } from '../game/terrain';
import type { Snapshot } from '../game/types';

/**
 * 3D-Darstellung mit Three.js im eigenen Low-Poly-Stil.
 * Alles wird aus Grundformen erzeugt, es gibt keine Bild- oder Modelldateien.
 */
export class BattlefieldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private world = new THREE.Group();
  private raf = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#9fd3ef');
    this.scene.fog = new THREE.Fog('#9fd3ef', 70, 260);
    this.scene.add(this.world);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 160;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.6;

    const hemi = new THREE.HemisphereLight('#e8f6ff', '#4d6b3a', 1.6);
    const sun = new THREE.DirectionalLight('#fff4dc', 2.4);
    sun.position.set(108, 90, 78);
    sun.target.position.set(48, 0, 48);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 300 });
    this.scene.add(hemi, sun, sun.target);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.loop();
  }

  /** Baut die ganze Szene aus Gelände und Schnappschuss neu auf. */
  show(t: Terrain, snap: Snapshot): void {
    this.world.clear();
    const span = (t.size - 1) * t.cell;
    const center = new THREE.Vector3(span / 2, 0, span / 2);

    this.world.add(terrainMesh(t), water(span));
    const rng = createRng(snap.mapSeed ^ 0x5eed);
    for (let i = 0; i < 70; i++) {
      const x = span * (0.08 + rng() * 0.84);
      const z = span * (0.08 + rng() * 0.84);
      const y = heightAt(t, x, z);
      if (y < WATER_LEVEL + 0.6) continue;
      if (snap.cows.some((c) => Math.hypot(c[2] - x, c[4] - z) < 4)) continue;
      if (snap.bunkers.some((b) => Math.hypot(b[0] - x, b[1] - z) < 5)) continue;
      const obj = rng() < 0.7 ? tree(rng) : rock(rng);
      obj.position.set(x, y, z);
      this.world.add(obj);
    }
    for (const [x, z, facing, material] of snap.bunkers) {
      const b = bunker(material);
      b.position.set(x, heightAt(t, x, z) - 0.3, z);
      b.rotation.y = (facing * Math.PI) / 180;
      this.world.add(b);
    }
    const colors = new Map(snap.teams.map((tm) => [tm.index, tm.color]));
    for (const [, team, x, y, z, heading, , , , rank] of snap.cows) {
      const c = cow(colors.get(team) ?? '#ffffff', rank);
      c.position.set(x, y, z);
      c.rotation.y = (heading * Math.PI) / 180;
      this.world.add(c);
    }

    this.controls.target.copy(center).setY(2);
    // Schmale Bildschirme (Handy hochkant) brauchen mehr Abstand, damit die Insel ganz zu sehen ist.
    const d = window.innerWidth < 700 ? 1.6 : 1;
    this.camera.position.set(center.x + span * 0.35 * d, span * 0.38 * d, center.z + span * 0.5 * d);
    this.controls.update();
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = Math.round(w * (window.innerWidth < 700 ? 0.9 : 0.56));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}

const mat = (color: string) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });

function terrainMesh(t: Terrain): THREE.Mesh {
  const span = (t.size - 1) * t.cell;
  const geo = new THREE.PlaneGeometry(span, span, t.size - 1, t.size - 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(span / 2, 0, span / 2);
  const pos = geo.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#6fae45');
  const meadow = new THREE.Color('#9cc95a');
  const sand = new THREE.Color('#d9c38a');
  const rockC = new THREE.Color('#8a7f72');
  const c = new THREE.Color();
  const at = (ix: number, iz: number) =>
    t.heights[Math.min(t.size - 1, Math.max(0, iz)) * t.size + Math.min(t.size - 1, Math.max(0, ix))]!;
  for (let i = 0; i < pos.count; i++) {
    const ix = Math.round(pos.getX(i) / t.cell);
    const iz = Math.round(pos.getZ(i) / t.cell);
    const h = at(ix, iz);
    pos.setY(i, h);
    const slope = Math.max(Math.abs(at(ix + 1, iz) - h), Math.abs(at(ix, iz + 1) - h)) / t.cell;
    if (h < WATER_LEVEL + 0.5) c.copy(sand);
    else if (slope > 0.9) c.copy(rockC);
    else c.copy(grass).lerp(meadow, Math.min(1, Math.max(0, (h - 1) / 6)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

function water(span: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(2000, 2000);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: '#3d8fc4', transparent: true, opacity: 0.85, roughness: 0.3 }),
  );
  m.position.set(span / 2, WATER_LEVEL - 0.05, span / 2);
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

function tree(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), mat('#6b4a2f'));
  trunk.position.y = 0.8;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.2, 7), mat(rng() < 0.5 ? '#3f7d3a' : '#4f8f3f'));
  crown.position.y = 3;
  g.add(trunk, crown);
  g.scale.setScalar(0.8 + rng() * 0.6);
  return shadowed(g);
}

function rock(rng: () => number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rng() * 0.8, 0), mat('#9a9184'));
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.scale.y = 0.6;
  return shadowed(m);
}

function bunker(material: 'holz' | 'stein'): THREE.Group {
  const g = new THREE.Group();
  const wall = mat(material === 'holz' ? '#9b6b3d' : '#a9a49a');
  const roof = mat(material === 'holz' ? '#6e4527' : '#7c776f');
  const body = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 3.4), wall);
  body.position.y = 1;
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 3.8), roof);
  top.position.y = 2.2;
  // Schießscharte zeigt nach +x (Ausrichtung über rotation.y)
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 2.2), mat('#1d1d1d'));
  slit.position.set(2.01, 1.45, 0);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 1), mat('#2b2018'));
  door.position.set(-2.01, 0.7, 0);
  g.add(body, top, slit, door);
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
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 6), mat(RANK_BELL[rank] ?? RANK_BELL[1]!));
  bell.position.set(0.95, 0.92, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark);
  tail.position.set(-0.93, 1.05, 0);
  tail.rotation.z = 0.25;
  g.add(body, spot1, spot2, head, snout, horn, horn2, scarf, bell, tail);
  g.scale.setScalar(1.2);
  return shadowed(g);
}
