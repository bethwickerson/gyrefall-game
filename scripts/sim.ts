/**
 * Headless balance check. Runs whole matches at full speed with no rendering
 * and prints how they went. The player seat is flown by a bot brain, or left
 * passive with PASSIVE=1.
 *
 *   npm run sim            ten bots
 *   PASSIVE=1 npm run sim  player glides in circles and never fights
 */
import { makeRng } from "../src/core/math";
import { aiStats, makeBrain, stepBot } from "../src/systems/ai";
import type { Input } from "../src/systems/input";
import { Match } from "../src/systems/match";
import { buildRiftTestArena, wallDistance } from "../src/world/arena";
import { defaultLoadout } from "../src/config/loadouts";
import type { FlightControls } from "../src/world/flyer";
import { World } from "../src/world/world";

const MATCHES = Number(process.env.MATCHES ?? 40);
const passive = process.env.PASSIVE === "1";
const dt = 1 / 60;

const totals = { time: 0, strikes: 0, clean: 0, dodges: 0, crashes: 0, pickups: 0, strikeDamage: 0, maxTime: 0, minTime: Infinity, wins: 0, placement: 0 };
const causes: Record<string, number> = { strike: 0, zone: 0, crash: 0 };
const firstBlood: number[] = [];
const crashWhere: Record<string, number> = { wall: 0, floor: 0, obstacle: 0, whileDiving: 0 };
let dives = 0;
const stuck: number[] = [];

for (let m = 0; m < MATCHES; m++) {
  const world = new World(buildRiftTestArena());
  const rng = makeRng(1000 + m);
  const brain = makeBrain(rng);
  const fake = {
    reset() {},
    sample(out: FlightControls, step: number) {
      const p = world.player;
      if (!p) return;
      if (passive) {
        out.steerX = 0.3;
        out.steerY = (world.zoneCeiling + world.zoneFloor) / 2 > p.pos.y ? 0.3 - p.pitch : -0.2 - p.pitch;
        out.dive = out.flare = false;
        out.flap = p.speed < 22;
      } else {
        stepBot(world, p, brain, rng, step);
      }
    },
  } as unknown as Input;
  const match = new Match(world, fake);
  let first = -1;
  world.events.on("strike", (e) => { totals.strikes++; totals.strikeDamage += e.damage; if (e.clean) totals.clean++; });
  world.events.on("dodge", () => totals.dodges++);
  world.events.on("crash", (e) => {
    totals.crashes++;
    const f = world.flyerById(e.flyer);
    if (!f) return;
    if (f.pos.y < 6) crashWhere.floor++;
    else if (wallDistance(world.arena, f.pos.x, f.pos.y, f.pos.z) > -5) crashWhere.wall++;
    else crashWhere.obstacle++;
    if (f.diving || f.diveGrace > 0) crashWhere.whileDiving++;
  });
  world.events.on("pickup", () => totals.pickups++);
  world.events.on("defeat", (e) => { causes[e.cause]++; if (first < 0) first = world.time; });
  match.start("Sim", defaultLoadout());
  let guard = 0;
  let slowTicks = 0;
  const wasDiving = new Map<number, boolean>();
  while (world.phase !== "results" && guard++ < 60 * 400) {
    match.step(dt);
    for (const f of world.flyers) {
      if (!f.alive) continue;
      if (f.speed < 9) slowTicks++;
      const was = wasDiving.get(f.id) ?? false;
      if (f.diving && !was) dives++;
      wasDiving.set(f.id, f.diving);
    }
  }
  const r = match.result;
  if (!r) { console.log(`match ${m} did not finish`); continue; }
  totals.time += r.time;
  totals.maxTime = Math.max(totals.maxTime, r.time);
  totals.minTime = Math.min(totals.minTime, r.time);
  totals.placement += r.placement;
  if (r.won) totals.wins++;
  firstBlood.push(first);
  stuck.push(slowTicks / 60);
}

const n = MATCHES;
const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
console.log(JSON.stringify({
  matches: n,
  playerSeat: passive ? "passive" : "bot",
  avgPlayerTime: +(totals.time / n).toFixed(1),
  minPlayerTime: +totals.minTime.toFixed(1),
  maxPlayerTime: +totals.maxTime.toFixed(1),
  avgPlacement: +(totals.placement / n).toFixed(2),
  playerWins: totals.wins,
  strikesPerMatch: +(totals.strikes / n).toFixed(1),
  cleanShare: +(totals.clean / Math.max(totals.strikes, 1)).toFixed(2),
  avgStrikeDamage: +(totals.strikeDamage / Math.max(totals.strikes, 1)).toFixed(1),
  dodgesPerMatch: +(totals.dodges / n).toFixed(1),
  crashesPerMatch: +(totals.crashes / n).toFixed(1),
  pickupsPerMatch: +(totals.pickups / n).toFixed(1),
  defeatsByCausePerMatch: Object.fromEntries(Object.entries(causes).map(([k, v]) => [k, +(v / n).toFixed(1)])),
  divesPerMatch: +(dives / n).toFixed(1),
  crashWherePerMatch: Object.fromEntries(Object.entries(crashWhere).map(([k, v]) => [k, +(v / n).toFixed(1)])),
  diveEndsPerMatch: Object.fromEntries(Object.entries(aiStats.diveEnds).map(([k, v]) => [k, +(v / n).toFixed(1)])),
  passedBelow: Object.fromEntries(Object.entries(aiStats.below).map(([k, v]) => [k, k === "n" ? v : +(v / Math.max(aiStats.below.n, 1)).toFixed(2)])),
  avgClosestApproachInDive: +(aiStats.minDistSum / Math.max(aiStats.dives, 1)).toFixed(1),
  avgFirstDefeatAt: +avg(firstBlood.filter((x) => x >= 0)).toFixed(1),
  avgSecondsNearMinSpeedPerMatch: +avg(stuck).toFixed(1),
}, null, 2));
