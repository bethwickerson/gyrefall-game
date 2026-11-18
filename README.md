# Gyrefall

A single player aerial battle royale against nine bots, built for OpenGame Game Jam #1.
Third person flight in a deep vertical chasm. No projectiles: climb, dive and strike.

This is the gray box skeleton. All art is placeholder primitives.

## Run

```bash
npm install
npx opengame dev . --build
```

`opengame dev` serves the build with the OpenGame SDK mock. Add `?og-dev-player=signed-in`
to the address to play as a signed-in player. `npm run dev` runs plain Vite for fast
iteration, where the SDK has no player and no services.

Other commands: `npm run build`, `npm run sim` (headless balance check) and
`npx opengame check . --build --json`.

## Controls

Mouse steers. Hold left click to dive. Right click or Space flares. Shift flaps.
P pauses, F toggles fullscreen and the backquote key opens the tuning panel.

## Layout

- `src/config` tuning values, loadouts (mount, rider, mount armor), scene list and the model manifest
- `src/world` arena data, flyer state and shared world state
- `src/systems` input, flight, combat, AI, zone, match loop, save and the audio stub
- `src/render` asset manager (GLB with meshopt and KTX2), scene view and chase camera
- `src/ui` menu, HUD, results and the tuning panel
- `src/platform/og.ts` the only file that talks to the OpenGame SDK
- `docs/TUNING.md` how to tune the flight feel

API keys for asset tools belong in a gitignored `.env` and are used only by local
scripts, never by the game at runtime.
