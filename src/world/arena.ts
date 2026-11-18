import { Vector3 } from "three";

/**
 * Arena data only: bounds, colliders, updrafts and spawns. Rendering reads the
 * same numbers, so what you see is what you collide with.
 */
export interface Updraft {
  x: number;
  z: number;
  radius: number;
  y0: number;
  y1: number;
}
export interface BoxCollider {
  kind: "ledge" | "perch";
  min: Vector3;
  max: Vector3;
}
export interface ArchDef {
  center: Vector3;
  radius: number;
  tube: number;
}
export interface SphereCollider {
  c: Vector3;
  r: number;
}
export interface Spawn {
  pos: Vector3;
  yaw: number;
}

export interface Arena {
  id: string;
  height: number;
  halfX: number;
  halfZ: number;
  /** Distance from the centre axis to the wall for a bearing and a height. */
  wallRadius(theta: number, y: number): number;
  updrafts: Updraft[];
  boxes: BoxCollider[];
  arches: ArchDef[];
  spheres: SphereCollider[];
  spawns: Spawn[];
}

export interface Contact {
  normal: Vector3;
  depth: number;
}

const tmp = new Vector3();

/** Signed distance to the chasm wall. Negative is inside the playable space. */
export const wallDistance = (arena: Arena, x: number, y: number, z: number): number => {
  const d = Math.hypot(x, z);
  return d - arena.wallRadius(Math.atan2(z, x), y);
};

/** Wall contact for a sphere, or null. The normal points back into the chasm. */
export const wallContact = (arena: Arena, p: Vector3, radius: number, out: Contact): Contact | null => {
  const f = wallDistance(arena, p.x, p.y, p.z);
  if (f < -radius) return null;
  const e = 0.5;
  const gx = wallDistance(arena, p.x + e, p.y, p.z) - wallDistance(arena, p.x - e, p.y, p.z);
  const gz = wallDistance(arena, p.x, p.y, p.z + e) - wallDistance(arena, p.x, p.y, p.z - e);
  out.normal.set(-gx, 0, -gz);
  if (out.normal.lengthSq() < 1e-8) out.normal.set(-p.x, 0, -p.z);
  out.normal.normalize();
  out.depth = f + radius;
  return out;
};

/** Deepest obstacle contact for a sphere, or null. */
export const obstacleContact = (arena: Arena, p: Vector3, radius: number, out: Contact): Contact | null => {
  let best = 0;
  let hit = false;
  for (const b of arena.boxes) {
    tmp.set(
      Math.max(b.min.x, Math.min(p.x, b.max.x)),
      Math.max(b.min.y, Math.min(p.y, b.max.y)),
      Math.max(b.min.z, Math.min(p.z, b.max.z)),
    );
    const dx = p.x - tmp.x;
    const dy = p.y - tmp.y;
    const dz = p.z - tmp.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= radius * radius) continue;
    const d = Math.sqrt(d2);
    const depth = radius - d;
    if (depth <= best) continue;
    best = depth;
    hit = true;
    if (d > 1e-4) out.normal.set(dx / d, dy / d, dz / d);
    else out.normal.set(0, 1, 0); // centre is inside the box, push up and out
    out.depth = depth;
  }
  for (const s of arena.spheres) {
    const dx = p.x - s.c.x;
    const dy = p.y - s.c.y;
    const dz = p.z - s.c.z;
    const rr = radius + s.r;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-4;
    const depth = rr - d;
    if (depth <= best) continue;
    best = depth;
    hit = true;
    out.normal.set(dx / d, dy / d, dz / d);
    out.depth = depth;
  }
  return hit ? out : null;
};

/** True when a point is inside or close to any solid. Bots use it to look ahead. */
export const blocked = (arena: Arena, p: Vector3, margin: number): boolean => {
  if (wallDistance(arena, p.x, p.y, p.z) > -margin) return true;
  for (const b of arena.boxes) {
    if (
      p.x > b.min.x - margin && p.x < b.max.x + margin &&
      p.y > b.min.y - margin && p.y < b.max.y + margin &&
      p.z > b.min.z - margin && p.z < b.max.z + margin
    ) return true;
  }
  for (const s of arena.spheres) {
    const rr = s.r + margin;
    if (p.distanceToSquared(s.c) < rr * rr) return true;
  }
  return false;
};

