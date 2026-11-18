/**
 * Every gameplay number lives here so the debug panel can edit it live.
 * Units: metres, seconds, radians. Loadout stats multiply these base values.
 */
export const tuning = {
  flight: {
    gravity: 24, // how hard pitch trades height for speed
    cruiseSpeed: 30, // level flight settles here
    cruiseAssist: 0.6, // pull toward cruise speed when slow and level
    minSpeed: 7,
    maxSpeed: 95,
    stallSpeed: 16, // below this the nose droops and sink grows
    drag: 0.0011, // quadratic drag with wings open
    diveDrag: 0.00035, // quadratic drag with wings folded
    diveGravityMul: 1.5,
    turnRate: 1.5,
    diveTurnFactor: 0.55, // steering authority kept while diving
    pitchRate: 1.3,
    maxPitchUp: 1.0,
    maxPitchDown: 1.2,
    diveAngle: 1.05, // nose down angle with the mouse centred
    diveSteerRange: 0.6, // how far the mouse can shallow or steepen a dive
    divePitchRate: 2.6,
    glideSink: 1.6, // constant sink while gliding
    stallSink: 14,
    stallDroop: 0.9,
    liftDecay: 2.2, // how fast flap and flare lift fades
    flapThrust: 7,
    flapLift: 9,
    flapCost: 18,
    flapInterval: 0.45,
    staminaMax: 100,
    staminaRegen: 14,
    staminaRegenDelay: 0.9,
    flareDuration: 0.55,
    flareWindow: 0.35, // dodge window at the start of a flare
    flareCooldown: 1.6,
    flareBrake: 2.6, // exponential speed loss per second while flaring
    flareLift: 7,
    flarePitchKick: 1.2,
    maxBank: 0.95,
    bankRate: 6,
    wallSpeedKeep: 0.55,
    crashSafeSpeed: 22,
    crashDamage: 0.5, // damage per m/s of impact above the safe speed
  },
  input: {
    mouseSensitivity: 1,
    aimRecenter: 0.5, // spring that eases the reticle back to centre
    deadzone: 0.06,
    invertY: 0, // 1 flips vertical steering
  },
  camera: {
    distance: 15,
    height: 4.5,
    lookAhead: 14,
    stiffness: 6,
    baseFov: 62,
    diveFov: 88,
    fovSpeedStart: 35,
    fovSpeedEnd: 90,
    fovRate: 4,
  },
  combat: {
    strikeRadius: 6.5,
    minClosingSpeed: 18,
    baseDamage: 8,
    speedDamage: 0.5, // damage per m/s of closing speed
    heightDamage: 0.25, // damage per metre dropped in the dive
    glancingMul: 0.4,
    cleanAboveDot: 0.45, // how steeply from above counts as clean
    cleanBehindDot: 0.5, // how squarely from behind counts as clean
    strikeCooldown: 1.2,
    diveGrace: 0.4, // strike stays armed this long after releasing dive
    hitBounce: 10, // lift the attacker gains on a hit
    hitSpeedKeep: 0.7,
    victimStun: 0.4,
    victimSpeedKeep: 0.6,
    victimDrop: 6,
    missSpeedKeep: 0.35, // attacker speed kept after being dodged
    missStun: 0.5,
    missDrop: 8,
    missDiveLock: 0.9,
    dodgeBoost: 8,
    dodgeLift: 6,
  },
  shards: {
    dropBase: 2,
    carryDropMax: 4,
    power: 0.08, // strike power gained per shard
    maxCarried: 10,
    pickupRadius: 7,
    lifetime: 45,
    sink: 2,
  },
  updraft: {
    strength: 16,
    edgeFalloff: 0.35,
    staminaBoost: 2, // stamina regen multiplier inside a column
  },
  zone: {
    delay: 20, // seconds before the squeeze starts
    closeTime: 150, // band reaches its held size
    endTime: 200, // band closes completely
    centerY: 260,
    bandHeight: 90,
    damage: 10, // per second at the edge
    depthDamage: 0.4, // extra per second per metre past the edge
  },
  bots: {
    count: 9,
    reactDistance: 40,
    skillMin: 0.3,
    skillMax: 0.7,
    aimLead: 1,
    climbAdvantage: 70, // height a bot tries to hold over the band centre
    attackRange: 190,
    minAdvantage: 18, // height over a target needed to commit
    playerBias: 0.85, // below 1 makes the player a preferred target
  },
};

export type Tuning = typeof tuning;
export const defaultTuning: Tuning = JSON.parse(JSON.stringify(tuning));
