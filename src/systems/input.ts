import { tuning } from "../config/tuning";
import { clamp } from "../core/math";
import type { FlightControls } from "../world/flyer";

/**
 * Mouse and keyboard only. The mouse moves an aim point inside a circle and
 * the flyer turns toward it. Pointer lock is used when the browser grants it.
 * Without it the aim point follows the cursor, so the game still plays.
 */
export class Input {
  readonly aim = { x: 0, y: 0 };
  private dive = false;
  private flare = false;
  private keys = new Set<string>();
  private locked = false;
  enabled = false;
  onPauseKey: () => void = () => {};
  onFullscreenKey: () => void = () => {};
  onDebugKey: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener("mousedown", (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.dive = true;
      if (e.button === 2) this.flare = true;
      if (!this.locked) this.requestLock();
      e.preventDefault();
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.dive = false;
      if (e.button === 2) this.flare = false;
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousemove", (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        const k = (tuning.input.mouseSensitivity * 2.2) / Math.min(window.innerWidth, window.innerHeight);
        this.aim.x += e.movementX * k;
        this.aim.y -= e.movementY * k;
      } else {
        const r = Math.min(window.innerWidth, window.innerHeight) * 0.36;
        this.aim.x = (e.clientX - window.innerWidth / 2) / r;
        this.aim.y = -(e.clientY - window.innerHeight / 2) / r;
      }
      const len = Math.hypot(this.aim.x, this.aim.y);
      if (len > 1) {
        this.aim.x /= len;
        this.aim.y /= len;
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      // Escape is left alone: the browser uses it to leave fullscreen and pointer lock.
      if (e.code === "KeyP") this.onPauseKey();
      if (e.code === "KeyF") this.onFullscreenKey();
      if (e.code === "Backquote") this.onDebugKey();
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.dive = false;
      this.flare = false;
    });
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  requestLock(): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      // Pointer lock is optional.
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  reset(): void {
    this.aim.x = this.aim.y = 0;
    this.dive = this.flare = false;
  }

  /** Called once per simulation tick to fill in the player's controls. */
  sample(out: FlightControls, dt: number): void {
    const t = tuning.input;
    if (this.locked) {
      const k = Math.exp(-t.aimRecenter * dt);
      this.aim.x *= k;
      this.aim.y *= k;
    }
    const dz = t.deadzone;
    const shape = (v: number): number => (Math.abs(v) < dz ? 0 : (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz));
    let x = shape(this.aim.x);
    let y = shape(this.aim.y) * (t.invertY >= 0.5 ? -1 : 1);
    // Keyboard steering adds to the mouse for players who prefer it.
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
    out.steerX = clamp(x, -1, 1);
    out.steerY = clamp(y, -1, 1);
    out.dive = this.dive;
    out.flare = this.flare || this.keys.has("Space");
    out.flap = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  }
}
