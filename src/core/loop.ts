/** Fixed timestep simulation with a render callback that receives the blend factor. */
export class FixedLoop {
  readonly step = 1 / 60;
  private acc = 0;
  private last = 0;
  private running = false;
  /** Smoothed frames per second, for the debug panel. */
  fps = 60;

  constructor(
    private simulate: (dt: number) => void,
    private render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      requestAnimationFrame(tick);
      // Clamp so a hidden tab or a long stall cannot spiral the simulation.
      const frameDt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      if (frameDt > 0) this.fps += (1 / frameDt - this.fps) * 0.05;
      this.acc += frameDt;
      let steps = 0;
      while (this.acc >= this.step && steps < 6) {
        this.simulate(this.step);
        this.acc -= this.step;
        steps++;
      }
      if (steps === 6) this.acc = 0;
      this.render(this.acc / this.step, frameDt);
    };
    requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
  }
}
