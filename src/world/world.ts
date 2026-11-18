import { Vector3 } from "three";
import type { Arena } from "./arena";
import type { Flyer } from "./flyer";
import { EventBus } from "../core/events";

export interface Shard {
  pos: Vector3;
  vel: Vector3;
  age: number;
  active: boolean;
}

export type Phase = "menu" | "launch" | "match" | "results";

/** Shared simulation state. Systems read and write this, nothing else. */
export class World {
  readonly events = new EventBus();
  flyers: Flyer[] = [];
  shards: Shard[] = [];
  phase: Phase = "menu";
  /** Seconds since the match went live. */
  time = 0;
  launchTimer = 0;
  zoneCeiling: number;
  zoneFloor = 0;

  constructor(public arena: Arena) {
    this.zoneCeiling = arena.height;
  }

  get player(): Flyer | undefined {
    return this.flyers.find((f) => f.isPlayer);
  }

  aliveCount(): number {
    let n = 0;
    for (const f of this.flyers) if (f.alive) n++;
    return n;
  }

  flyerById(id: number): Flyer | undefined {
    return this.flyers.find((f) => f.id === id);
  }
}
