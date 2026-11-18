import { Vector3, type PerspectiveCamera } from "three";
import { armors, mounts, riders, type LoadoutChoice } from "../config/loadouts";
import { tuning } from "../config/tuning";
import { clamp } from "../core/math";
import type { MatchResult } from "../systems/match";
import type { World } from "../world/world";

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

const CONTROLS: Array<[string, string]> = [
  ["Mouse", "Steer"],
  ["Hold left click", "Dive. Fold wings and trade height for speed"],
  ["Right click or Space", "Flare. Air brake and last moment dodge"],
  ["Shift", "Flap. Spend stamina for speed and lift"],
  ["P", "Pause"],
  ["F", "Fullscreen"],
  ["`", "Tuning panel"],
];

const proj = new Vector3();

/** Menu, HUD, pause and results. Plain DOM over the canvas so it scales with the window. */
export class UI {
  private root: HTMLElement;
  private menu = h("div", "screen");
  private results = h("div", "screen hidden");
  private pause = h("div", "screen hidden");
  private hud = h("div", "hud hidden");
  readonly nameInput = h("input");
  private selects: Record<keyof LoadoutChoice, HTMLSelectElement>;
  private nameEdited = false;

  private healthFill = h("i");
  private staminaFill = h("i");
  private shardLabel = h("div", "label");
  private aliveLabel = h("div", "alive");
  private zoneLabel = h("div", "label");
  private feed = h("div", "feed");
  private storm = h("div", "storm");
  private mist = h("div", "mist");
  private meTick = h("div", "me");
  private botTicks: HTMLElement[] = [];
  private ladder = h("div", "ladder");
  private nums = h("div", "nums");
  private tags = h("div", "tags");
  private aimDot = h("i");
  private toastEl = h("div", "toast");
  private toastTimer = 0;
  private countdown = h("div", "countdown hidden");
  private hint = h("div", "hint", "Click to capture the mouse");
  private markers: Array<{ el: HTMLElement; label: HTMLElement }> = [];
  private vignette = h("div", "vignette");
  private resultsBody = h("div");
  private lastTags = "";

  onLaunch: (name: string, loadout: LoadoutChoice) => void = () => {};
  onLoadoutChange: (loadout: LoadoutChoice) => void = () => {};
  onNameEdited: (name: string) => void = () => {};
  onReplay: () => void = () => {};
  onMenu: () => void = () => {};
  onResume: () => void = () => {};
  onFullscreen: () => void = () => {};

  constructor(initialLoadout: LoadoutChoice, defaultName: string) {
    this.root = document.getElementById("ui") as HTMLElement;
    this.selects = { mount: h("select"), rider: h("select"), armor: h("select") };
    this.buildMenu(initialLoadout, defaultName);
    this.buildHud();
    this.buildPause();
    this.buildResults();
    this.root.append(this.hud, this.menu, this.results, this.pause);
  }

  private controlsList(): HTMLElement {
    const grid = h("div", "controls");
    for (const [key, what] of CONTROLS) grid.append(h("b", "", key), h("span", "", what));
    return grid;
  }

  private buildMenu(initial: LoadoutChoice, defaultName: string): void {
    const panel = h("div", "panel");
    panel.append(h("h1", "title", "GYREFALL"));
    panel.append(h("p", "tagline", "Ten flyers. One wound in the world. No projectiles: climb, dive and strike."));

    const nameRow = h("div", "row");
    const nameLabel = h("label", "", "Flyer name");
    nameLabel.htmlFor = "flyer-name";
    this.nameInput.id = "flyer-name";
    this.nameInput.maxLength = 20;
    this.nameInput.autocomplete = "off";
    this.nameInput.spellcheck = false;
    this.nameInput.value = defaultName;
    this.nameInput.addEventListener("input", () => {
      this.nameEdited = true;
      this.onNameEdited(this.nameInput.value);
    });
    nameRow.append(nameLabel, this.nameInput);
    panel.append(nameRow);

    const slots: Array<[keyof LoadoutChoice, string, Array<{ id: string; name: string; blurb: string }>]> = [
      ["mount", "Mount", mounts],
      ["rider", "Rider", riders],
      ["armor", "Mount armor", armors],
    ];
    for (const [slot, label, list] of slots) {
      const row = h("div", "row");
      const lab = h("label", "", label);
      const sel = this.selects[slot];
      sel.id = `slot-${slot}`;
      lab.htmlFor = sel.id;
      for (const item of list) {
        const opt = h("option", "", item.name);
        opt.value = item.id;
        sel.append(opt);
      }
      sel.value = initial[slot];
      const blurb = h("p", "blurb");
      const refresh = (): void => {
        blurb.textContent = list.find((x) => x.id === sel.value)?.blurb ?? "";
      };
      sel.addEventListener("change", () => {
        refresh();
        this.onLoadoutChange(this.loadout());
      });
      refresh();
      row.append(lab, sel, blurb);
      panel.append(row);
    }

    const buttons = h("div", "buttons");
    const launch = h("button", "btn primary", "Launch");
    launch.addEventListener("click", () => this.onLaunch(this.playerName(), this.loadout()));
    const fs = h("button", "btn", "Fullscreen");
    fs.addEventListener("click", () => this.onFullscreen());
    buttons.append(launch, fs);
    panel.append(buttons, this.controlsList());
    this.menu.append(panel);
  }

