import { Vector3 } from "three";
import { tuning } from "../config/tuning";
import { forwardFrom } from "../core/math";
import type { Flyer } from "../world/flyer";
import type { World } from "../world/world";

const rel = new Vector3();
const toB = new Vector3();
const from = new Vector3();
const bFwd = new Vector3();

/**
 * Dive strikes. No projectiles: a flyer that is diving and closing fast on
 * another within reach lands a strike. Damage scales with closing speed and
 * the height dropped. From above or behind is clean, a side pass is glancing.
 * A defender who flared just before contact makes the attacker overshoot.
 */
export const stepCombat = (world: World): void => {
  const c = tuning.combat;
  const flyers = world.flyers;
  for (const a of flyers) {
    if (!a.alive || a.strikeCooldown > 0 || a.stun > 0) continue;
    if (!a.diving && a.diveGrace <= 0) continue;
    // Talon lock duels will branch here once a.lockedWith is set.
    for (const b of flyers) {
      if (b === a || !b.alive) continue;
      toB.subVectors(b.pos, a.pos);
      const dist = toB.length();
      if (dist > c.strikeRadius) continue;
      toB.multiplyScalar(1 / (dist || 1));
      rel.subVectors(a.vel, b.vel);
      const closing = rel.dot(toB);
      if (closing < c.minClosingSpeed) continue;
      // When two divers meet head on, the faster one toward the other strikes.
      if ((b.diving || b.diveGrace > 0) && b.strikeCooldown <= 0 && b.vel.dot(toB) * -1 > a.vel.dot(toB)) continue;

      if (b.flareTimer < tuning.flight.flareWindow * b.stats.flareWindowMul) {
        resolveDodge(world, a, b);
      } else {
        resolveHit(world, a, b, closing);
      }
      break;
    }
  }
};

const resolveDodge = (world: World, a: Flyer, b: Flyer): void => {
  const c = tuning.combat;
  // The attacker overshoots and is left low and slow.
  a.speed *= c.missSpeedKeep;
  a.lift -= c.missDrop;
  a.stun = c.missStun;
  a.diving = false;
  a.diveGrace = 0;
  a.diveLock = c.missDiveLock;
  a.strikeCooldown = c.strikeCooldown * 1.5;
  b.speed += c.dodgeBoost;
  b.lift += c.dodgeLift;
  world.events.emit("dodge", { attacker: a.id, defender: b.id });
};

const resolveHit = (world: World, a: Flyer, b: Flyer, closing: number): void => {
  const c = tuning.combat;
  // Direction the attacker arrives from, seen from the defender.
  from.copy(rel).normalize().negate();
  forwardFrom(bFwd, b.yaw, 0);
  const fromAbove = from.y > c.cleanAboveDot;
  const fromBehind = from.x * bFwd.x + from.z * bFwd.z < -c.cleanBehindDot;
  const clean = fromAbove || fromBehind;

  const drop = Math.max(0, a.diveStartY - a.pos.y);
  let damage = c.baseDamage + closing * c.speedDamage + drop * c.heightDamage;
  if (!clean) damage *= c.glancingMul;
  damage *= 1 + a.shards * tuning.shards.power;
  damage *= a.stats.strikeMul * b.stats.damageTakenMul;

  b.health -= damage;
  b.lastHitBy = a.id;
  b.lastDamageCause = "strike";
  b.stun = Math.max(b.stun, c.victimStun);
  b.speed *= c.victimSpeedKeep;
  b.lift -= c.victimDrop;

  a.damageDealt += damage;
  a.strikeCooldown = c.strikeCooldown;
  a.speed *= c.hitSpeedKeep;
  a.lift += c.hitBounce;
  a.diveStartY = a.pos.y;

  world.events.emit("strike", { attacker: a.id, defender: b.id, damage, clean, closing, drop });
};
