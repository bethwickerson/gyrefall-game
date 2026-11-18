import { Vector3 } from "three";
import { tuning } from "../config/tuning";
import { clamp, damp, forwardFrom, pitchOf, yawOf } from "../core/math";
import { obstacleContact, updraftAt, wallContact, type Contact } from "../world/arena";
import { FLYER_RADIUS, type Flyer } from "../world/flyer";
import type { World } from "../world/world";

const fwd = new Vector3();
const dir = new Vector3();
const contact: Contact = { normal: new Vector3(), depth: 0 };

/**
 * Flight controller shared by the player and the bots. Speed is a single
 * number along the nose. Pitch trades it against height, so diving builds
 * speed and pulling up spends it.
 */
export const stepFlight = (world: World, f: Flyer, dt: number): void => {
  const t = tuning.flight;
  const s = f.stats;
  const c = f.controls;

  f.prevPos.copy(f.pos);
  f.prevYaw = f.yaw;
  f.prevPitch = f.pitch;
  f.prevRoll = f.roll;

  f.stun = Math.max(0, f.stun - dt);
  f.diveLock = Math.max(0, f.diveLock - dt);
  f.strikeCooldown = Math.max(0, f.strikeCooldown - dt);
  f.flareCooldown = Math.max(0, f.flareCooldown - dt);
  f.flapTimer = Math.max(0, f.flapTimer - dt);
  f.staminaDelay = Math.max(0, f.staminaDelay - dt);

  const stunned = f.stun > 0;
  const steerX = stunned ? 0 : clamp(c.steerX, -1, 1);
  const steerY = stunned ? 0 : clamp(c.steerY, -1, 1);

  // Dive state. Remember the height the dive started from for strike damage.
  const wantsDive = c.dive && !stunned && f.diveLock <= 0;
  if (wantsDive && !f.diving) {
    if (f.diveGrace <= 0) f.diveStartY = f.pos.y;
    f.diving = true;
  } else if (!wantsDive && f.diving) {
    f.diving = false;
    f.diveGrace = tuning.combat.diveGrace;
  }
  if (!f.diving) {
    f.diveGrace = Math.max(0, f.diveGrace - dt);
    if (f.diveGrace <= 0) f.diveStartY = f.pos.y;
  } else if (f.pos.y > f.diveStartY) {
    f.diveStartY = f.pos.y;
  }

  // Flare: an air brake with a short dodge window at the start.
  if (c.flare && !f.flareHeld && f.flareCooldown <= 0 && !stunned) {
    f.flareTimer = 0;
    f.flareCooldown = t.flareCooldown;
    f.lift += t.flareLift;
    world.events.emit("flare", { flyer: f.id });
  }
  f.flareHeld = c.flare;
  const flaring = f.flareTimer < t.flareDuration;
  if (f.flareTimer !== Infinity) {
    f.flareTimer += dt;
    if (f.flareTimer > t.flareDuration + 1) f.flareTimer = Infinity;
  }

  // Steering. Slow flyers and divers have less authority.
  const authority = clamp(f.speed / t.stallSpeed, 0.35, 1);
  const turn = t.turnRate * s.turnMul * authority * (f.diving ? t.diveTurnFactor : 1);
  f.yaw -= steerX * turn * dt;
  if (f.diving) {
    const target = clamp(-t.diveAngle + steerY * t.diveSteerRange, -1.5, 0.2);
    f.pitch = damp(f.pitch, target, t.divePitchRate, dt);
  } else {
    f.pitch += steerY * t.pitchRate * authority * dt;
    if (flaring) f.pitch += t.flarePitchKick * dt;
  }
  if (f.speed < t.stallSpeed) f.pitch -= t.stallDroop * (1 - f.speed / t.stallSpeed) * dt;
  f.pitch = clamp(f.pitch, -Math.max(t.maxPitchDown, f.diving ? 1.5 : 0), t.maxPitchUp);
  f.roll = damp(f.roll, steerX * t.maxBank, t.bankRate, dt);

  // Energy: gravity along the nose, drag, and a gentle pull to cruise speed.
  const gravity = t.gravity * (f.diving ? t.diveGravityMul * s.diveMul : 1);
  f.speed -= gravity * Math.sin(f.pitch) * dt;
  const drag = (f.diving ? t.diveDrag : t.drag) * s.dragMul;
  f.speed -= drag * f.speed * f.speed * dt;
  if (flaring) f.speed *= Math.exp(-t.flareBrake * dt);
  const cruise = t.cruiseSpeed * s.speedMul;
  if (f.speed < cruise && f.pitch < 0.15 && !flaring) f.speed += (cruise - f.speed) * t.cruiseAssist * dt;

  // Flap: spend stamina for thrust and lift.
  const staminaMax = t.staminaMax * s.staminaMul;
  if (c.flap && !stunned && f.flapTimer <= 0 && f.stamina >= t.flapCost) {
    f.stamina -= t.flapCost;
    f.staminaDelay = t.staminaRegenDelay;
    f.flapTimer = t.flapInterval;
    f.speed += t.flapThrust;
    f.lift += t.flapLift;
    world.events.emit("flap", { flyer: f.id });
  }

  // Updrafts lift anything inside them.
  let rise = 0;
  const up = updraftAt(world.arena, f.pos);
  f.inUpdraft = up !== null;
  if (up) {
    const d = Math.hypot(f.pos.x - up.x, f.pos.z - up.z) / up.radius;
    const edge = clamp((1 - d) / Math.max(tuning.updraft.edgeFalloff, 0.01), 0, 1);
    rise = tuning.updraft.strength * edge;
  }
  if (f.staminaDelay <= 0) {
    const regen = t.staminaRegen * (f.inUpdraft ? tuning.updraft.staminaBoost : 1);
    f.stamina = Math.min(staminaMax, f.stamina + regen * dt);
  }

  f.speed = clamp(f.speed, t.minSpeed, t.maxSpeed * s.speedMul);
  const stall = Math.max(0, 1 - f.speed / t.stallSpeed);
  const sink = t.glideSink + t.stallSink * stall * stall;
  f.lift *= Math.exp(-t.liftDecay * dt);

  forwardFrom(fwd, f.yaw, f.pitch);
  f.vel.copy(fwd).multiplyScalar(f.speed);
  f.vel.y += f.lift + rise - sink;
  f.pos.addScaledVector(f.vel, dt);

  collide(world, f);
};

