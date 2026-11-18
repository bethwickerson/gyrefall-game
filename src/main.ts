import "./ui/styles.css";
import manifest from "../opengame.json";
import { scenes } from "./config/scenes";
import { tuning } from "./config/tuning";
import { FixedLoop } from "./core/loop";
import { DEFAULT_NAME, platform } from "./platform/og";
import { AssetManager } from "./render/assets";
import { View } from "./render/view";
import { AudioSystem } from "./systems/audio";
import { Input } from "./systems/input";
import { Match } from "./systems/match";
import { loadSave, writeSave } from "./systems/save";
import { DebugPanel } from "./ui/debugPanel";
import { UI } from "./ui/ui";
import { buildRiftTestArena } from "./world/arena";
import { World } from "./world/world";

const boot = async (): Promise<void> => {
  const canvas = document.getElementById("game") as HTMLCanvasElement;

  // Start the SDK right away, but do not hold the first frame for it.
  const sdk = platform.init(manifest);

  const save = loadSave();
  const view = new View(canvas);
  const assets = new AssetManager(view.renderer);
  const audio = new AudioSystem();
  const input = new Input(canvas);

  // Scene one loads first. The rest wait until after the ready signal.
  const [first, ...later] = scenes;
  await assets.preload(first.assets);
  const world = new World(buildRiftTestArena());
  view.loadArena(world.arena, assets);
  audio.bind(world.events);

  const match = new Match(world, input);
  const ui = new UI(save.loadout, save.name ?? DEFAULT_NAME);
  if (save.name) ui.markNameEdited();
  const debug = new DebugPanel(document.getElementById("ui") as HTMLElement);

  let hostPaused = false;
  let menuPaused = false;
  const paused = (): boolean => hostPaused || menuPaused;
  const inPlay = (): boolean => world.phase === "match" || world.phase === "launch";
  const refreshPause = (): void => {
    ui.showPause(menuPaused && inPlay());
    audio.setPaused(paused());
    if (paused()) input.releaseLock();
  };

  // OpenGame page state.
  platform.onPause((p) => {
    hostPaused = p;
    refreshPause();
  });
  platform.onHostMute((muted) => audio.setHostMuted(muted));
  platform.onHandle((handle) => ui.suggestName(handle ?? DEFAULT_NAME));

  const launch = (): void => {
    const loadout = ui.loadout();
    writeSave({ loadout, name: save.name });
    match.start(ui.playerName(), loadout);
    view.syncFlyers(world);
    input.requestLock();
  };

  ui.onLaunch = launch;
  ui.onReplay = launch;
  ui.onLoadoutChange = (loadout) => {
    save.loadout = loadout;
    writeSave(save);
  };
  ui.onNameEdited = (name) => {
    save.name = name.trim() ? name.trim().slice(0, 20) : null;
    writeSave(save);
  };
  ui.onMenu = () => {
    menuPaused = false;
    match.toMenu();
    refreshPause();
  };
  ui.onResume = () => {
    menuPaused = false;
    refreshPause();
    input.requestLock();
  };
  ui.onFullscreen = () => platform.requestFullscreen();

  input.onPauseKey = () => {
    if (!inPlay()) return;
    menuPaused = !menuPaused;
    refreshPause();
    if (!menuPaused) input.requestLock();
  };
  input.onFullscreenKey = () => platform.requestFullscreen();
  input.onDebugKey = () => {
    debug.toggleOpen();
    if (debug.open) input.releaseLock();
  };
  debug.onToggle = (name, on) => {
    match[name] = on;
  };
  debug.getReadout = () => {
    const p = world.player;
    const head = `fps ${loop.fps.toFixed(0)}   phase ${world.phase}   t ${world.time.toFixed(1)}s   aloft ${world.aliveCount()}`;
    if (!p) return head;
    return (
      `${head}\n` +
      `speed ${p.speed.toFixed(1)}  alt ${p.pos.y.toFixed(0)}  pitch ${p.pitch.toFixed(2)}  lift ${p.lift.toFixed(1)}\n` +
      `hp ${p.health.toFixed(0)}  stamina ${p.stamina.toFixed(0)}  dive drop ${Math.max(0, p.diveStartY - p.pos.y).toFixed(0)}  shards ${p.shards}\n` +
      `band ${world.zoneFloor.toFixed(0)} to ${world.zoneCeiling.toFixed(0)}  fov ${view.camera.fov.toFixed(0)}`
    );
  };

  // Game events to HUD text.
  const nameOf = (id: number | null): string => (id === null ? "" : world.flyerById(id)?.name ?? "");
  world.events.on("phase", ({ phase }) => {
    ui.showPhase(phase as World["phase"]);
    input.enabled = phase === "launch" || phase === "match";
    if (!input.enabled) input.releaseLock();
  });
  world.events.on("strike", (e) => {
    const me = world.player?.id;
    if (e.attacker === me) ui.toast(`${e.clean ? "CLEAN STRIKE" : "GLANCING"}  ${Math.round(e.damage)}`, e.clean ? "var(--glow)" : "var(--bone)");
    else if (e.defender === me) ui.toast(`STRUCK  -${Math.round(e.damage)}`, "var(--coral)");
  });
  world.events.on("dodge", (e) => {
    const me = world.player?.id;
    if (e.defender === me) ui.toast("DODGED", "var(--glow)");
    else if (e.attacker === me) ui.toast("OVERSHOT", "var(--coral)");
  });
  world.events.on("defeat", (e) => {
    const victim = nameOf(e.victim);
    if (e.killer !== null) ui.addFeed(`${nameOf(e.killer)} struck down ${victim}`);
    else ui.addFeed(`${victim} was lost to the ${e.cause === "crash" ? "rock" : "squeeze"}`);
  });
  world.events.on("pickup", (e) => {
    if (e.flyer === world.player?.id) ui.toast(`REEF SHARD  +${Math.round(tuning.shards.power * 100)}% strike`, "var(--coral)");
  });
  match.onResult = (r) => {
    ui.showResults(r);
    void platform.submitMatch(r);
  };

  // Console handle for tuning and automated checks. Holds no player data.
  (window as unknown as Record<string, unknown>).__gyrefall = { world, match, tuning, view };

  let framesDrawn = 0;
  let readySent = false;
  const loop = new FixedLoop(
    (dt) => {
      if (!paused()) match.step(dt);
    },
    (alpha, frameDt) => {
      view.render(world, alpha, frameDt, !paused() && inPlay());
      if (inPlay()) ui.updateHud(world, input.aim, input.pointerLocked, view.camera, frameDt);
      debug.update();
      framesDrawn++;
    },
  );
  ui.showPhase("menu");
  loop.start();

  // Ready means the first playable frame is on screen and the SDK has answered.
  await sdk;
  await new Promise<void>((resolve) => {
    const wait = (): void => (framesDrawn >= 2 ? resolve() : void requestAnimationFrame(wait));
    wait();
  });
  if (!readySent) {
    readySent = true;
    platform.ready();
  }

  // Other scenes load in the background while the player is in the menu.
  for (const scene of later) {
    if (scene.available) void assets.preload(scene.assets);
  }
};

void boot();
