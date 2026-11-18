import { Vector3 } from "three";
import { tuning } from "../config/tuning";
import { defaultLoadout, resolveLoadout, type LoadoutChoice } from "../config/loadouts";
import { makeRng } from "../core/math";
import { Flyer } from "../world/flyer";
import type { World } from "../world/world";
import { makeBrain, stepBot, type BotBrain } from "./ai";
import { stepCombat } from "./combat";
import { stepFlight } from "./flight";
import type { Input } from "./input";
import { stepZone } from "./zone";

export interface MatchResult {
  placement: number;
  total: number;
  won: boolean;
  kills: number;
  damage: number;
  shards: number;
  time: number;
  xp: number;
}

const BOT_NAMES = ["Ossa", "Marrow", "Thorn", "Kelp", "Vesper", "Brine", "Sable", "Moth", "Cinder", "Wrack", "Lichen", "Spire"];
const LAUNCH_SECONDS = 3;
const RESULTS_DELAY = 1.6;

/** XP rule for the runs board. Progression screens will read the same number. */
export const xpFor = (placement: number, total: number, kills: number, damage: number, won: boolean): number =>
  Math.min(5000, Math.max(0, total - placement) * 40 + kills * 120 + Math.round(damage) + (won ? 300 : 0));

/** Match loop: menu, launch, match, results, replay. Owns the order systems run in. */
export class Match {
  private brains = new Map<number, BotBrain>();
  private rng = makeRng(1);
  private endTimer = -1;
  private matchCount = 0;
  result: MatchResult | null = null;
  onResult: (r: MatchResult) => void = () => {};
  /** Debug switches. */
  freezeBots = false;
  godMode = false;

  constructor(
    private world: World,
    private input: Input,
  ) {}

  start(playerName: string, loadout: LoadoutChoice): void {
    const w = this.world;
    this.matchCount++;
    this.rng = makeRng(Date.now() ^ (this.matchCount * 7919));
    this.brains.clear();
    this.result = null;
    this.endTimer = -1;
    w.shards.length = 0;
    w.flyers = [];

    const spawns = [...w.arena.spawns];
    const playerSlot = Math.floor(this.rng() * spawns.length);
    const botStats = resolveLoadout(defaultLoadout());
    const botCount = Math.min(Math.round(tuning.bots.count), spawns.length - 1);
    let botIndex = 0;
    for (let i = 0; i < spawns.length && w.flyers.length < botCount + 1; i++) {
      const isPlayer = i === playerSlot;
      const f = isPlayer
        ? new Flyer(i, playerName, true, resolveLoadout(loadout))
        : new Flyer(i, BOT_NAMES[botIndex++ % BOT_NAMES.length], false, botStats);
      f.reset(spawns[i].pos, spawns[i].yaw, tuning.flight.cruiseSpeed);
      w.flyers.push(f);
      if (!isPlayer) this.brains.set(f.id, makeBrain(this.rng));
    }
    if (!w.player) {
      // The loop above always seats the player, but never start a match without one.
      const f = new Flyer(99, playerName, true, resolveLoadout(loadout));
      f.reset(spawns[0].pos, spawns[0].yaw, tuning.flight.cruiseSpeed);
      w.flyers.push(f);
    }

    w.time = 0;
    w.zoneCeiling = w.arena.height;
    w.zoneFloor = 0;
    w.launchTimer = LAUNCH_SECONDS;
    this.input.reset();
    this.setPhase("launch");
  }

  toMenu(): void {
    this.setPhase("menu");
  }

  private setPhase(phase: World["phase"]): void {
    this.world.phase = phase;
    this.world.events.emit("phase", { phase });
  }

