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
  minDist: number;
}

const target = new Vector3();
const probe = new Vector3();
const d = new Vector3();
const toMe = new Vector3();
const eFwd = new Vector3();

const step3 = new Vector3();

/** Counters the headless simulator reads to see why dives end. */
export const aiStats = {
  diveEnds: {} as Record<string, number>,
  minDistSum: 0,
  dives: 0,
  below: { n: 0, targetInUpdraft: 0, targetDiving: 0, flat: 0, time: 0, targetVy: 0, myVy: 0 },
};
const endDive = (b: BotBrain, reason: string): void => {
  aiStats.diveEnds[reason] = (aiStats.diveEnds[reason] ?? 0) + 1;
  aiStats.minDistSum += b.minDist;
  aiStats.dives++;
};

/** True when nothing solid lies along a straight path of the given length. */
const pathClear = (world: World, from: Vector3, dir: Vector3, reach: number, margin: number): boolean => {
  for (let i = 1; i <= 4; i++) {
    step3.copy(from).addScaledVector(dir, (reach * i) / 4);
    if (blocked(world.arena, step3, margin)) return false;
  }
  return true;
};

const AVOID_YAWS = [0.55, -0.55, 1.1, -1.1, 1.7, -1.7];

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
  minDist: 0,
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
    // A flyer riding an updraft rises too fast to catch unless the bot is almost on top of it.
    if (o.vel.y > 6 && Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) > 30) continue;
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
      // Estimate when a dive would meet the target and where the target will be then.
      // A target rising in an updraft closes the gap faster and meets the dive higher up.
      const adv = f.pos.y - o.pos.y;
      const fall = adv / Math.max(t.diveDescent + o.vel.y, 8);
      target.copy(o.pos).addScaledVector(o.vel, fall);
      const flat = Math.hypot(target.x - f.pos.x, target.z - f.pos.z);
      const drop = f.pos.y - target.y;
      // Commit only when that point is reachable in time and the line to it is steep enough.
      if (adv > t.minAdvantage && fall < 3 && drop > 8 && flat < t.diveReach * fall && flat < drop * t.commitSlope) {
        b.minDist = 999;
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
      const reason =
        !o || !o.alive ? "target gone"
        : f.strikeCooldown > 0 ? "struck"
        : f.diveLock > 0 ? "dodged"
        : f.pos.y < o.pos.y - 5 ? "passed below"
        : f.pos.y < floor + 22 ? "too low"
        : b.timer > 6 ? "timeout"
        : "";
      if (reason || !o) {
        if (reason === "passed below" && o) {
          const k = aiStats.below;
          k.n++;
          if (o.inUpdraft) k.targetInUpdraft++;
          if (o.diving) k.targetDiving++;
          k.flat += Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
          k.time += b.timer;
          k.targetVy += o.vel.y;
          k.myVy += f.vel.y;
        }
        endDive(b, reason);
        setState(b, "recover");
        break;
      }
      b.minDist = Math.min(b.minDist, f.pos.distanceTo(o.pos));
      const dist = f.pos.distanceTo(o.pos);
      // Aim where the target will be when the dive reaches its height.
      const closingY = Math.max(Math.max(-f.vel.y, t.diveDescent) + o.vel.y, 8);
      const lead = clamp((f.pos.y - o.pos.y) / closingY, 0.05, 3) * t.aimLead;
      target.copy(o.pos).addScaledVector(o.vel, lead);
      d.copy(f.vel).normalize();
      if (!pathClear(world, f.pos, d, Math.min(dist - 4, f.speed * 0.7), 4)) {
        endDive(b, "blocked");
        setState(b, "recover");
        break;
      }
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
  // Look along the flight path. If it is blocked, try headings to either side and take the first clear one.
  const reach = clamp(f.speed * 1.3, 26, 70);
  const vlen = f.vel.length();
  if (vlen > 1) {
    d.copy(f.vel).multiplyScalar(1 / vlen);
    if (!pathClear(world, f.pos, d, reach, 7)) {
      let found = false;
      for (const offset of AVOID_YAWS) {
        const yaw = f.yaw + offset * b.orbitDir;
        for (const pitch of [0, 0.4, -0.3]) {
          forwardFrom(probe, yaw, pitch);
          if (!pathClear(world, f.pos, probe, reach, 7)) continue;
          c.steerX = clamp(-wrapAngle(yaw - f.yaw) * 3, -1, 1);
          c.steerY = clamp((pitch - f.pitch) * 3, -1, 1);
          found = true;
          break;
        }
        if (found) break;
      }
      if (!found) {
        c.steerX = b.orbitDir;
        c.steerY = f.pos.y < ceiling - 25 ? 0.8 : -0.4;
      }
    }
  }
  if (f.speed < tuning.flight.stallSpeed + 4 && f.stamina > 20) c.flap = true;
};
