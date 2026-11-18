import { Vector3 } from "three";
import { tuning } from "../config/tuning";
import { clamp, forwardFrom, pitchOf, wrapAngle, yawOf } from "../core/math";
import { blocked, type Updraft } from "../world/arena";
import type { Flyer } from "../world/flyer";
import type { World } from "../world/world";

type BotState = "seek" | "climb" | "hunt" | "dive" | "recover";

export interface BotBrain {
  state: BotState;
  timer: number;
  updraft: Updraft | null;
  targetId: number | null;
  desiredAlt: number;
  orbitDir: 1 | -1;
  skill: number;
  threatId: number | null;
  willDodge: boolean;
}

const target = new Vector3();
const probe = new Vector3();
const d = new Vector3();
const toMe = new Vector3();
const eFwd = new Vector3();

export const makeBrain = (rng: () => number): BotBrain => ({
  state: "seek",
  timer: 0,
  updraft: null,
  targetId: null,
  desiredAlt: 0,
  orbitDir: rng() < 0.5 ? 1 : -1,
  skill: tuning.bots.skillMin + (tuning.bots.skillMax - tuning.bots.skillMin) * rng(),
  threatId: null,
  willDodge: false,
});

const setState = (b: BotBrain, s: BotState): void => {
  b.state = s;
  b.timer = 0;
};

/** Point the controls at a world position. Pitch is limited so cruising stays shallow. */
const steerTo = (f: Flyer, p: Vector3, maxPitch: number): void => {
  const c = f.controls;
  d.subVectors(p, f.pos);
  c.steerX = clamp(-wrapAngle(yawOf(d) - f.yaw) * 2.2, -1, 1);
  const want = clamp(pitchOf(d), -maxPitch, maxPitch);
  if (f.diving) c.steerY = clamp((want + tuning.flight.diveAngle) / tuning.flight.diveSteerRange, -1, 1);
  else c.steerY = clamp((want - f.pitch) * 3, -1, 1);
};

