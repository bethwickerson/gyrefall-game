import type { EventBus } from "../core/events";

/**
 * Audio stub. Final audio will be Opus or AAC at 96 to 128 kbps: music streams
 * through an <audio> element and only short effects are decoded into memory.
 * The mute and pause plumbing is live now so the host controls already work.
 */
export class AudioSystem {
  private hostMuted = false;
  private paused = false;
  private music: HTMLAudioElement | null = null;

  bind(events: EventBus): void {
    events.on("strike", () => this.play("strike"));
    events.on("dodge", () => this.play("dodge"));
    events.on("flap", () => this.play("flap"));
    events.on("pickup", () => this.play("pickup"));
    events.on("defeat", () => this.play("defeat"));
  }

  setHostMuted(muted: boolean): void {
    this.hostMuted = muted;
    if (this.music) this.music.muted = muted;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.music) return;
    if (paused) this.music.pause();
    else void this.music.play().catch(() => {});
  }

  get silent(): boolean {
    return this.hostMuted || this.paused;
  }

  /** Hook for streamed music. Pass a relative URL with exact letter case. */
  streamMusic(_url: string): void {
    // Not wired yet. Create the <audio> element here and respect this.silent.
  }

  /** Hook for short decoded effects. */
  play(_name: string): void {
    if (this.silent) return;
    // No sounds in the gray box skeleton.
  }
}
