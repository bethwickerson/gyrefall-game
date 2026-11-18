import { tuning } from "../config/tuning";
import { clamp, lerp } from "../core/math";
import type { World } from "../world/world";

/** Where the storm ceiling and the fog floor sit at a given match time. */
export const zoneAt = (time: number, arenaHeight: number): { ceiling: number; floor: number } => {
  const z = tuning.zone;
  const half = z.bandHeight / 2;
  if (time <= z.delay) return { ceiling: arenaHeight, floor: 0 };
  if (time <= z.closeTime) {
    const k = clamp((time - z.delay) / Math.max(z.closeTime - z.delay, 1), 0, 1);
    return { ceiling: lerp(arenaHeight, z.centerY + half, k), floor: lerp(0, z.centerY - half, k) };
  }
  const k = clamp((time - z.closeTime) / Math.max(z.endTime - z.closeTime, 1), 0, 1);
  return { ceiling: lerp(z.centerY + half, z.centerY, k), floor: lerp(z.centerY - half, z.centerY, k) };
};

/** The squeeze: a lowering storm ceiling and a rising fog floor that hurt anyone outside the band. */
export const stepZone = (world: World, dt: number): void => {
  const z = tuning.zone;
  const band = zoneAt(world.time, world.arena.height);
  world.zoneCeiling = band.ceiling;
  world.zoneFloor = band.floor;
  for (const f of world.flyers) {
    if (!f.alive) continue;
    const over = Math.max(f.pos.y - band.ceiling, band.floor - f.pos.y);
    f.outOfZone = over > 0;
    if (over > 0) {
      f.health -= (z.damage + over * z.depthDamage) * dt;
      f.lastDamageCause = "zone";
    }
  }
};