  private buildHud(): void {
    const vitals = h("div", "vitals");
    const hb = h("div", "bar health");
    hb.append(this.healthFill);
    const sb = h("div", "bar stamina");
    sb.append(this.staminaFill);
    vitals.append(hb, sb, this.shardLabel);

    const top = h("div", "top");
    top.append(this.aliveLabel, this.zoneLabel);

    this.ladder.append(this.storm, this.mist);
    for (let i = 0; i < 12; i++) {
      const t = h("div", "tick hidden");
      this.botTicks.push(t);
      this.ladder.append(t);
    }
    this.ladder.append(this.meTick);

    const flight = h("div", "flight");
    flight.append(this.nums, this.tags);

    const reticle = h("div", "reticle");
    reticle.append(this.aimDot);

    this.hud.append(this.vignette, vitals, top, this.feed, this.ladder, flight, reticle, this.toastEl, this.countdown, this.hint);
    for (let i = 0; i < 12; i++) {
      const el = h("div", "marker hidden");
      const label = h("span");
      el.append(label);
      this.markers.push({ el, label });
      this.hud.append(el);
    }
  }

  private buildPause(): void {
    const panel = h("div", "panel");
    panel.append(h("h1", "title", "PAUSED"), h("p", "tagline", "Press P to resume."));
    const buttons = h("div", "buttons");
    const resume = h("button", "btn primary", "Resume");
    resume.addEventListener("click", () => this.onResume());
    const fs = h("button", "btn", "Fullscreen");
    fs.addEventListener("click", () => this.onFullscreen());
    const quit = h("button", "btn", "Quit to menu");
    quit.addEventListener("click", () => this.onMenu());
    buttons.append(resume, fs, quit);
    panel.append(buttons, this.controlsList());
    this.pause.append(panel);
  }

  private buildResults(): void {
    const panel = h("div", "panel");
    const buttons = h("div", "buttons");
    const replay = h("button", "btn primary", "Fly again");
    replay.addEventListener("click", () => this.onReplay());
    const menu = h("button", "btn", "Menu");
    menu.addEventListener("click", () => this.onMenu());
    buttons.append(replay, menu);
    panel.append(this.resultsBody, buttons);
    this.results.append(panel);
  }

  loadout(): LoadoutChoice {
    return { mount: this.selects.mount.value, rider: this.selects.rider.value, armor: this.selects.armor.value };
  }

  playerName(): string {
    return this.nameInput.value.trim().slice(0, 20) || this.nameInput.placeholder || "Flyer";
  }

  /** Fill the name from the OpenGame handle until the player types their own. */
  suggestName(name: string): void {
    this.nameInput.placeholder = name;
    if (!this.nameEdited) this.nameInput.value = name;
  }

  markNameEdited(): void {
    this.nameEdited = true;
  }

  showPhase(phase: World["phase"]): void {
    this.menu.classList.toggle("hidden", phase !== "menu");
    this.results.classList.toggle("hidden", phase !== "results");
    this.hud.classList.toggle("hidden", phase !== "launch" && phase !== "match");
    if (phase === "launch") this.feed.replaceChildren();
  }

  showPause(on: boolean): void {
    this.pause.classList.toggle("hidden", !on);
  }

  showResults(r: MatchResult): void {
    const mins = Math.floor(r.time / 60);
    const secs = Math.floor(r.time % 60).toString().padStart(2, "0");
    this.resultsBody.replaceChildren(
      h("h1", "title", r.won ? "LAST ALOFT" : "FALLEN"),
      h("p", "tagline", `Placed ${r.placement} of ${r.total}`),
    );
    const stats = h("div", "stats");
    const rows: Array<[string, string]> = [
      ["Takedowns", String(r.kills)],
      ["Strike damage", String(r.damage)],
      ["Reef shards", String(r.shards)],
      ["Time aloft", `${mins}:${secs}`],
      ["XP earned", String(r.xp)],
    ];
    for (const [k, v] of rows) {
      const s = h("div", "stat");
      s.append(h("div", "v", v), h("div", "k", k));
      stats.append(s);
    }
    this.resultsBody.append(stats);
  }