const pickUpdraft = (world: World, f: Flyer, rng: () => number): Updraft => {
  let best = world.arena.updrafts[0];
  let bestScore = Infinity;
  for (const u of world.arena.updrafts) {
    const score = Math.hypot(u.x - f.pos.x, u.z - f.pos.z) * (0.7 + rng() * 0.6);
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best;
};

const pickTarget = (world: World, f: Flyer): Flyer | null => {
  const t = tuning.bots;
  let best: Flyer | null = null;
  let bestScore = Infinity;
  for (const o of world.flyers) {
    if (o === f || !o.alive) continue;
    if (f.pos.y - o.pos.y < t.minAdvantage) continue;
    const dist = f.pos.distanceTo(o.pos);
    if (dist > t.attackRange) continue;
    const score = dist * (o.isPlayer ? t.playerBias : 1);
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
};

/**
 * One bot tick. A simple state machine: seek an updraft, climb it, pick a
 * target below, dive on it, recover. Flaring when threatened runs on top.
 */
export const stepBot = (world: World, f: Flyer, b: BotBrain, rng: () => number, dt: number): void => {
  const c = f.controls;
  const t = tuning.bots;
  c.dive = false;
  c.flap = false;
  c.flare = false;
  b.timer += dt;

  const ceiling = world.zoneCeiling;
  const floor = world.zoneFloor;
  const mid = (ceiling + floor) / 2;
  const safeY = (y: number): number => clamp(y, floor + 18, Math.max(floor + 19, ceiling - 14));

  switch (b.state) {
    case "seek": {
      if (!b.updraft) b.updraft = pickUpdraft(world, f, rng);
      const u = b.updraft;
      target.set(u.x, safeY(f.pos.y + 4), u.z);
      steerTo(f, target, 0.45);
      if (Math.hypot(f.pos.x - u.x, f.pos.z - u.z) < u.radius * 0.7) {
        b.desiredAlt = mid + t.climbAdvantage * (0.6 + rng() * 0.7);
        setState(b, "climb");
      } else if (b.timer > 14) {
        b.updraft = null;
        b.timer = 0;
      }
      break;
    }
    case "climb": {
      const u = b.updraft ?? pickUpdraft(world, f, rng);
      const ang = Math.atan2(f.pos.z - u.z, f.pos.x - u.x) + b.orbitDir * 0.9;
      target.set(u.x + Math.cos(ang) * u.radius * 0.45, f.pos.y + 6, u.z + Math.sin(ang) * u.radius * 0.45);
      steerTo(f, target, 0.3);
      if (f.pos.y >= Math.min(b.desiredAlt, ceiling - 16) || b.timer > 14) {
        b.updraft = null;
        setState(b, "hunt");
      }
      break;
    }
    case "hunt": {
      const o = pickTarget(world, f);
      if (!o) {
        // Nothing below to hit. Drift toward the middle, then go back for height.
        target.set(0, safeY(f.pos.y), clamp(f.pos.z * 0.5, -150, 150));
        steerTo(f, target, 0.3);
        if (b.timer > 3 || f.pos.y < mid - 5) setState(b, "seek");
        break;
      }
      b.targetId = o.id;
      const flat = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
      const adv = f.pos.y - o.pos.y;
      if (flat < adv * 1.6 + 25) {
        setState(b, "dive");
      } else {
        target.set(o.pos.x, safeY(f.pos.y), o.pos.z);
        steerTo(f, target, 0.3);
        if (b.timer > 10) setState(b, "seek");
      }
      break;
    }
    case "dive": {
      const o = b.targetId === null ? undefined : world.flyerById(b.targetId);
      const spent =
        !o || !o.alive || f.strikeCooldown > 0 || f.diveLock > 0 ||
        f.pos.y < o.pos.y - 8 || f.pos.y < floor + 22 || b.timer > 6;
      if (spent) {
        setState(b, "recover");
        break;
      }
      const dist = f.pos.distanceTo(o.pos);
      const lead = (dist / Math.max(f.speed, 40)) * t.aimLead;
      target.copy(o.pos).addScaledVector(o.vel, lead);
      c.dive = true;
      steerTo(f, target, 1.5);
      break;
    }
    case "recover": {
      c.steerX = b.orbitDir * 0.3;
      c.steerY = f.pitch < 0.15 ? 1 : 0;
      c.flap = f.stamina > 30;
      if (b.timer > 1.3) setState(b, "seek");
      break;
    }
  }

  // Flare when a diver is about to connect. Skill decides once per threat.
  let threatened = false;
  for (const e of world.flyers) {
    if (e === f || !e.alive || !e.diving) continue;
    toMe.subVectors(f.pos, e.pos);
    const dist = toMe.length();
    if (dist > t.reactDistance) continue;
    toMe.multiplyScalar(1 / (dist || 1));
    const closing = (e.vel.x - f.vel.x) * toMe.x + (e.vel.y - f.vel.y) * toMe.y + (e.vel.z - f.vel.z) * toMe.z;
    forwardFrom(eFwd, e.yaw, e.pitch);
    if (closing < 15 || eFwd.dot(toMe) < 0.9) continue;
    threatened = true;
    if (b.threatId !== e.id) {
      b.threatId = e.id;
      b.willDodge = rng() < b.skill;
    }
    const timeToHit = (dist - tuning.combat.strikeRadius) / closing;
    if (b.willDodge && timeToHit < 0.2 && f.flareCooldown <= 0) c.flare = true;
    break;
  }
  if (!threatened) b.threatId = null;

  if (b.state === "dive") return;

  // Safety layers: stay inside the band, avoid solids, never stall.
  if (f.pos.y > ceiling - 10) c.steerY = -0.8;
  if (f.pos.y < floor + 16) {
    c.steerY = 1;
    c.flap = true;
  }
  const reach = clamp(f.speed, 20, 55);
  probe.copy(f.pos).addScaledVector(f.vel, reach / Math.max(f.vel.length(), 1));
  if (blocked(world.arena, probe, 7)) {
    target.set(0, f.pos.y + 20, clamp(f.pos.z * 0.6, -200, 200));
    d.subVectors(target, f.pos);
    c.steerX = clamp(-wrapAngle(yawOf(d) - f.yaw) * 3, -1, 1);
    if (Math.abs(c.steerX) < 0.3) c.steerX = b.orbitDir;
    if (f.pos.y < ceiling - 25) c.steerY = 0.7;
  }
  if (f.speed < tuning.flight.stallSpeed + 4 && f.stamina > 20) c.flap = true;
};
