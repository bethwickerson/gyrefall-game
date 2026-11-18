import mountsJson from "./mounts.json";
import ridersJson from "./riders.json";
import armorsJson from "./armors.json";

/** Loadouts are data only. Three slots: mount (how you fly), rider (your special), mount armor (stats and look). */
export interface MountDef {
  id: string;
  name: string;
  blurb: string;
  model: string;
  stats: { healthBase: number; speedMul: number; turnMul: number; diveMul: number; staminaMul: number };
}
export interface RiderDef {
  id: string;
  name: string;
  blurb: string;
  model: string;
  /** Hook for rider specials. "your-og" is reserved for the player's OpenGame character. */
  special: string;
  stats: { strikeMul: number; flareWindowMul: number };
}
export interface ArmorDef {
  id: string;
  name: string;
  blurb: string;
  model: string;
  tint: string;
  stats: { healthMul: number; dragMul: number; damageTakenMul: number };
}

export const mounts = mountsJson as MountDef[];
export const riders = ridersJson as RiderDef[];
export const armors = armorsJson as ArmorDef[];

export interface LoadoutChoice {
  mount: string;
  rider: string;
  armor: string;
}

export const defaultLoadout = (): LoadoutChoice => ({ mount: mounts[0].id, rider: riders[0].id, armor: armors[0].id });

/** Flat numbers the simulation reads. Armor feeds mount stats and look only. */
export interface FlyerStats {
  healthMax: number;
  speedMul: number;
  turnMul: number;
  diveMul: number;
  staminaMul: number;
  dragMul: number;
  damageTakenMul: number;
  strikeMul: number;
  flareWindowMul: number;
  special: string;
  mountModel: string;
  riderModel: string;
  armorModel: string;
  armorTint: string;
}

const pick = <T extends { id: string }>(list: T[], id: string): T => list.find((x) => x.id === id) ?? list[0];

/** Unknown ids fall back to the first entry so an old save can never break a match. */
export const sanitizeLoadout = (c: Partial<LoadoutChoice> | null | undefined): LoadoutChoice => ({
  mount: pick(mounts, c?.mount ?? "").id,
  rider: pick(riders, c?.rider ?? "").id,
  armor: pick(armors, c?.armor ?? "").id,
});

export const resolveLoadout = (choice: LoadoutChoice): FlyerStats => {
  const m = pick(mounts, choice.mount);
  const r = pick(riders, choice.rider);
  const a = pick(armors, choice.armor);
  return {
    healthMax: m.stats.healthBase * a.stats.healthMul,
    speedMul: m.stats.speedMul,
    turnMul: m.stats.turnMul,
    diveMul: m.stats.diveMul,
    staminaMul: m.stats.staminaMul,
    dragMul: a.stats.dragMul,
    damageTakenMul: a.stats.damageTakenMul,
    strikeMul: r.stats.strikeMul,
    flareWindowMul: r.stats.flareWindowMul,
    special: r.special,
    mountModel: m.model,
    riderModel: r.model,
    armorModel: a.model,
    armorTint: a.tint,
  };
};
