import * as THREE from 'three';

// Players who ask for reduced motion keep a steadier hand: no walk bob, sway or twirl
export const MOTION = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
const { damp, clamp } = THREE.MathUtils;

// What moves the hand holding the staff or the sword: breathing, a dip with each footstep, and a lag
// behind the view. `x`, `y` (m) and `swayX` (also a turn, rad) are offsets for the pose.
export class HandMotion {
    constructor(camera) {
        this.camera = camera;
        this.time = 0;
        this.bob = 0; // Walk bob phase
        this.bobAmount = 0;
        this.swayX = 0;
        this.swayY = 0;
        this.yaw = camera.rotation.y;
        this.pitch = camera.rotation.x;
        this.x = 0;
        this.y = 0;
    }

    // `speed`: the player's walking speed (m/s, 0 in the air)
    update(dt, speed) {
        this.time += dt;
        // One dip per footstep (Player plays one every 2.2 m)
        this.bob += speed * dt * Math.PI / 2.2;
        this.bobAmount = damp(this.bobAmount, Math.min(1, speed / 10) * MOTION, 8, dt);
        const cam = this.camera.rotation;
        if (dt > 0) {
            this.swayX = damp(this.swayX, clamp((cam.y - this.yaw) / dt * 0.012, -0.05, 0.05) * MOTION, 10, dt);
            this.swayY = damp(this.swayY, clamp((cam.x - this.pitch) / dt * -0.012, -0.04, 0.04) * MOTION, 10, dt);
        }
        this.yaw = cam.y;
        this.pitch = cam.x;
        const t = this.time;
        this.x = Math.sin(t * 1.1) * 0.006 + Math.sin(this.bob) * 0.012 * this.bobAmount + this.swayX;
        this.y = Math.sin(t * 2) * 0.012 - Math.abs(Math.cos(this.bob)) * 0.018 * this.bobAmount + this.swayY;
    }
}
