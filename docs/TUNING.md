# Gyrefall flight feel tuning guide

Every number below lives in `src/config/tuning.ts` and can be changed live in
the tuning panel. Press the backquote key in a match to open it. Changes apply
on the next simulation tick. "Export changed" writes only the values you moved
as JSON so they can be pasted back into the file. "Freeze bots" and "God mode"
make it easier to feel one thing at a time.

Units are metres, seconds and radians.

## How the model works

Speed is one number along the nose. Each tick:

- Gravity acts along the nose, so nose down gains speed and nose up spends it.
- Quadratic drag bleeds speed. Folded wings (dive) have about a third of the drag.
- Below cruise speed and roughly level, a soft assist pulls speed back to cruise.
- Below stall speed the nose droops and sink grows.
- Flap, flare and hits add or remove `lift`, a vertical push that fades quickly.
- Updraft columns add straight vertical speed to anything inside them.

## Start here: the five numbers that define the feel

| Value | Default | Raise it to | Lower it to |
| --- | --- | --- | --- |
| `flight.gravity` | 24 | make dives build speed faster and climbs cost more | make flight floatier |
| `flight.diveGravityMul` | 1.5 | make committing to a dive feel violent | make dives gentler and easier to aim |
| `flight.drag` | 0.0011 | make speed fade sooner after a dive | let a dive carry into a long zoom climb |
| `flight.turnRate` | 1.5 | tighten turns | make flyers feel heavier |
| `flight.cruiseAssist` | 0.6 | keep level flight effortless | force players to manage energy by hand |

## Recipes

**Too floaty.** Raise `gravity` to 28 to 30 and `glideSink` to 2.5. Lower `cruiseAssist` to 0.3.

**Too twitchy.** Lower `turnRate` to 1.2 and `pitchRate` to 1.0. Raise `input.deadzone` to 0.1. Lower `flight.bankRate` so the roll lags a little.

**Dives are too hard to aim.** Raise `flight.diveTurnFactor` toward 0.8, raise `combat.assistRate` and widen `combat.assistCone`. Set `assistRate` to 0 to feel raw aim.

**Dives do not feel fast.** Raise `camera.diveFov` (88) and lower `camera.fovSpeedStart` (35) so the widening starts sooner. Lower `flight.diveDrag`. Top speed is capped by `flight.maxSpeed` (95).

**Pulling out of a dive gives back too little height.** Lower `flight.drag`. In one test a 110 m dive that clipped a ledge returned about 40 m in the zoom climb, so a clean dive returns more.

**Flare is too punishing or too weak.** `flareBrake` (1.5) is the speed lost per second during the 0.55 s flare. `flarePitchKick` (0.7) tips the nose up. `flareWindow` (0.35) is the dodge window at the start, and `flareCooldown` (1.6) stops spam.

**Flap is too strong.** Each flap costs `flapCost` (18) stamina for `flapThrust` (7 m/s) and `flapLift` (11). A full bar is five flaps. Stamina regenerates at `staminaRegen` (14 per second) after `staminaRegenDelay`, and twice as fast inside an updraft.

**Stalls feel unfair.** Lower `stallSpeed` (16), `stallSink` (14) or `stallDroop` (0.9).

## Dive control

While left click is held the mouse sets how steep the dive is rather than a
pitch rate. `diveAngle` (0.85, about 49 degrees) is the angle with the reticle
centred. `diveSteerRange` (0.85) is how far the mouse can shallow or steepen
it, so mouse fully up holds a level tuck and mouse fully down is near vertical.
`divePitchRate` is how fast the nose follows.

## Mouse

`input.mouseSensitivity` scales pointer lock movement. `input.aimRecenter` is a
spring that eases the reticle back to centre. At 0 the reticle stays where you
leave it. `input.invertY` set to 1 flips vertical steering.

## Camera

`camera.distance` and `camera.height` place the chase camera, `lookAhead` is
how far in front of the flyer it looks and `stiffness` is how tightly it
follows. Field of view runs from `baseFov` to `diveFov` between `fovSpeedStart`
and `fovSpeedEnd`, at full strength only while diving.

## Strike damage

`damage = (baseDamage + closing speed x speedDamage + height dropped x heightDamage)`,
times `glancingMul` for a side pass, times 1 + `shards.power` per shard carried.
A hit is clean when it arrives from above (`cleanAboveDot`) or from behind
(`cleanBehindDot`). With the defaults, a 60 m/s strike after an 80 m drop does
70 clean or 32 glancing against 100 health.

A dodged attacker keeps `missSpeedKeep` of its speed, is pushed down by
`missDrop`, is stunned for `missStun` and cannot dive for `missDiveLock`.

## Match pacing

`zone.delay`, `zone.closeTime` and `zone.endTime` set the squeeze. The band
holds `zone.bandHeight` around `zone.centerY`, then closes to nothing at
`endTime`, which is the hard stop on match length (200 s).

## Headless balance check

`npm run sim` plays 40 full matches with no rendering and prints strikes,
dodges, crashes, causes of defeat and why bot dives ended. `PASSIVE=1 npm run sim`
puts a player who never fights or dodges in the seat. Use it after changing
combat or bot values.
