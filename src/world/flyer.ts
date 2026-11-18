import { Vector3 } from "three";
import type { FlyerStats } from "../config/loadouts";

/** What a pilot asks for each tick. The player and the bots both fill this in. */
export interface FlightControls {
  steerX: number; // -1 left to 1 right
  steerY: number; // -1 down to 1 up
  dive: boolean;
  flare: boolean;
  flap: boolean;
}

export const FLYER_RADIUS = 2.2;

export class Flyer {
  readonly pos = new Vector3();
  readonly prevPos = new Vector3();
  readonly vel = new Vector3();
  yaw = 0;
  pitch = 0;
  roll = 0;
  prevYaw = 0;
  prevPitch = 0;
  prevRoll = 0;
  speed = 0;
  /** Extra vertical speed from flaps, flares and hits. Fades over time. */
  lift = 0;

  health = 100;
  stamina = 100;
  staminaDelay = 0;
  flapTimer = 0;
  alive = true;

  diving = false;
  diveStartY = 0;
  diveGrace = 0;
  diveLock = 0;
  /** Seconds since the current flare began. Infinity when not flaring. */
  flareTimer = Infinity;
  flareCooldown = 0;
  flareHeld = false;
  strikeCooldown = 0;
  stun = 0;
  inUpdraft = false;
  outOfZone = false;

  shards = 0;
  kills = 0;
  damageDealt = 0;
  placement = 0;
  lastHitBy: number | null = null;
  lastDamageCause: "strike" | "zone" | "crash" = "zone";

  /** Reserved for talon lock duels: the id of the flyer this one is locked with. */
  lockedWith: number | null = null;

  readonly controls: FlightControls = { steerX: 0, steerY: 0, dive: false, flare: false, flap: false };

  constructor(
    readonly id: number,
    public name: string,
    readonly isPlayer: boolean,
    public stats: FlyerStats,
  ) {}

  reset(pos: Vector3, yaw: number, speed: number): void {
    this.pos.copy(pos);
    this.prevPos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = this.prevYaw = yaw;
    this.pitch = this.prevPitch = 0;
    this.roll = this.prevRoll = 0;
    this.speed = speed;
    this.lift = 0;
    this.health = this.stats.healthMax;
    this.stamina = 100;
    this.staminaDelay = 0;
    this.flapTimer = 0;
    this.alive = true;
    this.diving = false;
    this.diveStartY = pos.y;
    this.diveGrace = 0;
    this.diveLock = 0;
    this.flareTimer = Infinity;
    this.flareCooldown = 0;
    this.flareHeld = false;
    this.strikeCooldown = 0;
    this.stun = 0;
    this.inUpdraft = false;
    this.outOfZone = false;
    this.shards = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.placement = 0;
    this.lastHitBy = null;
    this.lockedWith = null;
    const c = this.controls;
    c.steerX = c.steerY = 0;
    c.dive = c.flare = c.flap = false;
  }
}