/** Push the flyer out of walls and obstacles, turn it along the surface and charge crash damage. */
const collide = (world: World, f: Flyer): void => {
  const t = tuning.flight;
  const arena = world.arena;
  for (let pass = 0; pass < 2; pass++) {
    let hit = wallContact(arena, f.pos, FLYER_RADIUS, contact);
    if (!hit) hit = obstacleContact(arena, f.pos, FLYER_RADIUS, contact);
    if (!hit && f.pos.y < FLYER_RADIUS) {
      contact.normal.set(0, 1, 0);
      contact.depth = FLYER_RADIUS - f.pos.y;
      hit = contact;
    }
    if (!hit && f.pos.y > arena.height + 40) {
      contact.normal.set(0, -1, 0);
      contact.depth = f.pos.y - (arena.height + 40);
      hit = contact;
    }
    if (!hit) return;

    f.pos.addScaledVector(hit.normal, hit.depth + 0.05);
    const into = -f.vel.dot(hit.normal);
    if (into <= 0) continue;

    // Slide: remove the part of the heading that points into the surface.
    forwardFrom(dir, f.yaw, f.pitch);
    dir.addScaledVector(hit.normal, -dir.dot(hit.normal) * 1.35);
    if (dir.lengthSq() < 1e-4) dir.copy(hit.normal);
    dir.normalize();
    f.yaw = yawOf(dir);
    f.pitch = clamp(pitchOf(dir), -t.maxPitchDown, t.maxPitchUp);

    const over = into - t.crashSafeSpeed;
    if (over > 0) {
      f.speed *= t.wallSpeedKeep;
      f.stun = Math.max(f.stun, 0.25);
      const damage = over * t.crashDamage * f.stats.damageTakenMul;
      if (damage > 0.5) {
        f.health -= damage;
        f.lastDamageCause = "crash";
        world.events.emit("crash", { flyer: f.id, damage });
      }
    } else {
      f.speed *= 1 - 0.25 * clamp(into / t.crashSafeSpeed, 0, 1);
    }
    f.vel.copy(dir).multiplyScalar(f.speed);
  }
};
