import { Vector3 } from "three";

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame rate independent approach of a toward b. */
export const damp = (a: number, b: number, rate: number, dt: number): number => lerp(a, b, 1 - Math.exp(-rate * dt));

export const wrapAngle = (a: number): number => {
  const twoPi = Math.PI * 2;
  a = (a + Math.PI) % twoPi;
  if (a < 0) a += twoPi;
  return a - Math.PI;
};
export const lerpAngle = (a: number, b: number, t: number): number => a + wrapAngle(b - a) * t;

/** Yaw 0 faces -Z. Turning right lowers yaw. Positive pitch is nose up. */
export const forwardFrom = (out: Vector3, yaw: number, pitch: number): Vector3 => {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
};
export const yawOf = (d: Vector3): number => Math.atan2(-d.x, -d.z);
export const pitchOf = (d: Vector3): number => Math.asin(clamp(d.y / (d.length() || 1), -1, 1));

/** Small seeded generator so arenas and bots are repeatable. */
export const makeRng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
