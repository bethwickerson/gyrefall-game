import {
  AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, CircleGeometry, Color,
  CylinderGeometry, DirectionalLight, DoubleSide, FogExp2, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, Points, PointsMaterial, Scene, TorusGeometry, WebGLRenderer,
  type Object3D,
} from "three";
import { lerp, lerpAngle, makeRng } from "../core/math";
import type { Arena } from "../world/arena";
import type { Flyer } from "../world/flyer";
import type { World } from "../world/world";
import type { AssetManager } from "./assets";
import { ChaseCamera } from "./camera";

const PALETTE = {
  sky: 0x9aa3a8,
  stone: 0x2b2f36,
  stoneLight: 0x3b4048,
  bone: 0xd8d2c0,
  moss: 0x4d5c3c,
  bark: 0x5b4636,
  coral: 0xff6b5a,
  glow: 0x7ef0c8,
  storm: 0x241f33,
  fog: 0x8fa39a,
};

interface FlyerView {
  root: Group;
  wingL: Object3D | null;
  wingR: Object3D | null;
}

const MAX_SHARDS = 48;

/** Everything Three.js. Reads the world each frame and never writes to it. */
export class View {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(62, 1, 0.5, 2400);
  readonly chase: ChaseCamera;
  private flyerViews = new Map<Flyer, FlyerView>();
  private flyerLayer = new Group();
  private shardMeshes: Object3D[] = [];
  private updraftRings: Mesh[] = [];
  private updraftMotes: Points[] = [];
  private ceilingMesh!: Mesh;
  private fogMesh!: Mesh;
  private time = 0;
  private assets!: AssetManager;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(PALETTE.sky);
    this.scene.fog = new FogExp2(PALETTE.sky, 0.0016);
    this.chase = new ChaseCamera(this.camera);
    this.scene.add(this.flyerLayer);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    new ResizeObserver(() => this.resize()).observe(document.documentElement);
  }

  /** Fill the window at any size or aspect, with no letterboxing. */
  resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loadArena(arena: Arena, assets: AssetManager): void {
    this.assets = assets;
    const s = this.scene;
    s.add(new HemisphereLight(0xcfd8dc, 0x1c1f24, 1.15));
    s.add(new AmbientLight(0xffffff, 0.25));
    const sun = new DirectionalLight(0xfff1dc, 1.6);
    sun.position.set(0.4, 1, 0.25);
    s.add(sun);

    s.add(buildWall(arena));

    const floor = new Mesh(new CircleGeometry(arena.halfZ * 1.3, 48), new MeshStandardMaterial({ color: 0x1b1e22, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);

    const bone = new MeshStandardMaterial({ color: PALETTE.bone, roughness: 0.85, flatShading: true });
    const moss = new MeshStandardMaterial({ color: PALETTE.moss, roughness: 1, flatShading: true });
    for (const arch of arena.arches) {
      const mesh = new Mesh(new TorusGeometry(arch.radius, arch.tube, 7, 40, Math.PI), bone);
      mesh.position.copy(arch.center);
      s.add(mesh);
    }
    for (const b of arena.boxes) {
      const mesh = new Mesh(new BoxGeometry(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z), b.kind === "ledge" ? moss : bone);
      mesh.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      s.add(mesh);
    }

    // Updraft columns: glowing growth marks free altitude.
    const rng = makeRng(7);
    for (const u of arena.updrafts) {
      const h = u.y1 - u.y0;
      const column = new Mesh(
        new CylinderGeometry(u.radius, u.radius, h, 24, 1, true),
        new MeshBasicMaterial({ color: PALETTE.glow, transparent: true, opacity: 0.07, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }),
      );
      column.position.set(u.x, u.y0 + h / 2, u.z);
      s.add(column);
      const ringMat = new MeshBasicMaterial({ color: PALETTE.glow, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending });
      for (let i = 0; i < 9; i++) {
        const ring = new Mesh(new TorusGeometry(u.radius, 0.35, 5, 32), ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(u.x, 0, u.z);
        ring.userData = { y0: u.y0, h, phase: i / 9 };
        this.updraftRings.push(ring);
        s.add(ring);
      }
      const count = 140;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * u.radius;
        positions[i * 3] = u.x + Math.cos(a) * r;
        positions[i * 3 + 1] = u.y0 + rng() * h;
        positions[i * 3 + 2] = u.z + Math.sin(a) * r;
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(positions, 3));
      const motes = new Points(geo, new PointsMaterial({ color: PALETTE.glow, size: 1.4, transparent: true, opacity: 0.8, depthWrite: false }));
      motes.userData = { y0: u.y0, y1: u.y1 };
      motes.frustumCulled = false;
      this.updraftMotes.push(motes);
      s.add(motes);
      const base = new Mesh(new TorusGeometry(u.radius, 1.6, 6, 28), new MeshStandardMaterial({ color: PALETTE.glow, emissive: PALETTE.glow, emissiveIntensity: 0.9 }));
      base.rotation.x = Math.PI / 2;
      base.position.set(u.x, 1, u.z);
      s.add(base);
    }

    // The squeeze: storm ceiling above, fog floor below.
    const disc = new CircleGeometry(arena.halfZ * 1.3, 48);
    this.ceilingMesh = new Mesh(disc, new MeshBasicMaterial({ color: PALETTE.storm, transparent: true, opacity: 0.86, side: DoubleSide, depthWrite: false, fog: false }));
    this.ceilingMesh.rotation.x = Math.PI / 2;
    this.ceilingMesh.renderOrder = 2;
    s.add(this.ceilingMesh);
    this.fogMesh = new Mesh(disc, new MeshBasicMaterial({ color: PALETTE.fog, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false, fog: false }));
    this.fogMesh.rotation.x = -Math.PI / 2;
    this.fogMesh.renderOrder = 2;
    s.add(this.fogMesh);

    for (let i = 0; i < MAX_SHARDS; i++) {
      const m = assets.instantiate("pickup.shard");
      m.visible = false;
      this.shardMeshes.push(m);
      s.add(m);
    }
  }

  private buildFlyer(f: Flyer, index: number): FlyerView {
    const root = new Group();
    const mount = this.assets.instantiate(f.stats.mountModel);
    const rider = this.assets.instantiate(f.stats.riderModel);
    const armor = this.assets.instantiate(f.stats.armorModel);
    root.add(mount, rider, armor);
    // Armor tints its own plate only. The rider is never recoloured by armor.
    const plate = armor.getObjectByName("plate");
    if (plate instanceof Mesh) (plate.material as MeshStandardMaterial).color.set(f.stats.armorTint);
    const body = mount.getObjectByName("body");
    if (body instanceof Mesh) {
      const mat = body.material as MeshStandardMaterial;
      if (f.isPlayer) {
        mat.color.set(PALETTE.coral);
        mat.emissive.set(0x5a1d16);
      } else {
        mat.color.copy(new Color().setHSL(0.08 + (index % 5) * 0.05, 0.18, 0.5));
      }
    }
    return { root, wingL: mount.getObjectByName("wingL") ?? null, wingR: mount.getObjectByName("wingR") ?? null };
  }

  /** Rebuild flyer visuals for a new match. */
  syncFlyers(world: World): void {
    this.flyerLayer.clear();
    this.flyerViews.clear();
    world.flyers.forEach((f, i) => {
      const v = this.buildFlyer(f, i);
      this.flyerViews.set(f, v);
      this.flyerLayer.add(v.root);
    });
    this.chase.snap();
  }

  render(world: World, alpha: number, frameDt: number, simRunning: boolean): void {
    this.time += frameDt;
    const blend = simRunning ? alpha : 1;

    for (const [f, v] of this.flyerViews) {
      v.root.visible = f.alive;
      if (!f.alive) continue;
      v.root.position.lerpVectors(f.prevPos, f.pos, blend);
      v.root.rotation.set(lerp(f.prevPitch, f.pitch, blend), lerpAngle(f.prevYaw, f.yaw, blend), -lerp(f.prevRoll, f.roll, blend), "YXZ");
      // Wings fold in a dive and spread wide in a flare.
      const flaring = f.flareTimer < 0.55;
      const sweep = f.diving ? 1.05 : flaring ? -0.25 : 0;
      const span = f.diving ? 0.55 : flaring ? 1.15 : 1;
      for (const [wing, side] of [[v.wingL, -1], [v.wingR, 1]] as const) {
        if (!wing) continue;
        wing.rotation.y += (side * -sweep - wing.rotation.y) * Math.min(1, frameDt * 12);
        wing.scale.x += (span - wing.scale.x) * Math.min(1, frameDt * 12);
      }
    }

    const player = world.player;
    if (player && (world.phase === "launch" || world.phase === "match")) {
      const p = this.flyerViews.get(player)?.root.position ?? player.pos;
      this.chase.update(world.arena, p, lerpAngle(player.prevYaw, player.yaw, blend), lerp(player.prevPitch, player.pitch, blend), player.speed, player.diving, frameDt);
    } else {
      this.chase.orbit(world.arena, this.time);
    }

    this.ceilingMesh.position.y = world.zoneCeiling;
    this.fogMesh.position.y = world.zoneFloor;
    this.ceilingMesh.visible = world.zoneCeiling < world.arena.height + 30;

    for (const ring of this.updraftRings) {
      const d = ring.userData as { y0: number; h: number; phase: number };
      ring.position.y = d.y0 + ((this.time * 0.045 + d.phase) % 1) * d.h;
    }
    for (const motes of this.updraftMotes) {
      const d = motes.userData as { y0: number; y1: number };
      const attr = motes.geometry.getAttribute("position") as BufferAttribute;
      const arr = attr.array as Float32Array;
      const rise = 16 * frameDt;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] += rise;
        if (arr[i] > d.y1) arr[i] = d.y0;
      }
      attr.needsUpdate = true;
    }

    let n = 0;
    for (const shard of world.shards) {
      if (!shard.active || n >= MAX_SHARDS) continue;
      const m = this.shardMeshes[n++];
      m.visible = true;
      m.position.copy(shard.pos);
      m.rotation.y = this.time * 2 + n;
      m.rotation.x = this.time * 1.3;
    }
    for (; n < MAX_SHARDS; n++) this.shardMeshes[n].visible = false;

    this.renderer.render(this.scene, this.camera);
  }
}

/** The chasm wall, built from the same radius function the collision uses. */
const buildWall = (arena: Arena): Mesh => {
  const segT = 144;
  const segY = 44;
  const y0 = -10;
  const y1 = arena.height + 60;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const rng = makeRng(3);
  const dark = new Color(PALETTE.stone);
  const light = new Color(PALETTE.stoneLight);
  const mossy = new Color(PALETTE.moss);
  const col = new Color();
  for (let j = 0; j <= segY; j++) {
    const y = y0 + ((y1 - y0) * j) / segY;
    for (let i = 0; i <= segT; i++) {
      const theta = (i / segT) * Math.PI * 2;
      // Walls lean outward a little above the fliable volume so they never clip it.
      const r = arena.wallRadius(theta, y) + 1.5;
      positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
      // Alternating height bands give a sense of altitude and speed in a gray box.
      const band = Math.floor(y / 40) % 2 === 0 ? 0.0 : 0.55;
      col.copy(dark).lerp(light, band + rng() * 0.3);
      if (rng() < 0.08) col.lerp(mossy, 0.6);
      colors.push(col.r, col.g, col.b);
    }
  }
  const row = segT + 1;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segT; i++) {
      const a = j * row + i;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: DoubleSide }));
};