  step(dt: number): void {
    const w = this.world;
    if (w.phase === "launch") {
      w.launchTimer -= dt;
      for (const f of w.flyers) {
        f.prevPos.copy(f.pos);
        f.prevYaw = f.yaw;
        f.prevPitch = f.pitch;
        f.prevRoll = f.roll;
      }
      if (w.launchTimer <= 0) this.setPhase("match");
      return;
    }
    if (w.phase !== "match") return;

    w.time += dt;
    const player = w.player;
    if (player?.alive) this.input.sample(player.controls, dt);

    for (const f of w.flyers) {
      if (!f.alive) continue;
      const brain = this.brains.get(f.id);
      if (brain) {
        if (this.freezeBots) {
          f.controls.steerX = 0.25;
          f.controls.steerY = (w.arena.height * 0.5 - f.pos.y) * 0.01 - f.pitch;
          f.controls.dive = f.controls.flare = f.controls.flap = false;
        } else {
          stepBot(w, f, brain, this.rng, dt);
        }
      }
      stepFlight(w, f, dt);
    }
    stepCombat(w);
    stepZone(w, dt);
    this.stepShards(dt);
    if (this.godMode && player?.alive) player.health = Math.max(player.health, player.stats.healthMax);
    this.resolveDefeats();
    this.checkEnd(dt);
  }

  private stepShards(dt: number): void {
    const s = tuning.shards;
    const w = this.world;
    const r2 = s.pickupRadius * s.pickupRadius;
    for (const shard of w.shards) {
      if (!shard.active) continue;
      shard.age += dt;
      if (shard.age > s.lifetime) {
        shard.active = false;
        continue;
      }
      shard.vel.multiplyScalar(Math.exp(-1.5 * dt));
      shard.pos.addScaledVector(shard.vel, dt);
      // Shards drift down but ride on top of the fog so they stay reachable.
      shard.pos.y = Math.max(shard.pos.y - s.sink * dt, w.zoneFloor + 8);
      for (const f of w.flyers) {
        if (!f.alive || f.shards >= s.maxCarried) continue;
        if (f.pos.distanceToSquared(shard.pos) > r2) continue;
        f.shards++;
        shard.active = false;
        w.events.emit("pickup", { flyer: f.id, shards: f.shards });
        break;
      }
    }
    if (w.shards.length > 80) w.shards = w.shards.filter((x) => x.active);
  }

  private resolveDefeats(): void {
    // Lowest health falls first. If several fall in one tick the player goes last.
    const fallen = this.world.flyers
      .filter((f) => f.alive && f.health <= 0)
      .sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer) || a.health - b.health);
    for (const f of fallen) this.defeat(f);
  }

  private defeat(f: Flyer): void {
    const w = this.world;
    const s = tuning.shards;
    f.alive = false;
    f.health = 0;
    f.placement = w.aliveCount() + 1;
    const killer = f.lastHitBy === null ? undefined : w.flyerById(f.lastHitBy);
    if (killer && killer !== f) killer.kills++;
    const drops = Math.round(s.dropBase) + Math.min(f.shards, Math.round(s.carryDropMax));
    for (let i = 0; i < drops; i++) {
      const a = (i / drops) * Math.PI * 2 + this.rng() * 0.8;
      w.shards.push({
        pos: f.pos.clone(),
        vel: new Vector3(Math.cos(a) * 9, 4 + this.rng() * 5, Math.sin(a) * 9),
        age: 0,
        active: true,
      });
    }
    w.events.emit("defeat", { victim: f.id, killer: killer ? killer.id : null, cause: f.lastDamageCause });
  }

  private checkEnd(dt: number): void {
    const w = this.world;
    const player = w.player;
    if (!player) return;
    const alive = w.aliveCount();
    const over = !player.alive || alive <= 1;
    if (!over) return;
    if (this.endTimer < 0) this.endTimer = RESULTS_DELAY;
    this.endTimer -= dt;
    if (this.endTimer > 0) return;

    const won = player.alive;
    const placement = won ? 1 : player.placement;
    const total = w.flyers.length;
    this.result = {
      placement,
      total,
      won,
      kills: player.kills,
      damage: Math.round(player.damageDealt),
      shards: player.shards,
      time: w.time,
      xp: xpFor(placement, total, player.kills, player.damageDealt, won),
    };
    this.setPhase("results");
    this.onResult(this.result);
  }
}
