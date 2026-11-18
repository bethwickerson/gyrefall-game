import { og } from "@opengamehq/sdk";
import type { MatchResult } from "../systems/match";

/**
 * The only file that talks to the OpenGame SDK. Everything is safe to call
 * outside OpenGame: init resolves with no player and no services there.
 */
export const DEFAULT_NAME = "Rift Flyer";

type Handler<T> = (value: T) => void;

class Platform {
  private pauseHandlers: Handler<boolean>[] = [];
  private muteHandlers: Handler<boolean>[] = [];
  private nameHandlers: Handler<string | null>[] = [];
  private started: Promise<void> | null = null;
  private readySent = false;

  /** Start the SDK. Pass the manifest because Vite does not copy opengame.json into dist. */
  init(manifest: unknown): Promise<void> {
    this.started ??= (async () => {
      try {
        await og.init({ manifest });
      } catch (err) {
        console.warn("OpenGame SDK init failed. Continuing offline.", err);
      }
      // Each listener is called at once with the current state, then on every change.
      og.onPause((paused) => this.pauseHandlers.forEach((h) => h(paused)));
      og.audio.onHostMute((muted) => this.muteHandlers.forEach((h) => h(muted)));
      og.player.onChange((player) => this.nameHandlers.forEach((h) => h(player.handle)));
    })();
    return this.started;
  }

  /** Call once the first playable frame is on screen. */
  ready(): void {
    if (this.readySent) return;
    this.readySent = true;
    og.ready();
  }

  onPause(h: Handler<boolean>): void {
    this.pauseHandlers.push(h);
  }

  onHostMute(h: Handler<boolean>): void {
    this.muteHandlers.push(h);
  }

  /** The player's OpenGame handle, or null for a guest, a preview or outside OpenGame. */
  onHandle(h: Handler<string | null>): void {
    this.nameHandlers.push(h);
  }

  /** Must be called from a click or a key press. The page enters fullscreen for the frame. */
  requestFullscreen(): void {
    const asked = og.fullscreen.request();
    if (asked.ok) return;
    // Outside OpenGame there is no page to ask, so use the browser directly.
    const el = document.documentElement;
    if (!document.fullscreenElement) void el.requestFullscreen?.().catch(() => {});
    else void document.exitFullscreen?.().catch(() => {});
  }

  /**
   * Leaderboard stub. "matches" lists every run with XP as the score and the
   * "career" board sums it on OpenGame. No board UI exists yet.
   */
  async submitMatch(r: MatchResult): Promise<void> {
    if (!og.capabilities.includes("leaderboards")) return;
    const saved = await og.leaderboard("matches").submitRun({
      value: r.xp,
      stats: { kills: r.kills, placement: r.placement, damage: r.damage },
    });
    if (!saved.ok) console.warn("Match not saved", saved.reason ?? saved.error);
  }

  /**
   * "Your OG" rider hook. Later this will use watchAvatar from
   * "@opengamehq/sdk/avatar" and the SDK's examples/avatar-threejs to build the
   * player's OpenGame character as a rider. Read AVATAR-SPEC.md in the SDK
   * package first. Never store the avatar recipe and never alter the head,
   * colors or accessories. Until then this reports that no OG rider exists.
   */
  hasOgRider(): boolean {
    return false;
  }
}

export const platform = new Platform();