  toast(text: string, color = "var(--bone)"): void {
    this.toastEl.textContent = text;
    this.toastEl.style.color = color;
    this.toastEl.classList.add("show");
    this.toastTimer = 1.1;
  }

  addFeed(text: string): void {
    this.feed.prepend(h("div", "", text));
    while (this.feed.childElementCount > 5) this.feed.lastElementChild?.remove();
  }

  updateHud(world: World, aim: { x: number; y: number }, pointerLocked: boolean, camera: PerspectiveCamera, dt: number): void {
    const p = world.player;
    if (!p) return;
    const t = tuning;

    this.healthFill.style.transform = `scaleX(${clamp(p.health / p.stats.healthMax, 0, 1)})`;
    this.staminaFill.style.transform = `scaleX(${clamp(p.stamina / (t.flight.staminaMax * p.stats.staminaMul), 0, 1)})`;
    this.shardLabel.textContent = `Reef shards ${p.shards}  ·  strike +${Math.round(p.shards * t.shards.power * 100)}%`;
    this.aliveLabel.textContent = `${world.aliveCount()} ALOFT`;

    const band = world.zoneCeiling - world.zoneFloor;
    if (world.phase === "launch") this.zoneLabel.textContent = "Launching";
    else if (world.time < t.zone.delay) this.zoneLabel.textContent = `Squeeze begins in ${Math.ceil(t.zone.delay - world.time)}s`;
    else this.zoneLabel.textContent = `Open sky ${Math.max(0, Math.round(band))} m`;

    this.countdown.classList.toggle("hidden", world.phase !== "launch");
    if (world.phase === "launch") this.countdown.textContent = String(Math.max(1, Math.ceil(world.launchTimer)));

    // Altitude ladder: storm above, fog below, everyone as a tick.
    const top = world.arena.height;
    const pct = (y: number): number => clamp(1 - y / top, 0, 1) * 100;
    this.storm.style.height = `${pct(world.zoneCeiling)}%`;
    this.mist.style.height = `${100 - pct(world.zoneFloor)}%`;
    this.meTick.style.top = `${pct(p.pos.y)}%`;
    let tick = 0;
    let mark = 0;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    for (const f of world.flyers) {
      if (f.isPlayer || !f.alive) continue;
      const tickEl = this.botTicks[tick++];
      if (tickEl) {
        tickEl.classList.remove("hidden");
        tickEl.style.top = `${pct(f.pos.y)}%`;
      }
      const m = this.markers[mark];
      if (!m) continue;
      proj.copy(f.pos).project(camera);
      if (proj.z > 1 || Math.abs(proj.x) > 1 || Math.abs(proj.y) > 1) continue;
      mark++;
      const dist = f.pos.distanceTo(p.pos);
      const threat = f.diving && f.pos.y > p.pos.y && dist < 120;
      m.el.classList.remove("hidden");
      m.el.classList.toggle("threat", threat);
      m.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * hgt}px) rotate(45deg)`;
      m.label.textContent = `${Math.round(dist)}m`;
    }
    for (; tick < this.botTicks.length; tick++) this.botTicks[tick].classList.add("hidden");
    for (; mark < this.markers.length; mark++) this.markers[mark].el.classList.add("hidden");

    this.nums.textContent = `${Math.round(p.speed)} m/s   ·   ${Math.round(p.pos.y)} m`;
    const tags: string[] = [];
    if (p.diving) tags.push(`<span>DIVE  ${Math.round(Math.max(0, p.diveStartY - p.pos.y))} m</span>`);
    if (p.inUpdraft) tags.push('<span class="good">UPDRAFT</span>');
    if (p.speed < t.flight.stallSpeed) tags.push('<span class="warn">STALL</span>');
    if (p.outOfZone) tags.push(`<span class="warn">${p.pos.y > world.zoneCeiling ? "STORM" : "FOG"}</span>`);
    if (p.stun > 0) tags.push('<span class="warn">STUNNED</span>');
    const html = tags.join("");
    if (html !== this.lastTags) {
      this.tags.innerHTML = html;
      this.lastTags = html;
    }

    this.aimDot.style.transform = `translate(calc(var(--u) * ${(aim.x * 8).toFixed(2)}), calc(var(--u) * ${(-aim.y * 8).toFixed(2)}))`;
    this.hint.classList.toggle("hidden", pointerLocked || world.phase !== "match");
    this.vignette.style.opacity = p.outOfZone ? "1" : "0";

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove("show");
    }
  }
}