export const updraftAt = (arena: Arena, p: Vector3): Updraft | null => {
  for (const u of arena.updrafts) {
    if (p.y < u.y0 || p.y > u.y1) continue;
    const dx = p.x - u.x;
    const dz = p.z - u.z;
    if (dx * dx + dz * dz < u.radius * u.radius) return u;
  }
  return null;
};

/** Distance along +x or -x from the axis to the wall at a given z and height. */
const wallX = (arena: Arena, z: number, y: number, sign: 1 | -1): number => {
  let lo = 0;
  let hi = arena.halfX * 1.6;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (wallDistance(arena, sign * mid, y, z) < 0) lo = mid;
    else hi = mid;
  }
  return lo;
};

/**
 * The gray box test arena: a tall elliptical chasm with rib arches spanning it,
 * ledges on the long walls, vertebra perches rising from the floor and five
 * updraft columns.
 */
export const buildRiftTestArena = (): Arena => {
  const a = 110;
  const b = 320;
  const arena: Arena = {
    id: "rift-test",
    height: 560,
    halfX: a,
    halfZ: b,
    wallRadius(theta, y) {
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const base = (a * b) / Math.sqrt(b * c * (b * c) + a * s * (a * s));
      const n = 0.07 * Math.sin(3 * theta + y * 0.011) + 0.05 * Math.sin(5 * theta - y * 0.021 + 1.3);
      return base * (1 + n);
    },
    updrafts: [
      { x: 0, z: -40, radius: 22, y0: 0, y1: 560 },
      { x: -48, z: -195, radius: 22, y0: 0, y1: 560 },
      { x: 52, z: -115, radius: 22, y0: 0, y1: 560 },
      { x: -45, z: 110, radius: 22, y0: 0, y1: 560 },
      { x: 20, z: 228, radius: 22, y0: 0, y1: 560 },
    ],
    boxes: [],
    arches: [],
    spheres: [],
    spawns: [],
  };

  // Rib arches span the chasm across x. Each end sinks a little into the wall.
  for (const [z, y] of [[-140, 110], [40, 230], [175, 340]] as const) {
    const reach = Math.min(wallX(arena, z, y, 1), wallX(arena, z, y, -1));
    arena.arches.push({ center: new Vector3(0, y, z), radius: reach + 5, tube: 5 });
  }
  for (const arch of arena.arches) {
    const steps = Math.ceil((Math.PI * arch.radius) / (arch.tube * 1.1));
    for (let i = 0; i <= steps; i++) {
      const phi = (i / steps) * Math.PI;
      arena.spheres.push({
        c: new Vector3(arch.center.x + Math.cos(phi) * arch.radius, arch.center.y + Math.sin(phi) * arch.radius, arch.center.z),
        r: arch.tube,
      });
    }
  }

  // Ledges jut out from the long walls.
  const ledges: Array<[number, number, 1 | -1]> = [
    [-230, 150, 1], [-90, 260, -1], [-20, 90, 1], [90, 300, 1],
    [120, 170, -1], [230, 250, -1], [-180, 380, -1], [10, 410, 1],
  ];
  for (const [z, y, sign] of ledges) {
    const depth = 30;
    const wx = wallX(arena, z, y, sign);
    const inner = sign * (wx - depth);
    const outer = sign * (wx + 12);
    arena.boxes.push({
      kind: "ledge",
      min: new Vector3(Math.min(inner, outer), y - 2.5, z - 22),
      max: new Vector3(Math.max(inner, outer), y + 2.5, z + 22),
    });
  }

  // Vertebra perches rise from the floor.
  for (const [x, z, top] of [[-25, -95, 190], [35, 20, 300], [-10, 160, 240], [45, -250, 150]] as const) {
    arena.boxes.push({ kind: "perch", min: new Vector3(x - 7, 0, z - 7), max: new Vector3(x + 7, top, z + 7) });
    arena.boxes.push({ kind: "perch", min: new Vector3(x - 13, top, z - 13), max: new Vector3(x + 13, top + 4, z + 13) });
  }

  // Ten spawns in a ring, each facing along the ring.
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2 + 0.31;
    const r = arena.wallRadius(t, 300) * 0.55;
    const pos = new Vector3(Math.cos(t) * r, 300 + (i % 3) * 12, Math.sin(t) * r);
    const tangent = new Vector3(-Math.sin(t), 0, Math.cos(t));
    arena.spawns.push({ pos, yaw: Math.atan2(-tangent.x, -tangent.z) });
  }
  return arena;
};
