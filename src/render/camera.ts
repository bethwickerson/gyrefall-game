import { PerspectiveCamera, Vector3 } from "three";
import { tuning } from "../config/tuning";
import { clamp, damp, forwardFrom, smoothstep } from "../core/math";
import { wallDistance, type Arena } from "../world/arena";

const fwd = new Vector3();
const want = new Vector3();
const look = new Vector3();

/** Third person chase camera. The field of view widens with speed in a dive. */
export class ChaseCamera {
  private lookAt = new Vector3();
  private snapped = false;

  constructor(readonly camera: PerspectiveCamera) {}

  snap(): void {
    this.snapped = false;
  }

  update(arena: Arena, pos: Vector3, yaw: number, pitch: number, speed: number, diving: boolean, dt: number): void {
    const c = tuning.camera;
    // Follow most of the pitch so a dive looks down the line of attack.
    forwardFrom(fwd, yaw, pitch * 0.75);
    want.copy(pos).addScaledVector(fwd, -c.distance);
    want.y += c.height;
    look.copy(pos).addScaledVector(fwd, c.lookAhead);

    // Keep the camera inside the chasm.
    for (let i = 0; i < 4 && wallDistance(arena, want.x, want.y, want.z) > -3; i++) {
      want.x = pos.x + (want.x - pos.x) * 0.7;
      want.z = pos.z + (want.z - pos.z) * 0.7;
    }
    want.y = Math.max(want.y, 3);

    if (!this.snapped) {
      this.camera.position.copy(want);
      this.lookAt.copy(look);
      this.snapped = true;
    } else {
      const k = 1 - Math.exp(-c.stiffness * dt);
      this.camera.position.lerp(want, k);
      this.lookAt.lerp(look, 1 - Math.exp(-c.stiffness * 1.6 * dt));
    }
    this.camera.lookAt(this.lookAt);

    const widen = smoothstep(c.fovSpeedStart, c.fovSpeedEnd, speed) * (diving ? 1 : 0.55);
    const fov = clamp(c.baseFov + (c.diveFov - c.baseFov) * widen, 30, 120);
    const next = damp(this.camera.fov, fov, c.fovRate, dt);
    if (Math.abs(next - this.camera.fov) > 0.01) {
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Slow orbit used behind the menu and the results screen. */
  orbit(arena: Arena, time: number): void {
    const a = time * 0.06;
    this.camera.position.set(Math.cos(a) * arena.halfX * 0.45, 330 + Math.sin(time * 0.1) * 20, Math.sin(a) * arena.halfZ * 0.6);
    this.lookAt.set(0, 250, 0);
    this.camera.lookAt(this.lookAt);
    if (this.camera.fov !== tuning.camera.baseFov) {
      this.camera.fov = tuning.camera.baseFov;
      this.camera.updateProjectionMatrix();
    }
    this.snapped = false;
  }
}
