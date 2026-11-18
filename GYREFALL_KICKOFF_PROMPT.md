# Gyrefall: kickoff prompt for Claude Code

We are building a new browser game from scratch for OpenGame Game Jam #1.
Start in an empty repo. Do not reuse code or assets from any earlier game.
Commit after each milestone with clear messages, because the jam can ask
for development history as proof the game was made during the jam.

## 1. Set up OpenGame first

Do this before writing game code.

1. Run `npm i -g @opengamehq/cli`, then `opengame setup`.
2. Run `opengame version --json` and `opengame help --json`. Read the help
   output instead of guessing flags.
3. Read `opengame-router/SKILL.md` in the folder that setup names.
4. Fetch https://docs.opengame.io/llms.txt and read these pages: For agents,
   Packaging, Web frameworks, Optimize your assets, Connect the SDK,
   Draw the player's OG, Add a leaderboard, Leaderboards with columns modes
   and runs, Enter a jam, Update a live game.
5. Read https://opengame.io/rules.
6. Run `opengame skills add .` so the skills are committed with the game.
7. Summarize the SDK init and ready requirements, then proceed.

Use only the official OpenGame tools. The CLI is `@opengamehq/cli` and the
SDK is `@opengamehq/sdk`. Other packages with similar names are unrelated.

## 2. The game

Working title: Gyrefall.

A single player aerial battle royale against 9 bots. Third person flying
in a deep vertical chasm. Matches last about 3 minutes.

**World.** Ages ago a colossus fell from the sky and split the land open.
The Rift is the wound. Its ribs form arches, its vertebrae form perches,
and where it bled, giant roots, shelf mushrooms and coral grew. Palette is
restrained: dark stone, pale bone, moss and bark, with coral and glowing
fungi as small bright accents. Glowing growth marks updrafts and pickups.

**Combat.** No projectiles. Damage comes from dive strikes and scales with
closing speed and height dropped. A hit from above or behind is clean, a
side pass is glancing. A miss leaves the attacker low and slow. The
defender can flare at the last moment to make the attacker overshoot.

**Height economy.** Updraft columns give free altitude and are the
contested resource. Defeated flyers drop reef shards that raise strike
power for the rest of the match.

**Squeeze zone.** A storm ceiling lowers while fog rises from below,
forcing everyone into one band of sky.

**Loadouts.** Three slots: mount (how you fly), rider (your special) and
mount armor (stats and look). Armor never changes the rider.

**Planned later, leave clean hooks:** talon lock duels, a "Your OG" rider,
progression screens, two more scenes (The Ribs and The Heart), final art
and audio.

## 3. Stack

- Three.js, TypeScript, Vite. Vite `base` must be `"./"`.
- Static build output with `index.html` at the root. No server.
- Desktop only, mouse and keyboard.
- All asset paths relative and exact in letter case.

## 4. Hard constraints

- First frame within a few seconds, playable in under 10 seconds.
- Download before first playable frame under 50 MB.
- 45 fps or better at 1080p on an ordinary laptop. Peak memory under 1.2 GB.
- Fill the window and handle live resize at 1920x1080, 1366x768, 2560x1440,
  3440x1440 and 1024x640. No letterboxing into a corner.
- No login, ads, tracking, payments, crypto, popups or iframes.
- Must draw its first frame and be fully playable with no network access.

## 5. Skeleton scope

Gray box primitives only. No final art.

1. **Flight controller.** Mouse steers. Hold left click to dive. Right
   click to flare (air brake and dodge). Shift to flap using stamina.
   Height converts to speed and back.
2. **Chase camera** with field of view widening in a dive.
3. **Test arena.** A tall chasm with ledges, arches and 5 updraft columns
   that lift any flyer inside them.
4. **Dive strike.** Collision check, damage from speed and height drop,
   clean versus glancing hits, and a timed flare that causes a miss.
5. **Health, defeat and shard drops.**
6. **Nine bots** with a simple state machine: seek updraft, climb, pick
   target, dive, flare when threatened.
7. **Squeeze zone.** Lowering ceiling and rising fog floor.
8. **Match loop.** Menu, launch, match, results, replay.
9. **Data driven loadouts.** Mount, rider and mount armor defined in config
   files with stats only. One of each for now.
10. **Debug panel** to tune flight and damage values live.

## 6. Architecture

- Keep systems separate: input, flight, combat, AI, zone, match state,
  rendering, audio stub, save.
- Fixed timestep for simulation.
- One asset manager for all models so placeholders can be swapped for
  GLB files later. Build the loader now for GLB with meshopt compression
  and KTX2 textures, with the basis transcoder copied into `public/basis`
  and loaded by relative path.
- Audio will be Opus or AAC at 96 to 128 kbps. Stream music and decode
  only short effects.
- Scenes load in order: the first scene loads, the game signals ready,
  then other scenes load in the background.

## 7. OpenGame integration

- Install `@opengamehq/sdk`. Call `await og.init()` at startup and
  `og.ready()` when the first playable frame is on screen.
- Wire `og.onPause` and `og.audio.onHostMute`. Request fullscreen through
  `og.fullscreen.request()`. The pause key must not be Escape.
- Prefill the player name from `og.player.handle` through
  `og.player.onChange`, with a default name when it is null.
- Save loadout choices in localStorage inside try/catch. The game must
  work when storage is empty.
- In `opengame.json` set genre `shooter-survival`, controls keyboard and
  mouse, players `single`. Stub two leaderboards: a runs board for matches
  and a career board that sums XP. Do not build the UI for them yet.
- "Your OG" rider hook: later we will build the player's OpenGame character
  with `watchAvatar` and the SDK's `examples/avatar-threejs`. Read
  `AVATAR-SPEC.md` in the SDK package before touching it. Never store the
  avatar recipe or alter the head, colors or accessories.
- Test with `opengame dev .` as a guest and with
  `?og-dev-player=signed-in`.

## 8. Deploy rules

- Run `opengame init . --title "Gyrefall" --json` once the project builds.
- Before any deploy run `opengame check . --build --json` and fix every
  finding. We only get 5 deploys and 5 reviews per day.
- Deploy with `opengame deploy . --wait --json`. Give me the deployment URL
  and the preview URL. Do not delete the `.opengame` folder.
- Never publish or submit unless I explicitly ask. Once published, later
  deploys go live automatically after review.
- When login is needed, run `opengame login --json`, give me the link and
  code, and wait for me to confirm before running
  `opengame login --continue --json`.
- Never write a token or API key into a repo file, a command argument or a
  log. Sponsor API keys (Meshy, fal, ElevenLabs) live in a gitignored `.env`
  and are used only by local asset scripts, never by the game at runtime.
- For any finding, follow the repair loop: read fault and certainty, apply
  the smallest fix, run the verify command. Never edit working code to get
  past a platform fault.

## 9. Stop point

When the skeleton runs, stop and give me:

1. A tuning guide for the flight feel.
2. The results of `opengame check . --build --json`.
3. A short list of what you would build next and why.

Do not add anything beyond the skeleton scope until I respond.
